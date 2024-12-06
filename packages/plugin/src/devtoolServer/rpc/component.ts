import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { ComponentTreeNode } from '@uni-helper/devtools-types'
import { publicProcedure, router } from './../trpc'

export function componentRouter(eventEmitter: EventEmitter) {
  const { input, subscription } = publicProcedure
  let componentTree: ComponentTreeNode

  return router({
    setComponentTree: input(z.unknown()).subscription(({ input }) => {
      eventEmitter.emit('setComponentTree', input)
      componentTree = input as ComponentTreeNode
    }),
    onComponentTree: subscription(() => {
      return observable<ComponentTreeNode>((emit) => {
        const handler = (page: ComponentTreeNode) => {
          emit.next(page)
        }
        eventEmitter.on('setComponentTree', handler)
        if (componentTree) {
          emit.next(componentTree)
        }
        return () => {
          eventEmitter.off('setComponentTree', handler)
        }
      })
    }),
  })
}
