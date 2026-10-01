/**
 * 状态面板的视图模型类型。
 *
 * `kind` 是面板侧的展示分类：wire 契约的 `ref` / `object` / `value` 原样透传，
 * `data` 表示该字段来自 Options API 的 `$data`（wire 里没有这个分类，是面板
 * 在分组时打上的）。
 */
export interface StateField {
  key: string
  kind: 'ref' | 'object' | 'value' | 'data'
  value: unknown
}
