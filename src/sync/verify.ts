/**
 * 이관 후 검증 — 원본 JSON과 실제 Supabase DB를 대조합니다.
 *
 * 단순 COUNT(*) 비교가 아니라 각 테이블의 식별자 집합을 직접 견주어
 * 누락(JSON에는 있는데 DB에 없음) · DB전용(DB에는 있는데 JSON에 없음, 옛 시험데이터 등) ·
 * FK 고아행(참조 대상이 없음) 을 모두 찾아냅니다.
 */
import { loadIndex } from "../store/index-store.ts";
import { loadRelations } from "../store/relation-store.ts";
import { loadLearning } from "../store/learning-store.ts";
import { loadComparisons } from "../store/comparison-store.ts";
import { loadStudyGuides } from "../store/study-store.ts";
import { loadSupabaseEnv } from "./env.ts";
import { selectRows } from "./postgrest-client.ts";
import { buildRelationRows } from "./build-relations.ts";
import * as log from "../utils/logger.ts";

interface SetDiff {
  jsonCount: number;
  dbCount: number;
  missingInDb: string[];
  extraInDb: string[];
}

function diffSets(jsonIds: Set<string>, dbIds: Set<string>): SetDiff {
  const missingInDb = [...jsonIds].filter((id) => !dbIds.has(id));
  const extraInDb = [...dbIds].filter((id) => !jsonIds.has(id));
  return { jsonCount: jsonIds.size, dbCount: dbIds.size, missingInDb, extraInDb };
}

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

export interface VerifyReport {
  materialMetadata: SetDiff & { duplicatesInJson: string[] };
  relations: {
    jsonCount: number;
    dbCount: number;
    orphanMaterialIds: string[];
    orphanZipIds: string[];
    missingRelationIds: string[];
  };
  learningDocuments: SetDiff & { duplicatesInJson: string[]; orphanMaterialIds: string[] };
  comparisons: SetDiff & { duplicatesInJson: string[]; orphanMaterialIds: string[] };
  studyGuides: SetDiff & {
    duplicatesInJson: string[];
    orphanComparisonIds: string[];
    orphanMaterialIds: string[];
  };
}

export async function verifySupabase(): Promise<VerifyReport> {
  const env = loadSupabaseEnv();

  const [index, relations, learning, comparisons, study] = await Promise.all([
    loadIndex(),
    loadRelations(),
    loadLearning(),
    loadComparisons(),
    loadStudyGuides(),
  ]);

  log.step("Supabase 에서 실제 저장된 행을 읽습니다");
  const [dbMaterials, dbRelations, dbLearning, dbComparisons, dbStudyGuides] = await Promise.all([
    selectRows<{ source_id: string }>(env, "material_metadata", "select=source_id"),
    selectRows<{ id: string; material_id: string; zip_id: string }>(
      env,
      "relations",
      "select=id,material_id,zip_id",
    ),
    selectRows<{ material_id: string }>(env, "learning_documents", "select=material_id"),
    selectRows<{ id: string; material_id: string | null }>(env, "comparisons", "select=id,material_id"),
    selectRows<{ comparison_id: string; material_id: string | null }>(
      env,
      "study_guides",
      "select=comparison_id,material_id",
    ),
  ]);

  const dbMaterialIds = new Set(dbMaterials.map((r) => r.source_id));

  // ── material_metadata ──
  const jsonMaterialIds = new Set(Object.keys(index.entries));
  const materialDiff = diffSets(jsonMaterialIds, dbMaterialIds);
  const materialMetadata = {
    ...materialDiff,
    duplicatesInJson: findDuplicates(Object.values(index.entries).map((e) => e.docId)),
  };

  // ── relations (자체 id 없음 — materialId+zipId 조합 기준으로 FK 고아만 검사) ──
  const relationRows = relations ? buildRelationRows(relations) : [];
  const dbRelationIds = new Set(dbRelations.map((r) => r.id));
  const missingRelationIds = relationRows
    .filter((r) => !dbRelationIds.has(r.id))
    .map((r) => `${r.material_id} -> ${r.zip_id}`);
  const orphanMaterialIds = [
    ...new Set(dbRelations.filter((r) => !dbMaterialIds.has(r.material_id)).map((r) => r.material_id)),
  ];
  const orphanZipIds = [
    ...new Set(dbRelations.filter((r) => !dbMaterialIds.has(r.zip_id)).map((r) => r.zip_id)),
  ];
  const relationsReport = {
    jsonCount: relationRows.length,
    dbCount: dbRelations.length,
    orphanMaterialIds,
    orphanZipIds,
    missingRelationIds,
  };

  // ── learning_documents ──
  const jsonLearningIds = new Set((learning?.documents ?? []).map((d) => d.materialId));
  const dbLearningIds = new Set(dbLearning.map((r) => r.material_id));
  const learningDiff = diffSets(jsonLearningIds, dbLearningIds);
  const learningDocuments = {
    ...learningDiff,
    duplicatesInJson: findDuplicates((learning?.documents ?? []).map((d) => d.materialId)),
    orphanMaterialIds: [...dbLearningIds].filter((id) => !dbMaterialIds.has(id)),
  };

  // ── comparisons ──
  const jsonComparisonIds = new Set((comparisons?.items ?? []).map((i) => i.id));
  const dbComparisonIds = new Set(dbComparisons.map((r) => r.id));
  const comparisonDiff = diffSets(jsonComparisonIds, dbComparisonIds);
  const comparisonsReport = {
    ...comparisonDiff,
    duplicatesInJson: findDuplicates((comparisons?.items ?? []).map((i) => i.id)),
    orphanMaterialIds: [
      ...new Set(
        dbComparisons
          .filter((r) => r.material_id !== null && !dbMaterialIds.has(r.material_id))
          .map((r) => r.material_id as string),
      ),
    ],
  };

  // ── study_guides ──
  const jsonGuideIds = new Set((study?.guides ?? []).map((g) => g.comparisonId));
  const dbGuideIds = new Set(dbStudyGuides.map((r) => r.comparison_id));
  const guideDiff = diffSets(jsonGuideIds, dbGuideIds);
  const studyGuidesReport = {
    ...guideDiff,
    duplicatesInJson: findDuplicates((study?.guides ?? []).map((g) => g.comparisonId)),
    orphanComparisonIds: [...dbGuideIds].filter((id) => !dbComparisonIds.has(id)),
    orphanMaterialIds: [
      ...new Set(
        dbStudyGuides
          .filter((r) => r.material_id !== null && !dbMaterialIds.has(r.material_id as string))
          .map((r) => r.material_id as string),
      ),
    ],
  };

  return {
    materialMetadata,
    relations: relationsReport,
    learningDocuments,
    comparisons: comparisonsReport,
    studyGuides: studyGuidesReport,
  };
}

/**
 * 검증 결과에 실제로 문제가 있는지만 훑어 true/false 로 답합니다.
 *
 * `sync-supabase` CLI 명령이 화면에 찍는 조건과 같은 조건입니다 (index.ts 참고).
 * 자동 갱신처럼 사람이 보지 않고 성공/실패만 판단해야 하는 곳에서 씁니다 —
 * "누락 없음"을 다시 판단하는 로직을 두 곳에 따로 두면 언젠가 서로 어긋납니다.
 */
export function hasVerifyProblems(report: VerifyReport): boolean {
  if (report.materialMetadata.missingInDb.length > 0) return true;
  if (report.materialMetadata.duplicatesInJson.length > 0) return true;

  if (report.relations.jsonCount !== report.relations.dbCount) return true;
  if (report.relations.missingRelationIds.length > 0) return true;
  if (report.relations.orphanMaterialIds.length > 0 || report.relations.orphanZipIds.length > 0) return true;

  if (report.learningDocuments.missingInDb.length > 0) return true;
  if (report.learningDocuments.duplicatesInJson.length > 0) return true;
  if (report.learningDocuments.orphanMaterialIds.length > 0) return true;

  if (report.comparisons.missingInDb.length > 0) return true;
  if (report.comparisons.duplicatesInJson.length > 0) return true;
  if (report.comparisons.orphanMaterialIds.length > 0) return true;

  if (report.studyGuides.missingInDb.length > 0) return true;
  if (report.studyGuides.duplicatesInJson.length > 0) return true;
  if (report.studyGuides.orphanComparisonIds.length > 0) return true;
  if (report.studyGuides.orphanMaterialIds.length > 0) return true;

  return false;
}
