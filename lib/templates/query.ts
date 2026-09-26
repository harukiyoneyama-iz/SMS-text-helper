import { z } from "zod";
import type { Template } from "@/lib/taxonomy/classify";
import { consolidateStoreVariants, type ConsolidatedTemplate } from "@/lib/templates/group";
import { bodyCharInfo, MAX_SEGMENTS } from "@/lib/sms/charCount";
import { getTaxonomy } from "@/lib/taxonomy/dictionary";

/** サイドバーの「未設定」を表す予約値（product / purpose のように "" が「未分類」を意味する軸で使う） */
export const UNSET = "__unset__";

export const PAGE_SIZE = 50;

const querySchema = z.object({
  q: z.string().max(200),
  products: z.array(z.string().max(50)).max(20),
  purposes: z.array(z.string().max(50)).max(20),
  smsTypes: z.array(z.string().max(20)).max(20),
  customerSegments: z.array(z.string().max(20)).max(20),
  franchises: z.array(z.string().max(50)).max(20),
  stages: z.array(z.string().max(50)).max(20),
  priceTiers: z.array(z.number().int().min(1).max(MAX_SEGMENTS)).max(MAX_SEGMENTS),
  includeRetired: z.boolean(),
  includePersonal: z.boolean(),
  includeTest: z.boolean(),
  consolidate: z.boolean(),
  sort: z.enum(["sent", "new"]),
  page: z.number().int().min(1).max(10_000),
  masked: z.boolean(),
});

export type TemplatesQuery = z.infer<typeof querySchema>;

export function toBool(v: string | null, fallback: boolean): boolean {
  if (v === null) return fallback;
  return v === "1" || v === "true";
}

function toIntArray(values: string[]): number[] {
  return values
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * URLSearchParams からクエリを取り出し、zod で境界検証する。
 * 不正な値（配列が長すぎる・page が範囲外 等）は例外になり、呼び出し側（route handler）が
 * 400 を返す。
 */
export function parseTemplatesQuery(sp: URLSearchParams): TemplatesQuery {
  const raw = {
    q: sp.get("q") ?? "",
    products: sp.getAll("products"),
    purposes: sp.getAll("purposes"),
    smsTypes: sp.getAll("smsTypes"),
    customerSegments: sp.getAll("customerSegments"),
    franchises: sp.getAll("franchises"),
    stages: sp.getAll("stages"),
    priceTiers: toIntArray(sp.getAll("priceTiers")),
    // 伏せモードは既定でON（実データを扱うため）。店舗違いの集約は既定ON（モックと同じ）
    includeRetired: toBool(sp.get("includeRetired"), false),
    includePersonal: toBool(sp.get("includePersonal"), false),
    includeTest: toBool(sp.get("includeTest"), false),
    consolidate: toBool(sp.get("consolidate"), true),
    sort: sp.get("sort") === "new" ? "new" : "sent",
    page: sp.get("page") === null ? 1 : Number.parseInt(sp.get("page")!, 10),
    masked: toBool(sp.get("masked"), true),
  };
  return querySchema.parse(raw);
}

/** 表示に含める・含めないの4トグル（has_platelike は取得段階で除外済みのため対象外） */
export function visibleTemplates(all: Template[], query: TemplatesQuery): Template[] {
  return all.filter((t) => {
    if (!query.includeRetired && t.lifecycle === "retired") return false;
    if (!query.includePersonal && t.isPersonal) return false;
    if (!query.includeTest && t.isTest) return false;
    return true;
  });
}

function matchesAxis(selected: string[], value: string): boolean {
  return selected.length === 0 || selected.includes(value);
}

const KEYWORD_FIELDS = (t: Template): string =>
  [
    t.templateName ?? "",
    t.company ?? "",
    t.body,
    t.scene,
    t.timing,
    t.franchise,
    t.smsType,
    t.customerType,
    t.stage,
    t.product,
    t.purpose,
  ]
    .join(" ")
    .toLowerCase();

/**
 * 絞り込み。軸の中は OR、軸どうしは AND（モックの filtered() と同じ規則）。
 * 参照フィールド: franchise, scene, smsType, customerSegment, stage, product, purpose,
 * timing はキーワードのみ対象（サイドバーからは絞り込み軸として外れている）
 */
export function filterTemplates(pool: Template[], query: TemplatesQuery): Template[] {
  const kw = query.q.trim().toLowerCase();

  return pool.filter((t) => {
    if (!matchesAxis(query.franchises, t.franchise || UNSET)) return false;
    if (!matchesAxis(query.smsTypes, t.smsType)) return false;
    if (!matchesAxis(query.customerSegments, t.customerSegment || UNSET)) return false;
    if (!matchesAxis(query.stages, t.stage || UNSET)) return false;
    if (!matchesAxis(query.products, t.product || UNSET)) return false;
    if (!matchesAxis(query.purposes, t.purpose || UNSET)) return false;
    if (query.priceTiers.length > 0) {
      const segments = bodyCharInfo(t.smsType, t.body).segments;
      if (!query.priceTiers.includes(segments)) return false;
    }
    if (kw && !KEYWORD_FIELDS(t).includes(kw)) return false;
    return true;
  });
}

/**
 * サイドバーの各選択肢の件数。モックと同じく「表示に含める」トグル適用後の母数（pool）を
 * 基準にする。他の軸の選択状態やキーワードでは絞り込まない（0件でも選択肢を消さないため、
 * 複雑なファセット集計をせずに済む）
 */
export function countsByValue(pool: Template[], extractor: (t: Template) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of pool) {
    const v = extractor(t);
    if (!v) continue;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

export interface FacetCounts {
  products: Record<string, number>;
  purposes: Record<string, number>;
  smsTypes: Record<string, number>;
  customerSegments: Record<string, number>;
  franchises: Record<string, number>;
  stages: Record<string, number>;
  /** 通数（1〜10）ごとの件数。実際に出現する通数だけをサイドバーの金額フィルタに出すため */
  priceTiers: Record<string, number>;
}

export function buildFacetCounts(pool: Template[]): FacetCounts {
  // product/purpose 以外も "" を UNSET に揃える。matchesAxis 側と揃えないと
  // 「未設定」を選んでも空文字の行にヒットしない、という食い違いが起きるため
  // （2026-09-26 code-review 指摘）。サイドバーに「未設定」の選択肢を出すかどうかは
  // 画面側の任意（バックエンドは軸ごとに一貫した集計だけを保証する）
  return {
    products: countsByValue(pool, (t) => t.product || UNSET),
    purposes: countsByValue(pool, (t) => t.purpose || UNSET),
    smsTypes: countsByValue(pool, (t) => t.smsType),
    customerSegments: countsByValue(pool, (t) => t.customerSegment || UNSET),
    franchises: countsByValue(pool, (t) => t.franchise || UNSET),
    stages: countsByValue(pool, (t) => t.stage || UNSET),
    priceTiers: countsByValue(pool, (t) => {
      const { segments } = bodyCharInfo(t.smsType, t.body);
      return segments > 0 ? String(segments) : "";
    }),
  };
}

/** 並び替え。既定は「よく送られている順」（実データの send_count 降順。実データ検証済み） */
export function sortTemplates(list: Template[], sort: TemplatesQuery["sort"]): Template[] {
  const copy = [...list];
  if (sort === "new") {
    copy.sort((a, b) => (a.created || a.modified).localeCompare(b.created || b.modified) * -1);
  } else {
    copy.sort((a, b) => b.sendCount - a.sendCount);
  }
  return copy;
}

export interface QueryResult {
  /** ページング適用後の一覧（店舗違いは集約済み） */
  items: ConsolidatedTemplate[];
  /** 絞り込み後・ページング前の件数 */
  matchedCount: number;
  /** 表示に含める・含めないトグル適用後（絞り込み前）の母数 */
  poolCount: number;
  facets: FacetCounts;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function queryTemplates(all: Template[], query: TemplatesQuery): QueryResult {
  // 辞書を確保しておく（franchise 判定などが済んでいる前提のため、ここでの呼び出しは
  // キャッシュのウォームアップ目的）
  getTaxonomy();

  const pool = visibleTemplates(all, query);
  const facets = buildFacetCounts(pool);
  const filtered = filterTemplates(pool, query);
  const sorted = sortTemplates(filtered, query.sort);
  const consolidated = query.consolidate ? consolidateStoreVariants(sorted) : sorted.map((t) => ({ ...t, variantCount: 1, variants: [] }));

  const start = (query.page - 1) * PAGE_SIZE;
  const items = consolidated.slice(start, start + PAGE_SIZE);

  return {
    items,
    matchedCount: consolidated.length,
    poolCount: pool.length,
    facets,
    page: query.page,
    pageSize: PAGE_SIZE,
    hasMore: start + PAGE_SIZE < consolidated.length,
  };
}
