/**
 * テンプレート名から状態を判定する。
 * 元実装: docs/mockups/ui-mock.html の detectLifecycle / detectPersonal
 */

const RETIRED_PATTERN = /^(【使用不可】|※使用しない)|(【使用不可】|※使用しない)$/;
// 末尾を要求することで「お客様」「皆様」等の文中の一般的な敬称語を誤検知しない。
// mask.ts でも同じパターンを使って個人名部分そのものを伏せる（export）
export const PERSONAL_NAME_PATTERN = /[一-龥ぁ-んァ-ヶA-Za-z]{1,6}様[)）]?$/;

/** テンプレート名の先頭・末尾に「【使用不可】」「※使用しない」が付いていれば使用中止扱いにする */
export function detectLifecycle(name: string | null): "retired" | "active" {
  if (!name) return "active";
  return RETIRED_PATTERN.test(name) ? "retired" : "active";
}

/** テンプレート名が個人宛の下書き（「○○様」で終わる）かどうかを判定する */
export function detectPersonal(name: string | null): boolean {
  if (!name) return false;
  return PERSONAL_NAME_PATTERN.test(name);
}
