/**
 * Bootstrap Layer
 *
 * 探针启动层，职责：
 * 1. 脱离关键路径（queueMicrotask / setTimeout）
 * 2. Fail-Open（任何失败都不影响宿主应用启动）
 * 3. 等待就绪（确保平台运行时和配置已准备好）
 * 4. 显式传入 Adapter（不在运行时反查依赖）
 *
 * 原则 P1 (Fail-Open)：
 * - stub 掉整个探针模块 → 冷启动 → 首页正常渲染且 app.js 无红字
 *
 * 原则 P5 (Observability by Default)：
 * - console 出现一条结构化 `[uni-devtools] bootstrap` 记录
 */

import type { RuntimeAdapter } from '../adapter/types'
import { resolveAdapter } from '../adapter/resolve'
import type { AgentConfig, AgentInstance } from '../runtime/lifecycle'
import { initAgentPipeline } from '../runtime/lifecycle'
import { createBaseRpcFunctions } from '../runtime/rpc-base'

/**
 * Bootstrap 状态
 */
export enum BootstrapStatus {
  /** 未启动 */
  Idle = 'idle',
  /** 启动中 */
  Bootstrapping = 'bootstrapping',
  /** 启动成功 */
  Ready = 'ready',
  /** 启动失败（探针不可用，但宿主应用正常） */
  Failed = 'failed',
}

/**
 * Bootstrap 选项
 */
export interface BootstrapOptions {
  /**
   * 运行时适配器（可选，不传则自动解析）
   */
  adapter?: RuntimeAdapter

  /**
   * 配置（可选，不传则从全局获取）
   */
  config?: Partial<AgentConfig>

  /**
   * 是否延迟启动（默认 true，使用 queueMicrotask）
   */
  deferred?: boolean

  /**
   * 启动超时时间（毫秒，默认 5000）
   */
  timeout?: number
}

/**
 * Bootstrap 结果
 */
export interface BootstrapResult {
  status: BootstrapStatus
  agent?: AgentInstance
  error?: Error
  adapter?: RuntimeAdapter
  config?: AgentConfig
  timestamp: number
}

let bootstrapState: BootstrapResult = {
  status: BootstrapStatus.Idle,
  timestamp: Date.now(),
}

/**
 * 获取当前 Bootstrap 状态
 */
export function getBootstrapState(): BootstrapResult {
  return { ...bootstrapState }
}

/**
 * 核心启动逻辑（同步版本，用于测试）
 */
function bootstrapSync(options: BootstrapOptions = {}): BootstrapResult {
  const startTime = Date.now()

  try {
    // 1. 解析 Adapter
    const adapter = options.adapter || resolveAdapter()

    // 2. 解析配置
    const globalConfig =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).__UNI_DEVTOOLS_CONFIG__
        : undefined

    const config: AgentConfig = {
      wsUrl: options.config?.wsUrl || globalConfig?.wsUrl || '',
      token: options.config?.token || globalConfig?.token || '',
    }

    // 3. 配置校验（Fail-Open：无配置时降级，不抛错）
    if (!config.wsUrl) {
      console.warn(
        '[uni-devtools] bootstrap: wsUrl is missing, agent will not connect',
      )
      bootstrapState = {
        status: BootstrapStatus.Failed,
        error: new Error('wsUrl is missing'),
        adapter,
        config,
        timestamp: startTime,
      }
      return bootstrapState
    }

    // 4. 启动探针
    const agent = initAgentPipeline({
      adapter,
      clientFunctions: createBaseRpcFunctions(),
      customConfig: config,
    })

    // 5. 记录成功状态
    bootstrapState = {
      status: BootstrapStatus.Ready,
      agent,
      adapter,
      config,
      timestamp: startTime,
    }

    // 6. 可观测性日志（P5）
    console.log('[uni-devtools] bootstrap:', {
      status: 'ready',
      platform: adapter.platform,
      wsUrl: config.wsUrl,
      elapsed: Date.now() - startTime,
      contractVersion: '1.0.0', // 契约版本
    })

    return bootstrapState
  } catch (error) {
    // Fail-Open：捕获所有错误，不向上传播
    console.error('[uni-devtools] bootstrap failed:', error)

    bootstrapState = {
      status: BootstrapStatus.Failed,
      error: error instanceof Error ? error : new Error(String(error)),
      timestamp: startTime,
    }

    return bootstrapState
  }
}

/**
 * 启动探针（异步版本，推荐使用）
 *
 * @param options - 启动选项
 * @returns Promise<BootstrapResult>
 */
export function bootstrap(
  options: BootstrapOptions = {},
): Promise<BootstrapResult> {
  const { deferred = true, timeout = 5000 } = options

  return new Promise((resolve) => {
    const executeBootstrap = () => {
      try {
        const result = bootstrapSync(options)
        resolve(result)
      } catch (error) {
        // 双重保险：即使 bootstrapSync 抛错，也要 Fail-Open
        console.error('[uni-devtools] bootstrap outer catch:', error)
        const failedResult: BootstrapResult = {
          status: BootstrapStatus.Failed,
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: Date.now(),
        }
        bootstrapState = failedResult
        resolve(failedResult)
      }
    }

    if (deferred) {
      // 脱离关键路径
      if (typeof queueMicrotask !== 'undefined') {
        queueMicrotask(executeBootstrap)
      } else {
        setTimeout(executeBootstrap, 0)
      }
    } else {
      // 同步启动（测试用）
      executeBootstrap()
    }

    // 超时保护
    setTimeout(() => {
      if (bootstrapState.status === BootstrapStatus.Bootstrapping) {
        console.warn('[uni-devtools] bootstrap timeout')
        bootstrapState = {
          status: BootstrapStatus.Failed,
          error: new Error('Bootstrap timeout'),
          timestamp: Date.now(),
        }
        resolve(bootstrapState)
      }
    }, timeout)
  })
}

/**
 * 重置 Bootstrap 状态（测试用）
 */
export function resetBootstrap(): void {
  bootstrapState = {
    status: BootstrapStatus.Idle,
    timestamp: Date.now(),
  }
}
