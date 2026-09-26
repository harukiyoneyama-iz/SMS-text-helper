import { describe, expect, it } from "vitest";
import { classify, customerSegmentFor } from "./classify";
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

describe("classify", () => {
  it("テンプレート名から商材・目的を判定する", () => {
    const t = classify(base({ templateName: "車検お礼SMS" }));
    expect(t.scene).toBe("車検お礼");
    expect(t.product).toBe("車検");
    expect(t.purpose).toBe("御礼");
  });

  it("商材だけ分かる scene は目的を未設定（空文字）のままにする", () => {
    const t = classify(base({ templateName: "12ヶ月点検のご案内" }));
    expect(t.scene).toBe("12ヶ月点検");
    expect(t.product).toBe("定期点検");
    expect(t.purpose).toBe("");
  });

  it("テンプレート名で判定できなければ本文で判定する", () => {
    const t = classify(base({ templateName: "案内", body: "オイル交換の時期です" }));
    expect(t.scene).toBe("オイル交換");
  });

  it("テンプレート名にも本文にもヒットしなければ未分類（空文字）のまま", () => {
    const t = classify(base({ templateName: "xyz", body: "abc" }));
    expect(t.scene).toBe("");
    expect(t.product).toBe("");
    expect(t.purpose).toBe("");
  });

  it("nykReservedUrl があれば入庫連動、無ければテキスト", () => {
    expect(classify(base({ nykReservedUrl: "https://x.example/y" })).smsType).toBe("入庫連動");
    expect(classify(base({ nykReservedUrl: null })).smsType).toBe("テキスト");
  });

  it("フランチャイズ名を本文から検出する", () => {
    const t = classify(base({ body: "車検のコバック岡山円山店です。ご来店お待ちしております。" }));
    expect(t.franchise).toBe("車検のコバック");
  });

  it("顧客区分・アプローチ段階のキーワードを検出する", () => {
    const t = classify(base({ templateName: "WEB見積1巡後_案内", body: "コバックリピートのお客様へ" }));
    expect(t.stage).toBe("WEB見積1巡後");
    expect(t.customerType).toBe("コバックリピート");
    expect(t.customerSegment).toBe("リピート");
  });

  it("テスト用パターンをテンプレート名から検出する", () => {
    expect(classify(base({ templateName: "配信テスト" })).isTest).toBe(true);
    expect(classify(base({ templateName: "車検誘致SMS" })).isTest).toBe(false);
  });

  it("タイミング（◯ヶ月前）を抽出する", () => {
    const t = classify(base({ templateName: "車検5ヶ月前案内" }));
    expect(t.timing).toBe("5ヶ月前");
  });
});

describe("customerSegmentFor", () => {
  it("「リピート」を含めばリピート", () => {
    expect(customerSegmentFor("コバックリピート")).toBe("リピート");
  });
  it("「新規」を含めば新規", () => {
    expect(customerSegmentFor("販売新規")).toBe("新規");
  });
  it("どちらも含まなければ未設定", () => {
    expect(customerSegmentFor("パック")).toBe("");
  });
  it("空文字なら未設定", () => {
    expect(customerSegmentFor("")).toBe("");
  });
});
