import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import { publicProcedure, router } from './../trpc'

interface Version {
  vueVersion: string
  uniVersion: string
}

export function versionRouter(eventEmitter: EventEmitter) {
  const { input, subscription } = publicProcedure

  return router({
    sendVersion: input(
      z.object({
        vueVersion: z.string(),
        uniVersion: z.string(),
      }),
    ).subscription(({ input }) => {
      eventEmitter.emit('version', input)
    }),
    onVersion: subscription(() => {
      return observable<Version>((emit) => {
        const versionHandler = (data: Version) => {
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
