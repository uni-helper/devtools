import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createDevtoolsState } from '../src/composables/devtools-state'

function createTestState(options?: {
  queryHandler?: (req: any) => Promise<any>
  commandHandler?: (cmd: any) => Promise<any>
}) {
  const runtimeVersion = ref(1)
  const selectedAppId = ref<string | undefined>('test-app')
  const selectedComponentId = ref<string | undefined>('comp-1')
  const error = ref<string | undefined>()
  const assertCommandSucceeded = vi.fn()

  const queryMock = vi.fn(
    options?.queryHandler ??
      (async (req: any) => ({
        componentId: req.payload.componentId,
        version: 1,
        sections: [],
      })),
  )

  const commandMock = vi.fn(
    options?.commandHandler ?? (async () => ({ status: 0 })),
  )

  const getRpcClient = () =>
    ({
      query: queryMock,
      command: commandMock,
    }) as any

  const state = createDevtoolsState({
    getRpcClient,
    runtimeVersion,
    selectedAppId,
    selectedComponentId,
    error,
    assertCommandSucceeded,
  })

  return {
    ...state,
    runtimeVersion,
    selectedAppId,
    selectedComponentId,
    error,
    queryMock,
    commandMock,
  }
}

describe('devtools-state version wrap-around and remount handling', () => {
  it('fetches initial component state correctly', async () => {
    const {
      fetchComponentState,
      componentState,
      componentStateLoading,
      queryMock,
    } = createTestState({
      queryHandler: async (req) => ({
        componentId: req.payload.componentId,
        version: 1,
        sections: [{ id: 'data', label: 'Data', entries: [] }],
      }),
    })

    await fetchComponentState('comp-1')

    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(componentState.value?.version).toBe(1)
    expect(componentStateLoading.value).toBe(false)
  })

  it('handles version wrap-around when component remounts (old request version 1000, new snapshot version 1)', async () => {
    let queryCallCount = 0

    const {
      fetchComponentState,
      componentState,
      componentStateLoading,
      queryMock,
    } = createTestState({
      queryHandler: async (req) => {
        queryCallCount++
        // Backend component has remounted, returning version 1
        return {
          componentId: req.payload.componentId,
          version: 1,
          sections: [{ id: 'data', label: 'Data', entries: [] }],
        }
      },
    })

    // Simulate an old delayed request arriving with minimumVersion = 1000
    await fetchComponentState('comp-1', 1000)

    // Should NOT get stuck in an infinite loop; should recognize version wrap-around
    expect(queryCallCount).toBe(1)
    expect(componentState.value?.version).toBe(1)
    expect(componentStateLoading.value).toBe(false)
  })

  it('ignores obsolete delayed request when current state is already at a lower version after remount', async () => {
    let queryCount = 0
    const { fetchComponentState, componentState, queryMock } = createTestState({
      queryHandler: async (req) => {
        queryCount++
        return {
          componentId: req.payload.componentId,
          version: 1,
          sections: [],
        }
      },
    })

    // Component is initially at version 1
    await fetchComponentState('comp-1')
    expect(queryCount).toBe(1)
    expect(componentState.value?.version).toBe(1)

    // Late arriving delayed request with version 1000 (from previous mount)
    await fetchComponentState('comp-1', 1000)

    // Should be ignored: no new query sent
    expect(queryCount).toBe(1)
    expect(componentState.value?.version).toBe(1)
  })

  it('detects mountId change and accepts new snapshot without loop', async () => {
    let callIndex = 0
    const snapshots = [
      { componentId: 'comp-1', version: 10, mountId: 'mount-1', sections: [] },
      { componentId: 'comp-1', version: 1, mountId: 'mount-2', sections: [] },
    ]

    const { fetchComponentState, componentState, componentStateLoading } =
      createTestState({
        queryHandler: async () => snapshots[callIndex++],
      })

    await fetchComponentState('comp-1')
    expect(componentState.value?.version).toBe(10)

    // Remount with different mountId and reset version
    await fetchComponentState('comp-1', 1, { mountId: 'mount-2' })
    expect(componentState.value?.version).toBe(1)
    expect(componentStateLoading.value).toBe(false)
  })

  it('detects sessionId change and accepts new snapshot without loop', async () => {
    let callIndex = 0
    const snapshots = [
      {
        componentId: 'comp-1',
        version: 100,
        sessionId: 'sess-1',
        sections: [],
      },
      { componentId: 'comp-1', version: 1, sessionId: 'sess-2', sections: [] },
    ]

    const { fetchComponentState, componentState } = createTestState({
      queryHandler: async () => snapshots[callIndex++],
    })

    await fetchComponentState('comp-1', 1, { sessionId: 'sess-1' })
    expect(componentState.value?.version).toBe(100)

    await fetchComponentState('comp-1', 1, { sessionId: 'sess-2' })
    expect(componentState.value?.version).toBe(1)
  })

  it('cancels pending requests via cancelPendingStateRequests', async () => {
    let resolveQuery: (res: any) => void
    const queryPromise = new Promise((resolve) => {
      resolveQuery = resolve
    })

    const {
      fetchComponentState,
      cancelPendingStateRequests,
      componentState,
      componentStateLoading,
    } = createTestState({
      queryHandler: () => queryPromise,
    })

    const fetchPromise = fetchComponentState('comp-1')
    expect(componentStateLoading.value).toBe(true)

    // Cancel pending request
    cancelPendingStateRequests()
    expect(componentStateLoading.value).toBe(false)

    // Late query resolves
    resolveQuery!({ componentId: 'comp-1', version: 1, sections: [] })
    await fetchPromise

    // State should not be applied because request was cancelled
    expect(componentState.value).toBeUndefined()
  })

  it('prevents infinite loops when snapshot version is persistently behind minimumVersion', async () => {
    let callCount = 0
    const { fetchComponentState, componentStateLoading } = createTestState({
      queryHandler: async (req) => {
        callCount++
        return {
          componentId: req.payload.componentId,
          version: 1,
          sections: [],
        }
      },
    })

    // Request with high version
    await fetchComponentState('comp-1', 1000)

    // Calls should terminate and loading state should become false
    expect(callCount).toBeLessThanOrEqual(10)
    expect(componentStateLoading.value).toBe(false)
  })

  it('automatically detects version drop without explicit mountId and accepts new snapshot', async () => {
    let callIndex = 0
    const snapshots = [
      { componentId: 'comp-1', version: 30, sections: [] },
      { componentId: 'comp-1', version: 1, sections: [] },
    ]

    const { fetchComponentState, componentState } = createTestState({
      queryHandler: async () => snapshots[callIndex++],
    })

    // First load component at version 30
    await fetchComponentState('comp-1')
    expect(componentState.value?.version).toBe(30)

    // Component remounts in target app, reset to version 1. Fetching new state (minimumVersion = 0)
    await fetchComponentState('comp-1')
    expect(componentState.value?.version).toBe(1)
  })

  it('handles normal incremental invalidations correctly without triggering wrap-around', async () => {
    let callIndex = 0
    const snapshots = [
      { componentId: 'comp-1', version: 1, sections: [] },
      { componentId: 'comp-1', version: 2, sections: [] },
      { componentId: 'comp-1', version: 3, sections: [] },
    ]

    const { fetchComponentState, componentState } = createTestState({
      queryHandler: async () => snapshots[callIndex++],
    })

    await fetchComponentState('comp-1', 1)
    expect(componentState.value?.version).toBe(1)

    await fetchComponentState('comp-1', 2)
    expect(componentState.value?.version).toBe(2)

    await fetchComponentState('comp-1', 3)
    expect(componentState.value?.version).toBe(3)
  })
})
