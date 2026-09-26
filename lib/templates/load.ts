import fs from "node:fs";
import path from "node:path";
import { parseTemplates } from "@/lib/templates/schema";
import { classifyAll, type Template } from "@/lib/taxonomy/classify";

/**
 * data/templates.json（`pnpm fetch:templates` で生成）の読み込み・キャッシュ。
 * docs/DEVELOPMENT_PLAN.md §⑤: Phase 1 は BigQuery を毎回叩かない。
 * アプリはローカルにキャッシュしたJSONを読むだけ。
 */

const DATA_FILE = path.join(process.cwd(), "data", "templates.json");
// エラーメッセージにはコンテナ内の絶対パスを出さない（内部構造の開示を避けるため。
// 2026-09-26 security-review 指摘）。ユーザーには実行すべきコマンドだけ伝われば十分
const DATA_FILE_RELATIVE = path.join("data", "templates.json");

export class TemplatesFileNotFoundError extends Error {
  constructor() {
    super(
      `${DATA_FILE_RELATIVE} が見つかりません。'pnpm fetch:templates' を実行してテンプレート一覧を取得してください。`,
    );
    this.name = "TemplatesFileNotFoundError";
  }
}

export interface LoadResult {
  templates: Template[];
  /** zod 検証に失敗して除外した行数（隠さずに画面へ出す） */
  invalidCount: number;
  /** data/templates.json の最終更新日時（= BigQuery から取得した日時） */
  fetchedAt: string;
}

let cache: { mtimeMs: number; result: LoadResult } | null = null;

function readFile(): { raw: unknown; mtimeMs: number } {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(DATA_FILE);
  } catch {
    throw new TemplatesFileNotFoundError();
  }
  const text = fs.readFileSync(DATA_FILE, "utf-8");
  return { raw: JSON.parse(text), mtimeMs: stat.mtimeMs };
}

/**
 * テンプレート一覧を読み込む。ファイルの更新日時が変わっていれば再読込・再分類する
 * （`pnpm fetch:templates` を再実行してもサーバ再起動なしで反映されるように）。
 * 本文をログに出さない。
 */
export function loadTemplates(): LoadResult {
  const { raw, mtimeMs } = readFile();

  if (cache && cache.mtimeMs === mtimeMs) {
    return cache.result;
  }

  const { templates: base, invalidCount } = parseTemplates(raw);
  const templates = classifyAll(base);
  const result: LoadResult = {
    templates,
    invalidCount,
    fetchedAt: new Date(mtimeMs).toISOString(),
  };

  cache = { mtimeMs, result };
  return result;
}
