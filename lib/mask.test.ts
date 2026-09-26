import { describe, expect, it } from "vitest";
import { applyMask, maskFreeText, maskFullValue } from "./mask";
import { classify } from "@/lib/taxonomy/classify";
import type { BaseTemplate } from "@/lib/templates/schema";

function base(overrides: Partial<BaseTemplate> = {}): BaseTemplate {
  return {
    id: "1",
    clientId: "100",
    company: "西崎自動車株式会社",
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
    createdBy: "山田太郎",
    modifiedBy: "佐藤花子",
    created: "2020-01-01T00:00:00",
    modified: "2020-02-01T00:00:00",
    sendCount: 100,
    batchCount: 1,
    firstSentAt: null,
    lastSentAt: null,
    ...overrides,
  };
}

describe("maskFullValue", () => {
  it("null はそのまま null", () => {
    expect(maskFullValue(null)).toBeNull();
  });
  it("値があれば固定長のマスクにする", () => {
    expect(maskFullValue("西崎自動車株式会社")).toBe("●●●●●●");
  });
});

describe("maskFreeText", () => {
  it("会社名の直書きを伏せる", () => {
    const out = maskFreeText("車検のコバック岡山円山店です", null);
    expect(out).not.toContain("岡山円山");
  });

  it("電話番号を伏せる", () => {
    const out = maskFreeText("お問い合わせは052-123-4567まで", null);
    expect(out).not.toContain("052-123-4567");
    expect(out).toContain("0●●-●●●-●●●●");
  });

  it("URLを伏せる", () => {
    const out = maskFreeText("詳細はこちら https://example.com/foo/bar", null);
    expect(out).not.toContain("example.com");
  });

  it("http(s)を省略した裸のドメインも伏せる（2026-09-26 動作確認で発見した伏せ漏れ）", () => {
    const out = maskFreeText(
      "WEB（idemitsu-rh.co.jp/p/minamikanto/）でご予約ください",
      null,
    );
    expect(out).not.toContain("idemitsu-rh.co.jp");
    expect(out).not.toContain("minamikanto");
  });

  it("フランチャイズ名単体は伏せない", () => {
    const out = maskFreeText("車検のコバックでは只今キャンペーン中です", null);
    expect(out).toContain("車検のコバック");
  });

  it("ブランド名＋具体的な店舗名は伏せる（ブランド名を含めて伏せる）", () => {
    const out = maskFreeText("車検のコバック岡山円山店にご来店ください", null);
    expect(out).not.toContain("車検のコバック岡山円山店");
  });

  it("「当店」「本店」等の一般語（接頭辞1文字）は誤検知しない", () => {
    const out = maskFreeText("当店にご来店いただいた皆様へ本店からのお知らせです", null);
    expect(out).toContain("当店");
    expect(out).toContain("本店");
  });

  it("会社名が本文に直書きされていれば伏せる", () => {
    const out = maskFreeText("西崎自動車株式会社です。車検はお済みですか。", "西崎自動車株式会社");
    expect(out).not.toContain("西崎自動車株式会社");
  });
});

describe("applyMask", () => {
  it("会社名・本文・電話・URL・作成者/更新者をまとめて伏せる", () => {
    const t = classify(
      base({
        body: "西崎自動車株式会社です。お電話は052-123-4567まで。https://example.com/x",
        reservedTel: "052-123-4567",
        reservedUrl: "https://example.com/x",
      }),
    );
    const masked = applyMask(t);
    expect(masked.company).toBe("●●●●●●");
    expect(masked.createdBy).toBe("●●●●●●");
    expect(masked.modifiedBy).toBe("●●●●●●");
    expect(masked.body).not.toContain("052-123-4567");
    expect(masked.body).not.toContain("example.com");
    expect(masked.body).not.toContain("西崎自動車株式会社");
    expect(masked.reservedTel).not.toContain("052-123-4567");
    expect(masked.reservedUrl).not.toContain("example.com");
  });

  it("テンプレート名が空欄でも本文経由の自動命名から漏れないよう本文自体を伏せる", () => {
    const t = classify(
      base({ templateName: null, body: "西崎自動車株式会社の車検案内です" }),
    );
    const masked = applyMask(t);
    expect(masked.body).not.toContain("西崎自動車株式会社");
  });

  it("個人宛の下書き（isPersonal=true）はテンプレート名の氏名部分も伏せる（2026-09-26 code-review 対応）", () => {
    const t = classify(base({ templateName: "見積提示_鈴木様" }));
    expect(t.isPersonal).toBe(true);
    const masked = applyMask(t);
    expect(masked.templateName).not.toContain("鈴木");
  });

  it("個人宛でなければテンプレート名の「様」はそのまま残す（誤検知しない）", () => {
    const t = classify(base({ templateName: "お客様への一斉配信" }));
    expect(t.isPersonal).toBe(false);
    const masked = applyMask(t);
    expect(masked.templateName).toBe("お客様への一斉配信");
  });
});
