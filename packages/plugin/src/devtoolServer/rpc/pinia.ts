import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import { publicProcedure, router } from './../trpc'

export function piniaRouter(eventEmitter: EventEmitter) {
  const { input, subscription } = publicProcedure
  type PiniaState = Record<string, string>
  const piniaState: PiniaState = {}

  return router({
    sendPiniaState: input(
      z.record(
        z.string(),
        z.string(),
      ),
    ).subscription(({ input }) => {
      for (const [key, value] of Object.entries(input)) {
        piniaState[key] = value
      }
      eventEmitter.emit('pinia', Object.values(piniaState))
    }),
    onPiniaState: subscription(() => {
      return observable<string[]>((emit) => {
        const piniaStateHandler = (data: string[]) => {
          emit.next(data)
        }

        eventEmitter.on('pinia', piniaStateHandler)

        if (Object.keys(piniaState).length !== 0) {
          emit.next(Object.values(piniaState))
        }
        return () => {
          eventEmitter.off('pinia', piniaStateHandler)
        }
      })
    }),
  })
}
