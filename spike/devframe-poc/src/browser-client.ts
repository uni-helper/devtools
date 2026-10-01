/**
 * 面板侧 devframe 客户端预打包入口（构建产物 src/panel/df-client.mjs，勿手改）。
 *
 * 面板是无构建静态页，无法直接 import 包名（bare specifier），
 * 由 build:plugin 脚本将官方客户端打成单文件供其使用。
 */
export { connectDevframe, setupDevframeConnection } from 'devframe/client'
export { createRpcClient } from 'devframe/rpc/client'
export { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
export { structuredCloneParse } from 'devframe/utils/structured-clone'
