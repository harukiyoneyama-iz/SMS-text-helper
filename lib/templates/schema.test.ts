import { describe, expect, it } from "vitest";
import { parseTemplates } from "./schema";

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    template_id: "1",
    client_id: "100",
    client_name: "サンプル自動車株式会社",
    template_name: "車検誘致SMS",
    message_body: "車検の時期が近づいてまいりました。",
    status_label: "使用中",
    delivery_type_label: "定型",
    manryou_month_diff: "0",
    reserved_tel: "052-123-4567",
    reserved_url: "https://example.com/a",
    nyk_reserved_url: null,
    exclude_reserved: "false",
    list_registered_only: "false",
    uses_placeholder: "false",
    body_length: "20",
    created_by_name: "u_1",
    modified_by_name: "u_2",
    created_at: "2020-01-01T00:00:00",
    updated_at: "2020-02-01T00:00:00",
    send_count: "1234",
    batch_count: "3",
    first_sent_at: "2020-01-05T00:00:00",
    last_sent_at: "2020-03-01T00:00:00",
    ...overrides,
  };
}

describe("parseTemplates", () => {
  it("文字列で入ってくる真偽値・数値を型変換する", () => {
    const { templates, invalidCount } = parseTemplates([rawRow()]);
    expect(invalidCount).toBe(0);
    expect(templates).toHaveLength(1);
    const t = templates[0]!;
    expect(t.excludeReserved).toBe(false);
    expect(t.sendCount).toBe(1234);
    expect(t.batchCount).toBe(3);
    expect(t.manryouMonthDiff).toBe(0);
    expect(t.bodyLength).toBe(20);
  });

  it("null と空文字を null に揃える", () => {
    const { templates } = parseTemplates([
      rawRow({ client_name: null, template_name: "   " }),
    ]);
    expect(templates[0]!.company).toBeNull();
    expect(templates[0]!.templateName).toBeNull();
  });

  it("zod 検証に失敗した行は除外し、件数を返す", () => {
    const { templates, invalidCount } = parseTemplates([
      rawRow(),
      { template_id: "2" /* 他の必須フィールドが無い壊れた行 */ },
    ]);
    expect(templates).toHaveLength(1);
    expect(invalidCount).toBe(1);
  });

  it("トップレベルが配列でなければ例外を投げる", () => {
    expect(() => parseTemplates({ not: "an array" })).toThrow();
  });
});
