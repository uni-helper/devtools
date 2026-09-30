import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { ComponentTreeNode } from '@uni-helper/devtools-types'
import { mapToObject } from '@uni-helper/devtools-shared'
import { publicProcedure, router } from './../trpc'

export function componentRouter(eventEmitter: EventEmitter) {
  type ComponentData = Map<number, Map<string, string | string[]>>
  const componentData: ComponentData = new Map()
  let componentTree: ComponentTreeNode

  return router({
    setComponentTree: publicProcedure.input(z.unknown()).subscription(({ input }) => {
      eventEmitter.emit('setComponentTree', input)
      componentTree = input as ComponentTreeNode
    }),
    onComponentTree: publicProcedure.subscription(() => {
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
    sendComponentData: publicProcedure.input(
      z.object({
        key: z.string(),
        id: z.number(),
        value: z.union([z.string(), z.array(z.string())]),
      }),
    ).subscription(({ input }) => {
      if (componentData.has(input.id)) {
        componentData.get(input.id)?.set(input.key, input.value)
      }
      else {
        componentData.set(input.id, new Map([[input.key, input.value]]))
      }
      console.log('sendComponentData', componentData)
      eventEmitter.emit('setComponentData', input.id)
      return observable<void>(() => {
        return () => {}
      })
    }),
    onComponentData: publicProcedure.input(z.number()).subscription(({ input }) => {
      console.log('onComponentData', input)
      return observable<any>((emit) => {
        const handler = (data: number) => {
          if (input === data) {
            const map = componentData.get(data)
            if (map) {
              const obj = mapToObject(map)
              emit.next(obj)
            }
          }
        }
        eventEmitter.on('setComponentData', handler)
        const map = componentData.get(input)
        if (map && map.size !== 0) {
          emit.next(mapToObject(map))
        }
        return () => {
          eventEmitter.off('setComponentData', handler)
        }
      })
    }),
    updateComponentData: publicProcedure.input(
      z.object({
        id: z.number(),
        key: z.string(),
        value: z.any(),
      }),
    ).mutation(({ input }) => {
      console.log('updateComponentData', input)
      eventEmitter.emit('updateComponentData', input)
    }),
    onUpdateComponentData: publicProcedure.subscription(() => {
      return observable<{ id: number, key: string, value: any }>((emit) => {
        const handler = (data: { id: number, key: string, value: any }) => {
          emit.next(data)
        }
        eventEmitter.on('updateComponentData', handler)
        return () => {
          eventEmitter.off('updateComponentData', handler)
        }
      })
    }),
  })
}
