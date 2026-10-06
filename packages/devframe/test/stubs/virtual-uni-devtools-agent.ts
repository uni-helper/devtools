/**
 * `virtual:uni-devtools-agent` 的单测替身。
 *
 * 真实模块由构建期插件生成（见 src/plugin.ts / src/webpack.ts 的 alias 注入），
 * 源码运行时不可解析。这里提供一个空配置，让 `lifecycle.ts` 能被 vitest 直接导入；
 * 用例需通过 `initAgentPipeline({ customConfig })` 显式传入 wsUrl/token。
 */
export const config = {
  wsUrl: '',
  token: '',
}
