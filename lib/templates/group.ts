import type { Template } from "@/lib/taxonomy/classify";
import { allFranchises } from "@/lib/taxonomy/dictionary";
import {
  applyMask,
  PHONE_REGEX,
  URL_REGEX,
  BARE_DOMAIN_REGEX,
  GENERIC_STORE_SUFFIX_REGEX,
} from "@/lib/mask";

/**
 * 「店舗違いをまとめる」（docs/DEVELOPMENT_PLAN.md §⑤「データの汚れへの対応」）。
 * モック（ui-mock.html）は storeVariants をデータ側に最初から持たせていたが、
 * 実データにその情報は無いため、本文を正規化した文字列を名寄せキーにする。
 *
 * clientId はキーに含めない。コバック各店のように、別会社の加盟店が同じ文面を
 * 使っているケースもまとめるため（docs/DEVELOPMENT_PLAN.md 実装計画より）。
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 本文から「店舗名・電話番号・URLだけが違う」差分を取り除き、名寄せキーを作る */
export function normalizeForGrouping(body: string, company: string | null): string {
  let out = body;

  if (company && company.length >= 2) {
    out = out.split(company).join("");
  }

  for (const brand of allFranchises()) {
    const re = new RegExp(
      `${escapeRegExp(brand)}[^\\s、。！？!?]{0,10}?(?:店|工場|支店|営業所)`,
      "g",
    );
    out = out.replace(re, "");
  }

  out = out.replace(GENERIC_STORE_SUFFIX_REGEX, "");
  out = out.replace(PHONE_REGEX, "");
  out = out.replace(URL_REGEX, "");
  out = out.replace(BARE_DOMAIN_REGEX, "");
  out = out.replace(/\s+/g, "");

  return out;
}

export interface ConsolidatedTemplate extends Template {
  /** このグループに属する件数（自分自身を含む） */
  variantCount: number;
  /** 代表以外の店舗違い（代表は変数自体が持つ） */
  variants: Template[];
}

/** 代表行の選び方: 送信通数が最大のもの。同数なら最終更新が新しいもの */
function pickRepresentative(list: Template[]): Template[] {
  return [...list].sort((a, b) => {
    if (b.sendCount !== a.sendCount) return b.sendCount - a.sendCount;
    return b.modified.localeCompare(a.modified);
  });
}

export function consolidateStoreVariants(templates: Template[]): ConsolidatedTemplate[] {
  const groups = new Map<string, Template[]>();

  for (const t of templates) {
    const key = `${t.smsType}::${normalizeForGrouping(t.body, t.company)}`;
    const list = groups.get(key);
    if (list) {
      list.push(t);
    } else {
      groups.set(key, [t]);
    }
  }

  const result: ConsolidatedTemplate[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      result.push({ ...list[0]!, variantCount: 1, variants: [] });
      continue;
    }
    const sortedList = pickRepresentative(list);
    const representative = sortedList[0]!;
    const rest = sortedList.slice(1);
    result.push({ ...representative, variantCount: list.length, variants: rest });
  }

  return result;
}

/** 伏せモードON時に、代表行と店舗違いの一覧の両方へマスクをかける */
export function applyMaskToConsolidated(t: ConsolidatedTemplate): ConsolidatedTemplate {
  const masked = applyMask(t);
  return { ...masked, variantCount: t.variantCount, variants: t.variants.map(applyMask) };
}
