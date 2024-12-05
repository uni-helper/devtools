import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { ComponentTreeNode, ModuleInfo } from '@uni-helper/devtools-types'
import fs from 'fs-extra'
import { DIR_INSPECT_LIST } from '../../dir'
import { publicProcedure, router } from './../trpc'

export function componentRouter(eventEmitter: EventEmitter) {
  const { input, subscription, query } = publicProcedure
  let componentTree: ComponentTreeNode

  return router({
    getComponent: query(() => {
      const json = fs.readJsonSync(DIR_INSPECT_LIST)
      return json.modules as ModuleInfo[]
    }),
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
