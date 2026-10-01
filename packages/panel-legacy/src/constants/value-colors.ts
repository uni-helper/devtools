/**
 * 状态值的类型语法色（data-type syntax colors）。
 *
 * 这是**数据着色**，不是界面用色：与旧版客户端的 `stateColorMap`、Vue Devtools
 * 的状态树着色一脉相承（string 橙、number/boolean 紫、null 灰），类似代码编辑器
 * 的语法高亮——因此刻意不随主题 token 浮动，保证「同一个值在深浅色下颜色语义
 * 一致」。界面表面（背景/边框/文本）仍然只走设计基座的语义 shortcut，见
 * `devframe-docs/specifications/standards/06-design-system.md`。
 */
export const VALUE_COLORS = {
  string: '#d19763',
  literal: '#9980eb',
  nullable: '#ababab',
} as const

export function valueColor(value: unknown): string | undefined {
  if (value === null || value === undefined)
    return VALUE_COLORS.nullable
  if (typeof value === 'string')
    return VALUE_COLORS.string
  if (typeof value === 'number' || typeof value === 'boolean')
    return VALUE_COLORS.literal
  return undefined
}
