/**
 * data/ 산출물을 Supabase 7개 테이블로 이관합니다.
 *
 * 순서가 중요합니다 — material_bodies/relations/learning_documents/comparisons 는
 * material_metadata 를 FK로 참조하고, study_guides 는 comparisons 를 참조합니다. 그래서
 * material_metadata → material_bodies → relations/learning_documents/comparisons →
 * study_guides → reference_documents(FK 없음) 순으로 올립니다.
 *
 * 모두 upsert이므로 이미 부분 이관된 데이터나 기존 행을 지우지 않고 덮어씁니다.
 * 원본 파일(PDF/DOCX/ZIP)은 이관 대상이 아닙니다 — 텍스트 추출본만 올립니다.
 */
import { loadIndex } from "../store/index-store.ts";
import { loadRelations } from "../store/relation-store.ts";
import { loadLearning } from "../store/learning-store.ts";
import { loadComparisons } from "../store/comparison-store.ts";
import { loadStudyGuides } from "../store/study-store.ts";
import { loadSupabaseEnv } from "./env.ts";
import { selectRows, upsertRows } from "./postgrest-client.ts";
import { buildMaterialMetadataRows } from "./build-material-metadata.ts";
import { buildMaterialBodyRows } from "./build-material-bodies.ts";
import { buildRelationRows } from "./build-relations.ts";
import { buildLearningDocumentRows } from "./build-learning-documents.ts";
import { buildComparisonRows } from "./build-comparisons.ts";
import { buildStudyGuideRows } from "./build-study-guides.ts";
import { buildReferenceRows } from "./build-references.ts";
import * as log from "../utils/logger.ts";

/** 본문 행은 크므로(자료당 평균 ~11KB, 최대 ~236KB) 청크를 작게 잡습니다. */
const BODY_CHUNK_SIZE = 40;

export interface SyncSummary {
  materialMetadata: number;
  materialBodies: number;
  relations: number;
  learningDocuments: number;
  comparisons: number;
  studyGuides: number;
  referenceDocuments: number;
}

export async function syncSupabase(): Promise<SyncSummary> {
  const env = loadSupabaseEnv();

  log.step("data/ 산출물을 읽습니다");
  const index = await loadIndex();
  const relations = await loadRelations();
  const learning = await loadLearning();
  const comparisons = await loadComparisons();
  const study = await loadStudyGuides();

  log.detail(`index.json: ${Object.keys(index.entries).length}건`);
  log.detail(`relations.json: ${relations?.relations.length ?? 0}건`);
  log.detail(`learning.json: ${learning?.documents.length ?? 0}건`);
  log.detail(`comparisons.json: ${comparisons?.items.length ?? 0}건`);
  log.detail(
    `study-guides.json: guides ${study?.guides.length ?? 0}건 · materials ${study?.materials.length ?? 0}건`,
  );

  log.step("1/7 material_metadata 이관");
  // upsert는 extra 컬럼 전체를 덮어쓰므로, 이 스크립트가 모르는 다른 기능이 나중에 extra 에
  // 적어 둔 값이 있다면 먼저 읽어서 보존합니다 (재실행해도 안전하도록).
  const existingMaterials = await selectRows<{ source_id: string; extra: Record<string, unknown> }>(
    env,
    "material_metadata",
    "select=source_id,extra",
  );
  const existingExtra = new Map(existingMaterials.map((row) => [row.source_id, row.extra ?? {}]));
  const materialRows = buildMaterialMetadataRows(index, study, existingExtra);
  await upsertRows(env, "material_metadata", materialRows, "source_id");
  log.success(`material_metadata upsert ${materialRows.length}건`);

  log.step("2/7 material_bodies 이관 (텍스트 본문)");
  const bodyRows = await buildMaterialBodyRows(index);
  await upsertRows(env, "material_bodies", bodyRows, "source_id", BODY_CHUNK_SIZE);
  log.success(`material_bodies upsert ${bodyRows.length}건`);

  log.step("3/7 relations 이관");
  const relationRows = relations ? buildRelationRows(relations) : [];
  await upsertRows(env, "relations", relationRows, "id");
  log.success(`relations upsert ${relationRows.length}건`);

  log.step("4/7 learning_documents 이관 (실습 코드 텍스트 포함)");
  const learningRows = learning ? buildLearningDocumentRows(learning) : [];
  await upsertRows(env, "learning_documents", learningRows, "material_id");
  log.success(`learning_documents upsert ${learningRows.length}건`);

  log.step("5/7 comparisons 이관");
  const comparisonRows = comparisons ? buildComparisonRows(comparisons) : [];
  await upsertRows(env, "comparisons", comparisonRows, "id");
  log.success(`comparisons upsert ${comparisonRows.length}건`);

  log.step("6/7 study_guides 이관");
  const studyRows = study ? buildStudyGuideRows(study) : [];
  await upsertRows(env, "study_guides", studyRows, "comparison_id");
  log.success(`study_guides upsert ${studyRows.length}건`);

  log.step("7/7 reference_documents 이관 (공식 문서 발췌본)");
  const referenceRows = await buildReferenceRows();
  await upsertRows(env, "reference_documents", referenceRows, "subject,slug", BODY_CHUNK_SIZE);
  log.success(`reference_documents upsert ${referenceRows.length}건`);

  return {
    materialMetadata: materialRows.length,
    materialBodies: bodyRows.length,
    relations: relationRows.length,
    learningDocuments: learningRows.length,
    comparisons: comparisonRows.length,
    studyGuides: studyRows.length,
    referenceDocuments: referenceRows.length,
  };
}
