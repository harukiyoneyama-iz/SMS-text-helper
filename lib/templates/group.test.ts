import { describe, expect, it } from "vitest";
import { consolidateStoreVariants, normalizeForGrouping } from "./group";
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

describe("normalizeForGrouping", () => {
  it("電話番号・URL・店舗名だけが違う本文は同じキーになる", () => {
    const a = normalizeForGrouping(
      "車検のコバック岡山円山店です。お電話は086-000-1111まで。https://example.com/a",
      null,
    );
    const b = normalizeForGrouping(
      "車検のコバック松山店です。お電話は089-000-2222まで。https://example.com/b",
      null,
    );
    expect(a).toBe(b);
  });

  it("会社名だけが違う本文は同じキーになる", () => {
    const a = normalizeForGrouping("西崎自動車株式会社です。車検はお済みですか。", "西崎自動車株式会社");
    const b = normalizeForGrouping("丸山自動車株式会社です。車検はお済みですか。", "丸山自動車株式会社");
    expect(a).toBe(b);
  });

  it("本文の内容そのものが違えば別キーになる", () => {
    const a = normalizeForGrouping("車検の時期が近づいてまいりました。", null);
    const b = normalizeForGrouping("オイル交換の時期です。", null);
    expect(a).not.toBe(b);
  });
});

describe("consolidateStoreVariants", () => {
  it("店舗名・電話番号だけが違う複製をまとめる", () => {
    const t1 = classify(
      base({
        id: "1",
        body: "車検のコバック岡山円山店です。お電話は086-000-1111まで。",
        sendCount: 10,
      }),
    );
    const t2 = classify(
      base({
        id: "2",
        body: "車検のコバック松山店です。お電話は089-000-2222まで。",
        sendCount: 999,
      }),
    );
    const result = consolidateStoreVariants([t1, t2]);
    expect(result).toHaveLength(1);
    expect(result[0]!.variantCount).toBe(2);
    // 代表は送信通数が多い方
    expect(result[0]!.id).toBe("2");
    expect(result[0]!.variants.map((v) => v.id)).toEqual(["1"]);
  });

  it("SMSの型が違えばまとめない", () => {
    const body = "車検の時期が近づいてまいりました。";
    const t1 = classify(base({ id: "1", body, nykReservedUrl: null }));
    const t2 = classify(base({ id: "2", body, nykReservedUrl: "https://x.example/y" }));
    const result = consolidateStoreVariants([t1, t2]);
    expect(result).toHaveLength(2);
  });

  it("本文が違う文例はまとめない（1件ずつ variantCount=1）", () => {
    const t1 = classify(base({ id: "1", body: "車検の時期が近づいてまいりました。" }));
    const t2 = classify(base({ id: "2", body: "オイル交換はお済みですか。" }));
    const result = consolidateStoreVariants([t1, t2]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.variantCount === 1)).toBe(true);
  });
});
