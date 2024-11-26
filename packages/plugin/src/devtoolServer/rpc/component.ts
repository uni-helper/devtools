import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { ComponentTreeNode, ModuleInfo } from '@uni-helper/devtools-types'
import { readJsonSync } from 'fs-extra'
import { DIR_INSPECT_LIST } from '../../dir'
import { publicProcedure, router } from './../trpc'

export function componentRouter(eventEmitter: EventEmitter) {
  const { input, subscription, query } = publicProcedure
  let componentTree: ComponentTreeNode
  const ComponentTreeNodeSchema: z.ZodSchema<ComponentTreeNode> = z.object({
    name: z.string(),
    file: z.string(),
    children: z.lazy(() => z.array(ComponentTreeNodeSchema).optional()),
  })

  return router({
    getComponent: query(() => {
      const json = readJsonSync(DIR_INSPECT_LIST)
      return json.modules as ModuleInfo[]
    }),
    setComponentTree: input(z.unknown()).subscription(({ input }) => {
      eventEmitter.emit('setComponentTree', input)
      console.log('setComponentTree', input)
      componentTree = input
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
