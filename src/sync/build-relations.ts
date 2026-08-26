/**
 * relations.json → relations 행 변환.
 *
 * materialTitle · materialKind · zipTitle 은 material_id/zip_id 로 material_metadata 를
 * 조인하면 그대로 얻을 수 있어 중복 저장하지 않습니다.
 */
import type { RelationData } from "../store/relation-store.ts";
import { stableBigIntId } from "./stable-id.ts";

export interface RelationRow {
  id: string;
  material_id: string;
  zip_id: string;
  subject: string | null;
  confidence: string;
  score: number;
  reasons: unknown;
  source_files: unknown;
  generated_at: string;
}

export function buildRelationRows(data: RelationData): RelationRow[] {
  return data.relations.map((relation) => ({
    id: stableBigIntId(relation.materialId, relation.zipId),
    material_id: relation.materialId,
    zip_id: relation.zipId,
    subject: relation.subject ?? null,
    confidence: relation.confidence,
    score: relation.score,
    reasons: relation.reasons,
    source_files: relation.sourceFiles,
    generated_at: data.generatedAt,
  }));
}
