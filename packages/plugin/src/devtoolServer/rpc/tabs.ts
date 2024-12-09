import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { CustomTab } from '@vue/devtools-kit'
import { publicProcedure, router } from './../trpc'

export function TabRouter(eventEmitter: EventEmitter) {
  const { input, subscription } = publicProcedure

  return router({
    sendTab: input(
      z.object({
        name: z.string(),
        icon: z.string(),
        title: z.string(),
        category: z.string(),
        view: z.union([
          z.object({
            type: z.literal('iframe'),
            src: z.string(),
            persistent: z.boolean(),
          }),
          z.object({
            type: z.literal('webview'),
            vnode: z.unknown(),
          }),
        ]),
      }),
    ).subscription(({ input }) => {
      console.log('sendTab', input)
      eventEmitter.emit('tab', input)
    }),
    onTab: subscription(() => {
      return observable<CustomTab>((emit) => {
        const tabHandler = (data: CustomTab) => {
          emit.next(data)
        }

        eventEmitter.on('tab', tabHandler)

        return () => {
          eventEmitter.off('tab', tabHandler)
        }
      })
    }),
  })
}
