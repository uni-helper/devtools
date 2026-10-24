# uni-app Vue 2（webpack）小程序示例

验证与调试 uni-app Vue 2 + webpack 4 探针与构建链能力。

## 结论（S1 已闭环）

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
`packages/probes/src/runtime/tree.ts:177` 的 `getComponentDisplayName` 是同一套策略。

**对实现的影响**：`packages/vite/src/instrument.ts` 整层（`__file` 注入 + 闭包绑定捕获 +
render 钩子包装）在 Vue 2 线**全部不需要**；webpack 插件收敛为「入口注入 `initAgent()` +
启动 sidecar」。

**注意一个坑**：`__file` 的值是**相对 `UNI_INPUT_DIR`（= `src/`）的相对路径**，而 Vue 3/Vite 线
由 `instrument.ts` 注入的是绝对路径。`openInEditor` 依赖绝对路径，所以 webpack 插件必须把
`UNI_INPUT_DIR` 一并注入探针配置，否则组件树命名正常但「点文件名跳编辑器」会失效。

## 怎么跑

```bash
cd playground/vue2-webpack
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

- **node ≥ 20.19（或 ≥ 22.12）**，`setup.sh` 会拦。原因：`vue.config.js` 是 CJS，用 `require()`
  加载 ESM-only 的 `@uni-helper/devtools-webpack`，依赖 node 的 `require(esm)`——它在
  node 20.19+ / 22.12+ 默认开启。低版本报 `ERR_REQUIRE_ESM`（实测 node 20.9.0 失败）。
- 本项目只验证了 **CLI 工程**；HBuilderX 内置构建链未验证（S4）

> 早期版本（CJS 产物形态）在 node ≥ 22 上会崩，因此曾限制在 16/18/20；现在插件改为 ESM-only
> 后实测 node **22.22.0** dev 构建通过，拦截条件已相应改为「必须支持 `require(esm)`」。

## 探针自检页

首页有一个「探针自检」按钮，点一下会列出 devframe Vue 2 探针依赖的运行时字段。
**已在真机（微信开发者工具，基础库 3.17.2）跑过，结果如下：**

| 自检项 | 实测 | 判定 |
| --- | --- | --- |
| `page.$vm 存在` | `true`（object） | ✅ S2 关闭：页面实例可拿到 Vue 实例 |
| `vm.$options.__file` | `pages/index/index.vue` | ✅ 命名兜底可用 |
| `vm._uid` | `1` | ✅ Vue 2 用 `_uid`（Vue 3 是 `uid`） |
| `vm.$children 是数组` | `true`，length 2 | ✅ `tree.ts:215` 首选路径直接可用 |
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

`findChildVMs`（`tree.ts:215-238`）与 `getComponentDisplayName`（`tree.ts:177-181`）
**均无需改动**——前者已优先走 `vm.$children`，后者只要 `typeObj` 传 `vm.$options` 即可
（`name → __file basename` 兜底链与 uni 运行时的 `formatComponentName` 同构）。

## 踩坑记录（搭 webpack 适配器时可直接参考）

| 坑 | 现象 | 处理 |
| --- | --- | --- |
| `UNI_CLI_CONTEXT` 未设 | `ERR_INVALID_ARG_TYPE: The "path" argument must be of type string. Received undefined` | uni 自身的时序 bug：`lib/env.js:90` 调 `plugin.init()` 读该变量，却到 `:194` 才赋值。`build.sh` 显式导出。**对实现有影响**：webpack 插件若依赖用户自己跑 `uni-build`，得替他们把变量设上 |
| core-js polyfill 注入 | **构建成功但小程序白屏**：`TypeError: Cannot read property 'prototype' of undefined` @ `vendor.js`（`$DOMException.prototype = NativeDOMException.prototype`） | `@vue/app` preset 默认 `useBuiltIns: 'usage'`，把 npm 解析到的 `core-js@3.50` 按需注入；其 DOMException polyfill 在小程序沙箱（无 `globalThis.DOMException`）直接崩。`babel.config.js` 设 `useBuiltIns: false`——小程序 JSCore 本身支持 ES2015+，不需要 polyfill。**对实现有影响**：webpack 线的模板/文档必须交代这一条 |
| Node 版本 | 旧 CJS 产物形态下 node 22 会崩；ESM-only 后 node < 20.19 报 `ERR_REQUIRE_ESM` | 用 node ≥ 20.19（或 ≥ 22.12），`setup.sh` 拦截 |
| `/tmp` 符号链接 | `getModuleId` 报 `reading 'id'`，`uniModule` 找不到 | macOS `/tmp` → `/private/tmp`：`require.resolve` 返回 realpath 而 webpack 的 `module.resource` 不是，路径比对失败。`build.sh` 用 `pwd -P` 取 realpath |
| 缺 peer 依赖 | 依次报 `uni-cli-i18n` / `uni-i18n` / `regenerator-runtime` 缺失 | uni 未把它们声明为依赖，`package.json` 里显式列出 |
| 模板编译 | `Export 'recyclableRender' is not defined` | `packages/vue-loader` 依赖 uni 补丁版 `@vue/component-compiler-utils@3.1.0`，被根目录 vanilla 3.3.0 遮蔽。`setup.sh` 软链修正 |
| 缺配置文件 | 报缺 `postcss.config.js` / `babel.config.js` | 已按 uni-app 标准模板补齐 |

## 关于 Vue 版本

`vue` / `vue-template-compiler` 固定 `~2.6.14`。mp 构建实际使用的运行时是
uni 自带的 `@dcloudio/vue-cli-plugin-uni/packages/mp-vue@2.6.10`（插件把 `vue` 别名到它），
即真正的 **Vue 2.6 线**，无 Composition API。

## 复杂使用场景（压依赖收集 / 数据捕捉）

首页「复杂使用场景」三个按钮进入。这三页**不是功能演示，是采集能力的压力测试**：
用尽可能刁钻的数据形状和组件结构，看探针能不能完整、稳定地把状态搬到面板上。

### ① 数据捕捉压测（`pages/state/state`）

| 场景 | 压的是什么 | 期望 |
| --- | --- | --- |
| 三层嵌套对象 `profile.address.geo.meta` | 递归序列化 | 面板能看到全部层级 |
| DeepA → DeepB → DeepC 三层组件链 | 组件树深度 + props 链 | 三层都出现在树里；`DeepC` 匿名，靠 `__file` 兜底命名 |
| `todos` 对象数组 + `v-for` 复用同一匿名组件 | 同组件多实例的 id 区分 | 每个实例有独立 id（来自 `_uid`） |
| `Vue.set` / `Vue.delete` 动态键 | 新增/删除键的响应式 | 面板刷新后键跟着增减 |
| mixin（`mixinCount` / `mixinDoubled`） | `resolveMergedOptions` 的合并链 | mixin 的 data 与 computed 都要出现 |
| computed 链 `total → doneCount → progress` | computed 求值 | 三个值都正确 |

**面板里可以试着就地编辑**：`profile.address.geo.lat`（嵌套路径）、`todos` 数组元素
（Vue 2 数组下标赋值走 `splice`，见 `instance.ts` 的 `setReactive`）、以及用 `$set` 建出来的动态键。

### ② 序列化边界压测（`pages/state/edge`）

把 `toSafeJsonValue`（`serialize.ts`）的每条分支都点一遍：

| 输入 | 期望降级 |
| --- | --- |
| `Date` | ISO 字符串 |
| `RegExp` | `toString()` |
| `BigInt` | 字符串 |
| `NaN` / `Infinity` | `null`（JSON 本身的限制） |
| `undefined` | 键消失（对象）/ `null`（数组元素） |
| `Error` | `{ name, message }` |
| 数组里的函数 | 被跳过 |
| 顶层函数值键 / 嵌套函数值键 | 整个键不出现 |
| 嵌套层 `_` / `$` 前缀键 | 被丢弃（`toSafeJsonValue` 的键过滤） |
| 循环引用 | `"<circular-reference>"` |
| 深度 > 6 | `"<max-depth-reached>"` |

### ③ 依赖关系 + 响应式压测（`pages/reactivity/reactivity`）

| 场景 | 期望 |
| --- | --- |
| computed 链 `base → doubled → quadrupled` | 值正确；**但看不到「谁依赖谁」**，见下节 |
| 带 setter 的 computed `editableTotal` | 面板应把 `editable` 标为 true |
| `v-for` + 子组件直接改 props 对象（`PriceRow`） | 父数组元素被子组件改动后，父组件状态同步更新 |
| `deep: true` 的 watcher | `watchHits` / `watchLog` 递增 |
| `v-if` / `v-else` 切换 `PanelA` / `PanelB` | 切走的实例应从组件树里消失 |
| 默认 / 具名 / 作用域插槽 | 插槽内容正常渲染 |
| 1 秒定时器改 `tick` | 面板能在无事件可听时靠快照轮询（2s 间隔）跟上变化 |

两个 **uni-app mp 的写法约束**（踩过一次）：

- **不支持 `<component :is>`**，所以「动态组件」用 `v-if` / `v-else` 分支切换替代。
- **作用域插槽必须用 `v-slot` 解构写法**（`v-slot:row="{ label, index }"`）。
  用旧的 `slot-scope="props"` 会在模板编译期直接报
  `Currently only supports destructuring slot props`。

### props 编辑：mp 下改走宿主 setData

在面板里改 props 曾经是「面板显示成功、视图纹丝不动」。根因与修法：

- 官方 Vue DevTools（Vue 2 的 7.x 与 Vue 3 的 9.x）和探针原本都是**直接写组件实例的
  props 对象**（`instance.props` / `vm.$props`），这在浏览器里生效。
- 但 mp 下 props 的**渲染真源是宿主组件的 `properties`**（由父组件 WXML 绑定控制），
  Vue 侧那份只是镜像。mp-vue 构造 setData 载荷的 `cloneWithData` 只收 `$data` 与
  computed——**不含 props**，所以写 Vue 侧即使触发了重渲染也到不了视图。
- 更糟的是宿主 `properties` 的 observer（`this.$vm[name] = newVal`）会在父组件更新时
  把 `vm._props` 覆写回去，编辑被静默丢掉；而面板重拉状态读的正是 `vm.$props`，
  于是出现「面板显示新值 → 视图没变 → 过一会又变回去」的三态不一致。
- **修复**：探针检测到 mp 运行时（`vm.$scope` 存在）时，改为写宿主
  `setData({ [prop]: value })`；嵌套路径用宿主支持的 `a.b[0].c` 写法。视图直接更新，
  再经 observer 回流到 `vm._props`。H5 / 浏览器保持原路径不变。

**怎么测**：在面板里改一个 prop，视图应当立刻跟着变。可用的样本：

| 组件 | prop | 类型 | 路径形态 |
| --- | --- | --- | --- |
| `AnonChild`（首页） | `from` | String | 顶层，整值替换 |
| `DeepA`（场景①） | `payload` | Object | 嵌套，如 `payload.name` |
| `ListRow`（场景①） | `item` | Object | 嵌套，如 `item.done` |
| `PriceRow`（场景③） | `item` | Object | 嵌套，如 `item.qty` |

顶层 prop（`from`）走的是「整值 setData → 触发宿主 observer → 回流 `vm._props`」这条完整链路，
最能验证修复是否生效。

### Vue 2 线拿不到依赖图（已知差异，非本示例的 bug）

`getComponentState` 返回的 `reactivityGraph` 字段在 Vue 2 线上**不会出现**，原因是结构性的：

1. `reactivity-graph.ts` 沿 Vue 3.5+ 的响应式双向链表遍历（`deps`/`nextDep`、`subs`/`nextSub`，
   link 节点带 `.dep`/`.sub`）。Vue 2.6 是 `Dep`/`Watcher` + `dep.subs` 数组，属性名对不上。
2. `resolveSetupSource`（`state.ts`）在 Vue 2.6 下拿不到 setup state（Options API 没有
   `setupState` / `_setupState`），回退读的 `internal.render[BINDINGS_PROP]` 又依赖**编译期插桩**，
   而插桩只存在于 Vite/Vue 3 线的 `plugin.ts`——webpack 线零插桩（见上文 S1）。
3. 于是 `buildReactivityGraph(undefined)` 返回空，`state.ts` 里 `nodes.length > 0` 不成立，
   整个字段被省略。

**结论：「依赖收集」在 Vue 2 线上是缺失的，「数据捕捉」（props / computed / $data）是完整的。**
③ 页就是这条差异的对照组——那里能看到 computed 的**值**，但看不到 computed 的**依赖**。

## 未覆盖

- **S4**：HBuilderX 工作流（无可编程 webpack 配置）未验证
- **网络采集**（`getNetworkRecords` / `clearNetworkRecords`）：探针支持这两个 RPC，
  但本示例没造 `uni.request` 场景——需要真机配好合法域名或关掉域名校验才有意义
- **Vuex 采集**：Vue 2 线的 `pinia.ts` 不注册（Pinia 依赖 Vue 3 Composition API），Vuex 也没有对应实现
- 生产构建（`NODE_ENV=production`）：`packages/webpack/src/index.ts:273` 在该模式下直接跳过探针注入，
  所以纯净度验证必须用 **dev 构建**（`bash scripts/build.sh`）才有意义
