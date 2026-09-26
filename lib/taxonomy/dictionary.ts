import { z } from "zod";
import taxonomyJson from "@/config/taxonomy.json";

/**
 * 分類辞書の読み込み口。
 * docs/DEVELOPMENT_PLAN.md §⑤「辞書をコードの中に埋めない」に従い、
 * ルールは config/taxonomy.json に置く。Phase 1.5 でスプレッドシート等に
 * 差し替えるときは、このファイルの読み込み処理だけを差し替えればよい。
 */

const sceneRuleSchema = z.object({
  scene: z.string(),
  product: z.string(),
  purpose: z.string(),
  keywords: z.array(z.string().min(1)).min(1),
});

const franchiseGroupSchema = z.object({
  label: z.string(),
  options: z.array(z.string().min(1)).min(1),
});

const taxonomySchema = z.object({
  products: z.array(z.string()),
  purposes: z.array(z.string()),
  scenes: z.array(sceneRuleSchema),
  franchiseGroups: z.array(franchiseGroupSchema),
  customerTypes: z.array(z.string()),
  stages: z.array(z.string()),
  testPatterns: z.array(z.string()),
});

export type SceneRule = z.infer<typeof sceneRuleSchema>;
export type FranchiseGroup = z.infer<typeof franchiseGroupSchema>;
export type Taxonomy = z.infer<typeof taxonomySchema>;

let cached: Taxonomy | null = null;

export function getTaxonomy(): Taxonomy {
  if (!cached) {
    cached = taxonomySchema.parse(taxonomyJson);
  }
  return cached;
}

export function allFranchises(taxonomy: Taxonomy = getTaxonomy()): string[] {
  return taxonomy.franchiseGroups.flatMap((g) => g.options);
}
