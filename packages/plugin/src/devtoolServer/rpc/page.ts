import type { EventEmitter } from 'node:stream'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { VersionState } from '@uni-helper/devtools-types'
import type { Options } from '../../types'
import { publicProcedure, router } from './../trpc'
import { getPagesInfo } from './../../logic'

export function pageRouter(eventEmitter: EventEmitter, options?: Partial<Options>) {
  const { input, subscription, query } = publicProcedure
  let currentPage: string | null

  return router({
    getPages: query(() => {
      const [_, pages] = getPagesInfo(options?.pageJsonPath)
      return pages
    }),
    setCurrentPage: input(z.string()).subscription(({ input }) => {
      eventEmitter.emit('setCurrentPage', input)
      currentPage = input
    }),
    onCurrentPage: subscription(() => {
      return observable<string>((emit) => {
        const handler = (page: string) => {
          emit.next(page)
        }
        eventEmitter.on('setCurrentPage', handler)
        if (currentPage) {
          emit.next(currentPage)
        }
        return () => {
          eventEmitter.off('setCurrentPage', handler)
        }
      })
    }),
  })
}
