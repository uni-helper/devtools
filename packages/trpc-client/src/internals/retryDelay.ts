/* istanbul ignore next -- @preserve */
export function retryDelay(attemptIndex: number) {
  return attemptIndex === 0 ? 0 : Math.min(1000 * 2 ** attemptIndex, 30000)
}
