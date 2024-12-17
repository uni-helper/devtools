import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { VersionState } from '@uni-helper/devtools-types'
import { publicProcedure, router } from './../trpc'

export function versionRouter(eventEmitter: EventEmitter) {
  const { input, subscription } = publicProcedure
  let versionState: VersionState | null

  return router({
    setVersion: input(
      z.object({
        vueVersion: z.string(),
        uniVersion: z.string(),
        uniPlatform: z.string(),
      }),
    ).subscription(({ input }) => {
      eventEmitter.emit('version', input)
      versionState = input
    }),
    onVersion: subscription(() => {
      return observable<VersionState>((emit) => {
        const versionHandler = (data: VersionState) => {
          emit.next(data)
        }

        eventEmitter.on('version', versionHandler)

        if (versionState) {
          emit.next(versionState)
        }
        return () => {
          eventEmitter.off('version', versionHandler)
        }
      })
    }),
  })
}
