import type { ConsolidatedTemplate } from "@/lib/templates/group";
import type { FacetCounts } from "@/lib/templates/query";
import { BASE_PRICE, PRICE_STEP } from "@/lib/sms/charCount";

export interface TemplatesApiResponse {
  items: ConsolidatedTemplate[];
  matchedCount: number;
  poolCount: number;
  totalCount: number;
  facets: FacetCounts;
  page: number;
  pageSize: number;
  hasMore: boolean;
  fetchedAt: string;
  invalidCount: number;
  masked: boolean;
}

export interface TemplateDetailApiResponse {
  item: ConsolidatedTemplate;
  masked: boolean;
}

export interface ApiErrorResponse {
  error: string;
}

export type { ConsolidatedTemplate, FacetCounts };

export interface Filters {
  q: string;
  products: string[];
  purposes: string[];
  smsTypes: string[];
  customerSegments: string[];
  franchises: string[];
  stages: string[];
  priceTiers: number[];
  includeRetired: boolean;
  includePersonal: boolean;
  includeTest: boolean;
  consolidate: boolean;
  sort: "sent" | "new";
  masked: boolean;
}

export const UNSET = "__unset__";

export const DEFAULT_FILTERS: Filters = {
  q: "",
  products: [],
  purposes: [],
  smsTypes: [],
  customerSegments: [],
  franchises: [],
  stages: [],
  priceTiers: [],
  includeRetired: false,
  includePersonal: false,
  includeTest: false,
  consolidate: true,
  sort: "sent",
  // 実データを扱うため、伏せモードは既定でON
  // （docs/mockups/README.md「実データ表示中は伏せモードが自動でON」を継承）
  masked: true,
};

export const PRODUCTS = [
  "車検",
  "定期点検",
  "オイル交換",
  "タイヤ",
  "洗車",
  "コーティング",
  "車販・乗り換え",
];
export const PURPOSES = [
  "誘致",
  "御礼",
  "準備依頼",
  "リマインド",
  "キャンペーン・イベント",
  "お知らせ",
  "登録誘導",
];
export const SMS_TYPES = ["テキスト", "入庫連動"] as const;
export const CUSTOMER_SEGMENTS = ["新規", "リピート"];
export const FRANCHISE_GROUPS = [
  { label: "車検フランチャイズ", options: ["車検のコバック", "車検の速太郎", "ホリデー車検"] },
  {
    label: "車販フランチャイズ",
    options: ["フラット7", "ジョイカル", "カルモ", "コアラクラブ", "スーパー乗るだけセット"],
  },
];
export const STAGES = ["未予約", "仮予約済み", "WEB見積1巡後", "WEB見積3巡後", "2TEL3巡後"];

export function priceLabelForSegments(segments: number): string {
  return `${BASE_PRICE + (segments - 1) * PRICE_STEP}円/件（${segments}通）`;
}
