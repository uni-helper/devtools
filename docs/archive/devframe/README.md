# @uni-helper/devtools-devframe

Uni-Helper DevTools 后端集成与 Devframe 定义。提供与 Devframe 核心生态、Hub UI 及 uni-app 探针通信的完整桥梁。

---

## 1. 模块定位与职责

- **Devframe 契约导出**：通过 `createUniDevtoolsDevframe(registry, options)` 输出符合官方规范的 `DevframeDefinition`（`id: 'uni-helper-devtools'`）；
- **探针中继路由 (Relay)**：通过 `AgentRegistry` 管理已连接的小程序探针（WebSocket 携带 `client=uni-agent`），支持面向特定连接的定向调用与全局 ping-sweep 自愈扫描；
- **全链路开发 Harness**：内置基于 `createDevServer`（适配 uni-app 小程序 `vite build --watch` 无 Vite Server 模式）与 `initHub`（接入 Hub 多面板生态）的双模运行环境。

---

## 2. 冻结 RPC 契约 (Scope: `uni-helper-devtools`)

所有 RPC 保持与 POC 及新 Panel 强一致：

| 方法名                   | 类型   | 参数                 | 返回值形状                                           | 说明                         |
| :----------------------- | :----- | :------------------- | :--------------------------------------------------- | :--------------------------- |
| `ping`                   | query  | 无                   | `{ pong: number, agentConnected: boolean }`          | 健康检查与探针在线探测       |
| `get-component-tree`     | query  | 无                   | `{ fetchedAt: number, pages: PageComponentTree[] }`  | 获取当前活跃页面的组件树     |
| `get-component-state`    | query  | `{ id: string }`     | `ComponentStateResult` (`{ id, name, data, setup }`) | 读取单个组件的响应式状态     |
| `update-component-state` | action | `{ id, key, value }` | `{ ok: true, key, value }`                           | 穿透修改组件状态并触发重渲染 |

---

## 3. 怎么跑开发 Harness

### 方式 A：Standalone 模式（推荐，对标 uni-app 小程序 dev）

使用 `createDevServer`（`devframe/adapters/dev`）自建 HTTP+WS 端口（默认 9999）：

```bash
# 在 packages/devframe 目录下运行
pnpm dev

# 或在项目根目录下
node packages/devframe/scripts/dev.mjs
```

启动后控制台将输出：

- 面板直连 URL（带预共享鉴权 token，浏览器打开即用）
- 探针 WebSocket 连接地址（供小程序真机/模拟器连接）
- `__connection.json` 发现入口

### 方式 B：Hub 模式（挂载为 Hub 的 iframe dock entry）

使用 `initHub` 启动多面板 Hub 实例并挂载当前 devframe：

```bash
node packages/devframe/scripts/dev.mjs --hub --port 58018
```

---

## 4. 怎么切 clientAssets（面板构建产物）

`createUniDevtoolsDevframe` 内置平滑迁移机制：

1. **生产默认**：自动解析为 `packages/panel/dist`；
2. **替身兜底**：当 `packages/panel/dist` 尚未构建时，自动回落至 `packages/devframe/assets/panel`（内置已验证可用的 POC 替身面板）；
3. **显式指定**：
   - 方式一：环境变量 `UNI_DEVTOOLS_PANEL_DIR=/path/to/dist`
   - 方式二：函数选项 `createUniDevtoolsDevframe(registry, { clientAssets: '/path/to/dist' })`

在 P2 面板就绪并执行 `pnpm --filter @uni-helper/devtools-panel build` 后，系统会自动无缝切换至新面板，无需改动任何代码。

---

## 5. 验收脚本与实测记录

### 运行机器化验收

```bash
node packages/devframe/scripts/e2e-node.mjs
```

### 实测结果

- `__connection.json`：HTTP 200 正常响应，服务发现元数据有效；
- 模拟探针注册：通过 `?client=uni-agent` 标记与 token 鉴权建立 WebSocket 握手；
- 模拟面板通信：通过 relay 定向调用，成功获取组件树（`FakeIndexPage`）与响应式状态，成功执行状态写入（`count -> 99`）；
- Hub Dock 注册：在 `initHub` 挂载下，Hub 自动将其识别并注册为 `type: "iframe"`、`url: "/__devframes/uni-helper-devtools/"` 的标准 Dock Entry。
