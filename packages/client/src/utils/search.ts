/**
 * @source https://github.com/vuejs/devtools/blob/main/packages/applet/src/utils/search.ts
 * @license
  > MIT License
  > Copyright (c) 2023 webfansplz
  >
  > Permission is hereby granted, free of charge, to any person obtaining a copy
  > of this software and associated documentation files (the "Software"), to deal
  > in the Software without restriction, including without limitation the rights
  > to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  > copies of the Software, and to permit persons to whom the Software is
  > furnished to do so, subject to the following conditions:
  >
  > The above copyright notice and this permission notice shall be included in all
  > copies or substantial portions of the Software.
  >
  > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  > IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  > FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  > AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  > LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  > OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  > SOFTWARE.
 */

import type { CustomInspectorState } from '@vue/devtools-kit'
import { INFINITY, NAN, NEGATIVE_INFINITY, UNDEFINED, isPlainObject } from '@vue/devtools-kit'

/**
 * Searches a key or value in the object, with a maximum deepness
 * @param {*} obj Search target
 * @param {string} searchTerm Search string
 * @returns {boolean} Search match
 */
export function searchDeepInObject(obj: Record<any, any>, searchTerm: string) {
  const seen = new Map()
  const result = internalSearchObject(obj, searchTerm.toLowerCase(), seen, 0)
  seen.clear()
  return result
}

const SEARCH_MAX_DEPTH = 10

/**
 * Executes a search on each field of the provided object
 * @param {*} obj Search target
 * @param {string} searchTerm Search string
 * @param {Map<any,boolean>} seen Map containing the search result to prevent stack overflow by walking on the same object multiple times
 * @param {number} depth Deep search depth level, which is capped to prevent performance issues
 * @returns {boolean} Search match
 */
function internalSearchObject(obj: Record<any, any>, searchTerm: string, seen: Map<unknown, boolean | null>, depth: number): boolean {
  if (depth > SEARCH_MAX_DEPTH)
    return false

  let match = false
  const keys = Object.keys(obj)
  let key, value
  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    value = obj[key]
    match = internalSearchCheck(searchTerm, key, value, seen, depth + 1)
    if (match)
      break
  }
  return match
}

/**
 * Checks if the provided field matches the search terms
 * @param {string} searchTerm Search string
 * @param {string} key Field key (null if from array)
 * @param {*} value Field value
 * @param {Map<any,boolean>} seen Map containing the search result to prevent stack overflow by walking on the same object multiple times
 * @param {number} depth Deep search depth level, which is capped to prevent performance issues
 * @returns {boolean} Search match
 */
function internalSearchCheck(searchTerm: string, key: string | null, value: any, seen: Map<unknown, boolean | null>, depth: number): boolean {
  let match = false
  let result
  if (key === '_custom') {
    key = value.display
    value = value.value
  }
  (result = specialTokenToString(value)) && (value = result)
  if (key && compare(key, searchTerm)) {
    match = true
    seen.set(value, true)
  }
  else if (seen.has(value)) {
    match = seen.get(value)!
  }
  else if (Array.isArray(value)) {
    seen.set(value, null)
    match = internalSearchArray(value, searchTerm, seen, depth)
    seen.set(value, match)
  }
  else if (isPlainObject(value)) {
    seen.set(value, null)
    match = internalSearchObject(value, searchTerm, seen, depth)
    seen.set(value, match)
  }
  else if (compare(value, searchTerm)) {
    match = true
    seen.set(value, true)
  }
  return match
}

/**
 * Compares two values
 * @param {*} value Mixed type value that will be cast to string
 * @param {string} searchTerm Search string
 * @returns {boolean} Search match
 */
function compare(value: unknown, searchTerm: string): boolean {
  return (`${value}`).toLowerCase().includes(searchTerm)
}

export function specialTokenToString(value: unknown) {
  if (value === null)
    return 'null'

  else if (value === UNDEFINED)
    return 'undefined'

  else if (value === NAN)
    return 'NaN'

  else if (value === INFINITY)
    return 'Infinity'

  else if (value === NEGATIVE_INFINITY)
    return '-Infinity'

  return false
}

/**
 * Executes a search on each value of the provided array
 * @param {*} array Search target
 * @param {string} searchTerm Search string
 * @param {Map<any,boolean>} seen Map containing the search result to prevent stack overflow by walking on the same object multiple times
 * @param {number} depth Deep search depth level, which is capped to prevent performance issues
 * @returns {boolean} Search match
 */
function internalSearchArray(array: unknown[], searchTerm: string, seen: Map<unknown, boolean | null>, depth: number): boolean {
  if (depth > SEARCH_MAX_DEPTH)
    return false

  let match = false
  let value
  for (let i = 0; i < array.length; i++) {
    value = array[i]
    match = internalSearchCheck(searchTerm, null, value, seen, depth + 1)
    if (match)
      break
  }
  return match
}

export function filterInspectorState<T extends CustomInspectorState>(params: {
  state: Record<string, T[]>
  filterKey?: string | null | undefined
  // Each group is a flatten object
  processGroup?: (item: T[]) => T[]
}) {
  const { state, filterKey, processGroup } = params
  if (!filterKey || !filterKey.trim().length)
    return state
  const result = {}
  for (const groupKey in state) {
    const group = state[groupKey]
    const groupFields = group.filter(el => searchDeepInObject({
      // @ts-expect-error typing weak
      [el.key]: el.value,
    }, filterKey))
    if (groupFields.length) {
      // @ts-expect-error typing weak
      result[groupKey] = processGroup ? processGroup(groupFields) : groupFields
    }
  }
  return result
}
