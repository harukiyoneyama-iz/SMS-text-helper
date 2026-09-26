import { describe, expect, it } from "vitest";
import {
  filterTemplates,
  parseTemplatesQuery,
  queryTemplates,
  visibleTemplates,
  UNSET,
} from "./query";
import { classify } from "@/lib/taxonomy/classify";
import type { BaseTemplate } from "@/lib/templates/schema";

function base(overrides: Partial<BaseTemplate> = {}): BaseTemplate {
  return {
    id: "1",
    clientId: "100",
    company: "サンプル自動車株式会社",
    templateName: "車検誘致SMS",
    body: "車検の時期が近づいてまいりました。",
    status: "使用中",
    deliveryType: "定型",
    manryouMonthDiff: 0,
    reservedTel: null,
    reservedUrl: null,
    nykReservedUrl: null,
    excludeReserved: false,
    callListOnly: false,
    usesPlaceholder: false,
    bodyLength: 20,
    createdBy: "u_1",
    modifiedBy: "u_2",
    created: "2020-01-01T00:00:00",
    modified: "2020-02-01T00:00:00",
    sendCount: 100,
    batchCount: 1,
    firstSentAt: null,
    lastSentAt: null,
    ...overrides,
  };
}

function q(overrides: Record<string, string | string[]> = {}): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(overrides)) {
    if (Array.isArray(v)) {
      for (const vv of v) sp.append(k, vv);
    } else {
      sp.set(k, v);
    }
  }
  return sp;
}

describe("parseTemplatesQuery", () => {
  it("既定値: 伏せモードON・店舗違い集約ON・sentソート・1ページ目", () => {
    const query = parseTemplatesQuery(q());
    expect(query.masked).toBe(true);
    expect(query.consolidate).toBe(true);
    expect(query.sort).toBe("sent");
    expect(query.page).toBe(1);
    expect(query.includeRetired).toBe(false);
  });

  it("masked=0 で伏せモードOFFにできる", () => {
    expect(parseTemplatesQuery(q({ masked: "0" })).masked).toBe(false);
  });

  it("複数値のフィルタ配列を受け取れる", () => {
    const query = parseTemplatesQuery(q({ products: ["車検", "タイヤ"] }));
    expect(query.products).toEqual(["車検", "タイヤ"]);
  });

  it("不正な page（範囲外・文字列）は境界検証で弾く", () => {
    expect(() => parseTemplatesQuery(q({ page: "0" }))).toThrow();
  });

  it("priceTiers の範囲外の値は境界検証で弾く", () => {
    expect(() => parseTemplatesQuery(q({ priceTiers: ["999"] }))).toThrow();
  });

  it("配列が長すぎる場合は境界検証で弾く（DoS対策）", () => {
    const many = Array.from({ length: 30 }, (_, i) => `v${i}`);
    expect(() => parseTemplatesQuery(q({ products: many }))).toThrow();
  });
});

describe("visibleTemplates", () => {
  const retired = classify(base({ id: "1", templateName: "【使用不可】旧案内" }));
  const personal = classify(base({ id: "2", templateName: "鈴木様" }));
  const test = classify(base({ id: "3", templateName: "配信テスト" }));
  const normal = classify(base({ id: "4", templateName: "車検誘致SMS" }));
  const all = [retired, personal, test, normal];

  it("既定は使用中止・個人宛・テスト用を除外する", () => {
    const query = parseTemplatesQuery(q());
    const visible = visibleTemplates(all, query);
    expect(visible.map((t) => t.id)).toEqual(["4"]);
  });

  it("includeRetired=1 で使用中止も表示する", () => {
    const query = parseTemplatesQuery(q({ includeRetired: "1" }));
    const visible = visibleTemplates(all, query);
    expect(visible.map((t) => t.id).sort()).toEqual(["1", "4"]);
  });
});

describe("filterTemplates", () => {
  const shaken = classify(base({ id: "1", templateName: "車検誘致SMS" }));
  const oil = classify(base({ id: "2", templateName: "オイル交換のご案内", body: "オイル交換はお済みですか" }));
  const all = [shaken, oil];

  it("商材で絞り込める（軸の中はOR、選択なしは全件通す）", () => {
    const query = parseTemplatesQuery(q({ products: ["車検"] }));
    expect(filterTemplates(all, query).map((t) => t.id)).toEqual(["1"]);
  });

  it("キーワードは本文・テンプレート名を対象にする", () => {
    const query = parseTemplatesQuery(q({ q: "オイル" }));
    expect(filterTemplates(all, query).map((t) => t.id)).toEqual(["2"]);
  });

  it("未設定（UNSET）を指定すると product が空文字の行だけ通す", () => {
    const uncategorized = classify(base({ id: "3", templateName: "xyz", body: "abc" }));
    const query = parseTemplatesQuery(q({ products: [UNSET] }));
    expect(filterTemplates([...all, uncategorized], query).map((t) => t.id)).toEqual(["3"]);
  });

  it("franchise・customerSegment・stage も UNSET 指定で空文字の行を拾える（2026-09-26 code-review 対応）", () => {
    const noFranchise = classify(base({ id: "4", templateName: "xyz", body: "abc" }));
    const withFranchise = classify(
      base({ id: "5", body: "車検のコバックでは只今キャンペーン中です" }),
    );
    const query = parseTemplatesQuery(q({ franchises: [UNSET] }));
    expect(filterTemplates([noFranchise, withFranchise], query).map((t) => t.id)).toEqual(["4"]);
  });
});

describe("queryTemplates", () => {
  it("既定のsort=sentは送信通数の降順になる", () => {
    const a = classify(base({ id: "1", sendCount: 10 }));
    const b = classify(base({ id: "2", sendCount: 999 }));
    const query = parseTemplatesQuery(q({ consolidate: "0" }));
    const result = queryTemplates([a, b], query);
    expect(result.items.map((t) => t.id)).toEqual(["2", "1"]);
  });

  it("facets はトグル適用後の母数から算出し、0件でも軸自体は消えない設計を検証できる", () => {
    const a = classify(base({ id: "1", templateName: "車検誘致SMS" }));
    const query = parseTemplatesQuery(q());
    const result = queryTemplates([a], query);
    expect(result.facets.products["車検"]).toBe(1);
    expect(result.facets.products["タイヤ"]).toBeUndefined();
  });

  it("金額フィルタの facet は実際に出現する通数だけを持つ", () => {
    const a = classify(base({ id: "1", body: "あ".repeat(10) })); // 1通
    const query = parseTemplatesQuery(q());
    const result = queryTemplates([a], query);
    expect(result.facets.priceTiers["1"]).toBe(1);
    expect(result.facets.priceTiers["2"]).toBeUndefined();
  });

  it("franchise の facet 合計は poolCount と一致する（UNSET 込みで数えるため）", () => {
    const a = classify(base({ id: "1", templateName: "xyz", body: "abc" })); // franchise未設定
    const b = classify(base({ id: "2", body: "車検のコバックでは只今キャンペーン中です" }));
    const query = parseTemplatesQuery(q());
    const result = queryTemplates([a, b], query);
    const total = Object.values(result.facets.franchises).reduce((s, n) => s + n, 0);
    expect(total).toBe(result.poolCount);
  });
});
