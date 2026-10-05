# Spike：uni-app Vue 2（webpack）mp 构建的探针可行性

验证「devframe 框架下支持 webpack + Vue 2」这条路线里唯一的阻塞项 **S1**，
并为 **S2** 提供真机自检入口。

讨论记录（R1–R3 + spike 双线取证）：`~/.seedmux/team/discussions/D-20261005-webpack-vue2/`

## 结论（S1 已关闭）

**uni-app Vue 2 的 mp 构建保留 `__file` 与组件名，零编译期插桩（Zero-Instrument）成立。**

产物实测（`dist/dev/mp-weixin`）：

```
components/AnonChild.js:38   component.options.__file = "components/AnonChild.vue"
components/NamedChild.js:36  component.options.__file = "components/NamedChild.vue"
pages/index/index.js:63      component.options.__file = "pages/index/index.vue"
common/main.js:67            component.options.__file = "App.vue"
```

`AnonChild.vue` 是**故意不写 `name`** 的匿名组件，仍拿到 `__file`。对照组
`NamedChild.vue` 的 `name: 'NamedChild'` 也原样保留。

写入点是 DCloud 打过补丁的 vue-loader：
`@dcloudio/vue-cli-plugin-uni/packages/vue-loader/lib/index.js:234-237`（开发态无条件写入）。
uni-app 自己运行时的命名兜底链（`common/vendor.js` 的 `formatComponentName`）与现有探针
`packages/devframe/src/agent/tree.ts:116` 的 `getComponentDisplayName` 是同一套策略。

**对实现的影响**：`packages/devframe/src/instrument.ts` 整层（`__file` 注入 + 闭包绑定捕获 +
render 钩子包装）在 Vue 2 线**全部不需要**；webpack 插件收敛为「入口注入 `initAgent()` +
启动 sidecar」。

**注意一个坑**：`__file` 的值是**相对 `UNI_INPUT_DIR`（= `src/`）的相对路径**，而 Vue 3/Vite 线
由 `instrument.ts` 注入的是绝对路径。`openInEditor` 依赖绝对路径，所以 webpack 插件必须把
`UNI_INPUT_DIR` 一并注入探针配置，否则组件树命名正常但「点文件名跳编辑器」会失效。

## 怎么跑

```bash
cd spike/uni-vue2-webpack
npm run setup            # 装依赖 + 修一处解析遮蔽
npm run dev:mp-weixin    # 产出 dist/dev/mp-weixin
```

> `npm run dev:mp-weixin` 等价于 `bash scripts/build.sh`，后者会设好 uni 需要的环境变量。
> **不要**直接跑 `vue-cli-service uni-build`（会报 `ERR_INVALID_ARG_TYPE`，见踩坑表）。

然后用**微信开发者工具**导入 `dist/dev/mp-weixin`。

### 真机预览需要真实 appid

产物里 `project.config.json` 的 `appid` 是 `touristappid`（游客模式），**游客模式不支持真机预览**。
换成你自己的测试号 appid：改 `src/manifest.json` 的 `mp-weixin.appid` 后重新 `build`，
或直接改 `dist/dev/mp-weixin/project.config.json`。

### 环境要求

- **node 16 / 18 / 20**（webpack 4 在 node ≥ 22 上会崩，`setup.sh` 会拦）
- 本项目只验证了 **CLI 工程**；HBuilderX 内置构建链未验证（讨论记录里的 S4）

## 探针自检页

首页有一个「探针自检」按钮，点一下会列出 devframe Vue 2 探针依赖的运行时字段。
**已在真机（微信开发者工具，基础库 3.17.2）跑过，结果如下：**

| 自检项 | 实测 | 判定 |
| --- | --- | --- |
| `page.$vm 存在` | `true`（object） | ✅ S2 关闭：页面实例可拿到 Vue 实例 |
| `vm.$options.__file` | `pages/index/index.vue` | ✅ 命名兜底可用 |
| `vm._uid` | `1` | ✅ Vue 2 用 `_uid`（Vue 3 是 `uid`） |
| `vm.$children 是数组` | `true`，length 2 | ✅ `tree.ts:154` 首选路径直接可用 |
| `vm._isDestroyed` | `false` | ✅ Vue 2 用 `_isDestroyed`（Vue 3 是 `isUnmounted`） |
| `$children[0]`（匿名组件） | `name=(空)` → `兜底名=AnonChild` | ✅ 匿名命名链路走通 |
| `$children[1]`（具名） | `name=NamedChild` | ✅ `$options.name` 可用 |
| `setupState` / `_setupState` | 均 `undefined` | ✅ 确认 2.6 线，无 Composition API |

> `$children` 只含 Vue 组件（length=2，原生 `button` 不在内），与 Vue 3 语义一致。

### 由此定稿的 `tree.ts` Vue 2 改造清单

| 现有（Vue 3） | Vue 2 等价 |
| --- | --- |
| `internal.type` | `vm.$options` |
| `internal.uid` | `vm._uid` |
| `internal.vnode` | `vm.$vnode` |
| `internal.isUnmounted` | `vm._isDestroyed` |
| `internal.setupState` | 无（2.6）；2.7 为 `vm._setupState` |

`findChildVMs`（`tree.ts:154-174`）与 `getComponentDisplayName`（`tree.ts:116-123`）
**均无需改动**——前者已优先走 `vm.$children`，后者只要 `typeObj` 传 `vm.$options` 即可
（`name → __file basename` 兜底链与 uni 运行时的 `formatComponentName` 同构）。

## 踩坑记录（搭 webpack 适配器时可直接参考）

| 坑 | 现象 | 处理 |
| --- | --- | --- |
| `UNI_CLI_CONTEXT` 未设 | `ERR_INVALID_ARG_TYPE: The "path" argument must be of type string. Received undefined` | uni 自身的时序 bug：`lib/env.js:90` 调 `plugin.init()` 读该变量，却到 `:194` 才赋值。`build.sh` 显式导出。**对实现有影响**：webpack 插件若依赖用户自己跑 `uni-build`，得替他们把变量设上 |
| core-js polyfill 注入 | **构建成功但小程序白屏**：`TypeError: Cannot read property 'prototype' of undefined` @ `vendor.js`（`$DOMException.prototype = NativeDOMException.prototype`） | `@vue/app` preset 默认 `useBuiltIns: 'usage'`，把 npm 解析到的 `core-js@3.50` 按需注入；其 DOMException polyfill 在小程序沙箱（无 `globalThis.DOMException`）直接崩。`babel.config.js` 设 `useBuiltIns: false`——小程序 JSCore 本身支持 ES2015+，不需要 polyfill。**对实现有影响**：webpack 线的模板/文档必须交代这一条 |
| Node 版本 | node 22 下 webpack 4 崩 | 用 node 16/18/20（`setup.sh` 拦截） |
| `/tmp` 符号链接 | `getModuleId` 报 `reading 'id'`，`uniModule` 找不到 | macOS `/tmp` → `/private/tmp`：`require.resolve` 返回 realpath 而 webpack 的 `module.resource` 不是，路径比对失败。`build.sh` 用 `pwd -P` 取 realpath |
| 缺 peer 依赖 | 依次报 `uni-cli-i18n` / `uni-i18n` / `regenerator-runtime` 缺失 | uni 未把它们声明为依赖，`package.json` 里显式列出 |
| 模板编译 | `Export 'recyclableRender' is not defined` | `packages/vue-loader` 依赖 uni 补丁版 `@vue/component-compiler-utils@3.1.0`，被根目录 vanilla 3.3.0 遮蔽。`setup.sh` 软链修正 |
| 缺配置文件 | 报缺 `postcss.config.js` / `babel.config.js` | 已按 uni-app 标准模板补齐 |

## 关于 Vue 版本

`vue` / `vue-template-compiler` 固定 `~2.6.14`。mp 构建实际使用的运行时是
uni 自带的 `@dcloudio/vue-cli-plugin-uni/packages/mp-vue@2.6.10`（插件把 `vue` 别名到它），
即真正的 **Vue 2.6 线**，无 Composition API。

## 未覆盖

- **S4**：HBuilderX 工作流（无可编程 webpack 配置）未验证
- Vuex / Pinia 采集、页面栈、网络采集均未在本 spike 验证
- 生产构建（`NODE_ENV=production`）：`__file` 只在 `!isProduction` 写入，
  devtools 本身 dev-only，与「生产零残留」约束天然一致
