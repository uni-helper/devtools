import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { CustomTab } from '@vue/devtools-kit'
import { publicProcedure, router } from './../trpc'

export function TabRouter(eventEmitter: EventEmitter) {
  const { input, subscription } = publicProcedure
  const tabs: Set<CustomTab> = new Set()

  return router({
    sendTab: input(z.unknown()).subscription(({ input }) => {
      console.log('sendTab', input)
      eventEmitter.emit('tab', input)
      tabs.add(input as CustomTab)
    }),
    onTab: subscription(() => {
      return observable<CustomTab>((emit) => {
        const tabHandler = (data: CustomTab) => {
          emit.next(data)
        }

        eventEmitter.on('tab', tabHandler)

        if (tabs.size)
          tabs.forEach(emit.next)

        return () => {
          eventEmitter.off('tab', tabHandler)
        }
      })
    }),
  })
}
