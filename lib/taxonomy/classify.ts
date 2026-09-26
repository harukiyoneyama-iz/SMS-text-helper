import type { BaseTemplate } from "@/lib/templates/schema";
import { getTaxonomy, allFranchises, type SceneRule } from "@/lib/taxonomy/dictionary";
import { detectLifecycle, detectPersonal } from "@/lib/taxonomy/detect";

export const UNCATEGORIZED = "" as const;

/** BaseTemplate に分類結果を足した、画面表示用の完全なテンプレート */
export interface Template extends BaseTemplate {
  scene: string;
  product: string;
  purpose: string;
  franchise: string;
  customerType: string;
  customerSegment: string;
  stage: string;
  timing: string;
  smsType: "テキスト" | "入庫連動";
  isTest: boolean;
  isPersonal: boolean;
  lifecycle: "active" | "retired";
}

const TIMING_PATTERNS: RegExp[] = [
  /満了日まであと\d+ヶ月/,
  /満了[前後]\d+ヶ月/,
  /\d+ヶ月前/,
  /前日/,
];

function haystack(t: Pick<BaseTemplate, "templateName" | "body">): string {
  return `${t.templateName ?? ""} ${t.body}`;
}

/** テンプレート名を優先し、無ければ本文で判定する（テンプレート名の自作意図を尊重する） */
function matchScene(t: BaseTemplate, scenes: SceneRule[]): SceneRule | null {
  const name = t.templateName ?? "";
  for (const rule of scenes) {
    if (rule.keywords.some((k) => name.includes(k))) return rule;
  }
  const body = t.body;
  for (const rule of scenes) {
    if (rule.keywords.some((k) => body.includes(k))) return rule;
  }
  return null;
}

function matchFirst(text: string, candidates: string[]): string {
  for (const c of candidates) {
    if (text.includes(c)) return c;
  }
  return "";
}

function extractTiming(text: string): string {
  for (const pattern of TIMING_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[0];
  }
  return "";
}

/** 顧客区分を「新規／リピート」に粗く丸める（サイドバーで細かすぎる軸を出さないため） */
export function customerSegmentFor(customerType: string): string {
  if (!customerType) return "";
  if (customerType.includes("リピート")) return "リピート";
  if (customerType.includes("新規")) return "新規";
  return "";
}

/**
 * 分類辞書（config/taxonomy.json）を当てて、テンプレートに絞り込み用のタグを付ける。
 * 判定できない項目は推測で埋めず ""（未設定）のままにする
 * （docs/DEVELOPMENT_PLAN.md §⑤「未分類を隠さない」）。
 */
export function classify(base: BaseTemplate): Template {
  const taxonomy = getTaxonomy();
  const text = haystack(base);

  const sceneRule = matchScene(base, taxonomy.scenes);
  const franchise = matchFirst(text, allFranchises(taxonomy));
  const customerType = matchFirst(text, taxonomy.customerTypes);
  const stage = matchFirst(text, taxonomy.stages);
  const isTest = base.templateName
    ? taxonomy.testPatterns.some((p) => base.templateName!.includes(p))
    : false;

  return {
    ...base,
    scene: sceneRule?.scene ?? UNCATEGORIZED,
    product: sceneRule?.product ?? UNCATEGORIZED,
    purpose: sceneRule?.purpose ?? UNCATEGORIZED,
    franchise,
    customerType,
    customerSegment: customerSegmentFor(customerType),
    stage,
    timing: extractTiming(text),
    smsType: base.nykReservedUrl ? "入庫連動" : "テキスト",
    isTest,
    isPersonal: detectPersonal(base.templateName),
    lifecycle: detectLifecycle(base.templateName),
  };
}

export function classifyAll(list: BaseTemplate[]): Template[] {
  return list.map(classify);
}
