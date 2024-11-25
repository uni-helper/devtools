import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { InitState } from '@uni-helper/devtools-types'
import { publicProcedure, router } from './../trpc'

export function versionRouter(eventEmitter: EventEmitter) {
  const { input, subscription } = publicProcedure

  return router({
    sendVersion: input(
      z.object({
        vueVersion: z.string(),
        uniVersion: z.string(),
        uniPlatform: z.string(),
      }),
    ).subscription(({ input }) => {
      eventEmitter.emit('version', input)
    }),
    onVersion: subscription(() => {
      return observable<InitState>((emit) => {
        const versionHandler = (data: InitState) => {
          emit.next(data)
        }

        eventEmitter.on('version', versionHandler)

        return () => {
          eventEmitter.off('version', versionHandler)
        }
      })
    }),
  })
}
