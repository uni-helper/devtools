# Devframe PoC 主持人侧发现（Host Findings）

> 与 `FINDINGS-agent.md`（探针/面板侧）互补，本文记录 node 侧与集成层的关键发现。
> 结论先行：**中继链路已用模拟客户端全链路验证通过**（`scripts/e2e-node.mjs` 全绿），
> 剩余唯一未验证环节是微信开发者工具 GUI 内的真实探针连接。

## 1. 已验证的架构结论（对应方案 §3.2 spike 验证项）

| # | 结论 | 证据 |
|---|------|------|
| 1 | **node 侧可对特定已连接探针做请求-响应定向调用**（无需 correlationId 兜底） | `StartedServer.rpcGroup.clients[i].$call(...)`；`onPeerConnect(connection)` 用 URL 标记（`client=uni-agent`）识别探针连接；e2e 测试 `agentConnected:true` + 组件树往返成功 |
| 2 | **预共享 token 静默鉴权可用**：`createInteractiveAuth(ctx, { clientAuthTokens })` + WS URL `?devframe_auth_token=` 连接期信任 | e2e 两个客户端均免 OTP 通过；auth 支持函数形态 `(ctx) => handler`（类型未声明但 instance-shell `resolveAuth` 运行时支持） |
| 3 | **devframe@1.1.0 真实存在于 npm**，文档与实现一致 | `devframe`、`@devframes/hub`、`@devframes/vite` 均 1.1.0 |
| 4 | **wire 协议是定制 birpc**：请求 `{t:'q',m,a,i}` / 响应 `{t:'s',i,r\|e}`；入站接受裸 JSON 或 `s:` 前缀 structured-clone，出站可能走 `s:` 编码（探针函数不在服务端 definitions 注册表时必然） | `dist/wire-codec-B1W3zH3L.mjs` 源码 + 实测帧 |
| 5 | **`devframe/client`（connectDevframe）不能直接跑在小程序沙箱**（浏览器 API），探针需自带 channel + `s:` 解码 | 探针用 `createRpcClient` + uni socket 适配 + `structuredCloneParse` 解码 |

## 2. 集成层发现（踩坑记录）

1. **uni-app 小程序 dev 的真实运行模型是 `vite build --watch`**，没有 vite dev server：
   `configureServer` 不执行、`apply:'serve'` 插件被整体跳过。devframe 必须用
   `createDevServer`（devframe/adapters/dev）自建 HTTP+WS 端口（默认 9999），与旧插件
   在 `configResolved` 自建 Polka 同构。**方案 §3.4 的 `configureServer + nodeMiddleware`
   写法需要修正为 createDevServer 模式。**
2. **`ws:{sidecar:true}` 只是 WS 专用 sidecar**，不服务 HTTP 面板——要面板+WS+发现
   文件一站服务必须用 `createDevServer`。
3. **playground 是 CJS 项目**：vite.config 以 CJS 打包后无法 require ESM-only 包。
   解法：spike 插件用 esbuild 预打包为单文件 `dist/plugin.mjs`，配置里用**非字面量**
   动态 `import()`（CJS 的原生 import() 可加载 ESM，字面量会被 esbuild 转写为 require）。
4. **旧插件 `@uni-helper/devtools` 的 ESM 产物有 interop 缺陷**（`acorn-walk` default import），
   其 CJS 产物正常（`module.exports = 插件函数`，无 `.default`）。
5. **workspace 外文件不触发 uni watch**：改 spike 包代码后需 `touch playground/src/main.ts`。
6. **探针代码 import 链要过小程序构建**：`devframe/rpc` 入口拖入 ohash → `node:crypto`
   会炸 mp 构建；`devframe/utils/structured-clone` 是自包含的（structured-clone-es 内联，
   仅依赖 `self/globalThis`），可安全引入。`s:` 前缀用本地常量。

## 3. 生产剥离（方案 §4.1 约束 5）——结构性保证已就位，产物实证待办

插件的门控是结构性的：`NODE_ENV !== 'development'` 时不注入探针（transform 直接
返回 null）、虚拟模块返回空配置、不启动 devframe server——正式包不含任何探针代码。

**但尚未用完整产物实证**：playground 的 `pnpm build:mp-weixin`（生产构建）目前因
无关问题失败（`AppLogos.vue` × vite-plugin-uni-components 的 MISSING_EXPORT）。原因
是 spike 接入时在仓库根执行了 `pnpm install --no-frozen-lockfile`，playground 依赖被
从其自带锁文件的旧版本重解析到新版（vite 5.0.13→5.4、vite-plugin-uni alpha→4020920240930001）。
dev 模式（build --watch）不受影响。**待办**：与用户确认 playground 依赖版本策略
（回钉旧版 vs 修模板适配新版）后重跑生产构建完成零残留实证。

## 4. 待验证（需要微信开发者工具 GUI）

- 真实探针在模拟器中连接（CLI `open --project` 因服务端口未启用而挂起，需在 GUI
  开启：设置 → 安全设置 → 服务端口；及 详情 → 本地设置 → 不校验合法域名）。
- 模拟器 `wx.connectSocket` 对 `ws://192.168.1.2:9999` 的可达性（LAN IP 由
  `resolveHost()` 自动选择，`UNI_DEVTOOLS_HOST` 可覆盖）。

## 5. 运行方式

```bash
pnpm --filter @spike/devframe-poc run build:plugin   # 构建 dist/plugin.mjs + src/panel/df-client.mjs
cd playground && pnpm dev:mp-weixin                  # 启动（日志打印带 token 的面板 URL）
# 浏览器打开日志中的面板 URL；微信开发者工具导入 playground/dist/dev/mp-weixin
# 中继链路回归（不需微信开发者工具）：
node spike/devframe-poc/scripts/e2e-node.mjs http://<host>:9999 <token>
```
