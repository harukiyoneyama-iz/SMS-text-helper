import type { Template } from "@/lib/taxonomy/classify";
import { allFranchises, getTaxonomy } from "@/lib/taxonomy/dictionary";
import { PERSONAL_NAME_PATTERN } from "@/lib/taxonomy/detect";

/**
 * 伏せモードのマスク処理。
 * 必ずサーバ側で行う（DevTools・コピー経由の漏洩を防ぐため。
 * docs/DEVELOPMENT_PLAN.md §④「マスクは画面側ではなくデータを渡す側（サーバ）で行う」）。
 *
 * フランチャイズのブランド名（「車検のコバック」等）そのものは複数店舗にまたがる
 * カテゴリ名なので単体では伏せない。伏せるのは「会社名」「ブランド名＋具体的な
 * 店舗名」の組み合わせ（docs/mockups/ui-mock.html の STORE_NAME_PATTERNS の設計を継承）。
 *
 * 実データには（モックと違い）店舗名の辞書が無いため、正規表現で動的に検出する。
 * 迷ったら伏せる側に倒す方針だが、「当店」「本店」のような1文字＋店の一般語は
 * 除外する（接頭辞2文字以上を要求）。
 */

export const PHONE_REGEX = /0\d{1,4}-\d{2,4}-\d{4}/g;
export const URL_REGEX = /https?:\/\/[^\s]+/g;
// ブランド名に紐付かない「◯◯店／◯◯工場」。接頭辞2文字以上を要求することで
// 「当店」「本店」「来店」「全店」等の一般語（接頭辞1文字）を誤検知しない
export const GENERIC_STORE_SUFFIX_REGEX = /[一-龥ァ-ヶーA-Za-z0-9]{2,12}(?:店|工場|支店|営業所)/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function placeholderFor(original: string): string {
  return "●".repeat(Math.max(4, Math.ceil([...original].length / 2)));
}

/** 会社名など識別子そのものを完全にマスクする（モックの maskCompany 相当） */
export function maskFullValue(value: string | null): string | null {
  if (value === null) return null;
  return "●".repeat(6);
}

/**
 * 自由記述のテキスト（本文・テンプレート名・電話番号・URL）から、
 * 会社名／ブランド名＋具体的な店舗名／電話番号／URL を伏せる。
 */
export function maskFreeText(text: string, company: string | null): string {
  let out = text;

  if (company && company.length >= 2) {
    out = out.split(company).join(placeholderFor(company));
  }

  for (const brand of allFranchises()) {
    const re = new RegExp(
      `${escapeRegExp(brand)}[^\\s、。！？!?]{0,10}?(?:店|工場|支店|営業所)`,
      "g",
    );
    out = out.replace(re, (m) => placeholderFor(m));
  }

  out = out.replace(GENERIC_STORE_SUFFIX_REGEX, (m) => placeholderFor(m));

  out = out.replace(PHONE_REGEX, (m) => "0●●-●●●-●●●●".slice(0, m.length));
  out = out.replace(URL_REGEX, () => "https://●●●●●●●●●●●●●●●");

  return out;
}

function maskNullableFreeText(
  text: string | null,
  company: string | null,
): string | null {
  if (text === null) return null;
  return maskFreeText(text, company);
}

/**
 * 個人宛の下書き（isPersonal=true。テンプレート名が「○○様」で終わる）の名前部分を伏せる。
 * detectPersonal と同じパターンで検出した箇所だけを伏せるため、末尾に空白が付いていない
 * 前提（BigQuery のテンプレート名は通常トリム済み）
 */
function maskPersonalNameSuffix(name: string): string {
  return name.replace(PERSONAL_NAME_PATTERN, (m) => placeholderFor(m));
}

/** 伏せモードON時のテンプレート。読み込み時に辞書を1回だけ確保しておく */
export function applyMask(t: Template): Template {
  // getTaxonomy() を呼んでおくことで allFranchises() のキャッシュが有効になる
  getTaxonomy();

  let templateName = maskNullableFreeText(t.templateName, t.company);
  if (t.isPersonal && templateName) {
    templateName = maskPersonalNameSuffix(templateName);
  }

  return {
    ...t,
    company: maskFullValue(t.company),
    templateName,
    body: maskFreeText(t.body, t.company),
    reservedTel: maskNullableFreeText(t.reservedTel, t.company),
    reservedUrl: maskNullableFreeText(t.reservedUrl, t.company),
    nykReservedUrl: maskNullableFreeText(t.nykReservedUrl, t.company),
    createdBy: maskFullValue(t.createdBy) ?? "",
    modifiedBy: maskFullValue(t.modifiedBy) ?? "",
  };
}
