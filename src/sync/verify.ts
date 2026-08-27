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
import { buildMaterialBodyRows } from "./build-material-bodies.ts";
import { buildReferenceRows } from "./build-references.ts";
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
  materialBodies: SetDiff & { orphanSourceIds: string[] };
  referenceDocuments: SetDiff;
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

  const bodyRows = await buildMaterialBodyRows(index);
  const referenceRows = await buildReferenceRows();

  log.step("Supabase 에서 실제 저장된 행을 읽습니다");
  const [dbMaterials, dbRelations, dbLearning, dbComparisons, dbStudyGuides, dbBodies, dbReferences] =
    await Promise.all([
    selectRows<{ source_id: string }>(env, "material_metadata", "select=source_id"),
    // id는 bigint 컬럼입니다. 캐스트 없이 select하면 PostgREST가 JSON 숫자로 돌려주는데,
    // stableBigIntId()가 만드는 19자리 값은 JS의 안전 정수 범위(2^53)를 넘어 정밀도가
    // 깨지고, 타입도 로컬에서 만든 문자열 id와 달라 Set 비교가 전부 실패합니다.
    // ::text로 캐스트해 원래 값 그대로 문자열로 받습니다.
    selectRows<{ id: string; material_id: string; zip_id: string }>(
      env,
      "relations",
      "select=id::text,material_id,zip_id",
    ),
    selectRows<{ material_id: string }>(env, "learning_documents", "select=material_id"),
    selectRows<{ id: string; material_id: string | null }>(env, "comparisons", "select=id,material_id"),
    selectRows<{ comparison_id: string; material_id: string | null }>(
      env,
      "study_guides",
      "select=comparison_id,material_id",
    ),
    selectRows<{ source_id: string }>(env, "material_bodies", "select=source_id"),
    selectRows<{ subject: string; slug: string }>(
      env,
      "reference_documents",
      "select=subject,slug",
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

  // ── material_bodies (텍스트 본문) ──
  const jsonBodyIds = new Set(bodyRows.map((r) => r.source_id));
  const dbBodyIds = new Set(dbBodies.map((r) => r.source_id));
  const materialBodies = {
    ...diffSets(jsonBodyIds, dbBodyIds),
    orphanSourceIds: [...dbBodyIds].filter((id) => !dbMaterialIds.has(id)),
  };

  // ── reference_documents (공식 문서 발췌본) ──
  const jsonReferenceIds = new Set(referenceRows.map((r) => `${r.subject}/${r.slug}`));
  const dbReferenceIds = new Set(dbReferences.map((r) => `${r.subject}/${r.slug}`));
  const referenceDocuments = diffSets(jsonReferenceIds, dbReferenceIds);

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
    materialBodies,
    referenceDocuments,
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

  if (report.materialBodies.missingInDb.length > 0) return true;
  if (report.materialBodies.orphanSourceIds.length > 0) return true;
  // material_bodies·reference_documents 는 순수 파생 캐시입니다 (다른 시험 데이터와 섞이지
  // 않음). 뷰어가 이 테이블을 DB 우선으로 통째로 읽으므로, 원본 산출물에 없는 DB 행
  // (소스가 지워졌는데 남은 stale row)은 잘못된 내용이 계속 노출된다는 뜻 — 실패로 봅니다.
  if (report.materialBodies.extraInDb.length > 0) return true;

  if (report.referenceDocuments.missingInDb.length > 0) return true;
  if (report.referenceDocuments.extraInDb.length > 0) return true;

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

/**
 * 검증에서 찾은 문제를 한두 줄로 요약합니다. `release_refresh`의 `last_error`처럼
 * 콘솔이 아니라 DB에 저장해 나중에 다시 읽을 짧은 텍스트가 필요한 곳에서 씁니다.
 * 어떤 로그도 안 남기고 문자열만 돌려줍니다 — 실제 출력은 printVerifyReport 몫입니다.
 */
export function summarizeVerifyProblems(report: VerifyReport): string {
  const parts: string[] = [];

  const describe = (
    label: string,
    diff: { missingInDb: string[]; duplicatesInJson: string[] },
  ) => {
    if (diff.missingInDb.length > 0) parts.push(`${label} 누락 ${diff.missingInDb.length}건`);
    if (diff.duplicatesInJson.length > 0) parts.push(`${label} 중복 ${diff.duplicatesInJson.length}건`);
  };

  describe("material_metadata", report.materialMetadata);
  if (report.materialBodies.missingInDb.length > 0) {
    parts.push(`material_bodies 누락 ${report.materialBodies.missingInDb.length}건`);
  }
  if (report.materialBodies.extraInDb.length > 0) {
    parts.push(`material_bodies stale 행 ${report.materialBodies.extraInDb.length}건`);
  }
  if (report.materialBodies.orphanSourceIds.length > 0) parts.push("material_bodies FK 고아행");
  if (report.referenceDocuments.missingInDb.length > 0) {
    parts.push(`reference_documents 누락 ${report.referenceDocuments.missingInDb.length}건`);
  }
  if (report.referenceDocuments.extraInDb.length > 0) {
    parts.push(`reference_documents stale 행 ${report.referenceDocuments.extraInDb.length}건`);
  }
  if (report.relations.jsonCount !== report.relations.dbCount) parts.push("relations 건수 불일치");
  if (report.relations.missingRelationIds.length > 0) {
    parts.push(`relations 누락 ${report.relations.missingRelationIds.length}건`);
  }
  if (report.relations.orphanMaterialIds.length > 0 || report.relations.orphanZipIds.length > 0) {
    parts.push("relations FK 고아행");
  }
  describe("learning_documents", report.learningDocuments);
  if (report.learningDocuments.orphanMaterialIds.length > 0) parts.push("learning_documents FK 고아행");
  describe("comparisons", report.comparisons);
  if (report.comparisons.orphanMaterialIds.length > 0) parts.push("comparisons FK 고아행");
  describe("study_guides", report.studyGuides);
  if (report.studyGuides.orphanComparisonIds.length > 0 || report.studyGuides.orphanMaterialIds.length > 0) {
    parts.push("study_guides FK 고아행");
  }

  return parts.length > 0
    ? `이관 검증 실패: ${parts.join(", ")} (전체 상세는 GitHub Actions 로그 참고)`
    : "이관 검증 실패 (원인 미상 — printVerifyReport 로그 참고)";
}

/**
 * 검증 결과를 사람이 읽을 수 있게 로그로 찍습니다. `sync-supabase` CLI(index.ts)와
 * `ci-refresh`(auto-refresh.ts) 둘 다 이 함수를 씁니다 — 어디서 실행하든 똑같은 상세
 * 내역(어떤 테이블의 어떤 ID가 문제인지)을 볼 수 있어야, CI 로그만 보고도 원인을
 * 바로 알 수 있습니다.
 *
 * @returns hasVerifyProblems(report) 와 같은 값. 호출부는 이 값으로 성공/실패를 정합니다.
 */
export function printVerifyReport(report: VerifyReport): boolean {
  const printSetDiff = (
    label: string,
    diff: { jsonCount: number; dbCount: number; missingInDb: string[]; extraInDb: string[] },
    duplicatesInJson: string[],
  ) => {
    log.info(`\n${label}`);
    log.detail(`  원본(JSON) ${diff.jsonCount}건 / DB ${diff.dbCount}건`);
    if (diff.missingInDb.length > 0) {
      log.error(`  누락 ${diff.missingInDb.length}건: ${diff.missingInDb.slice(0, 10).join(", ")}`);
    } else {
      log.success("  누락 없음");
    }
    if (diff.extraInDb.length > 0) {
      log.warn(`  DB에만 있는 행 ${diff.extraInDb.length}건 (다른 시험/이전 데이터일 수 있음): ${diff.extraInDb.slice(0, 10).join(", ")}`);
    }
    if (duplicatesInJson.length > 0) {
      log.error(`  원본 JSON 중복 ID ${duplicatesInJson.length}건: ${duplicatesInJson.join(", ")}`);
    } else {
      log.success("  중복 없음");
    }
  };

  printSetDiff("material_metadata", report.materialMetadata, report.materialMetadata.duplicatesInJson);

  printSetDiff("material_bodies", report.materialBodies, []);
  if (report.materialBodies.extraInDb.length > 0) {
    log.error(
      `  ↑ 이 stale 행은 정리해야 합니다 (파생 캐시라 원본에 없는 행 = 잘못된 내용 노출). ` +
        `수동: delete from public.material_bodies where source_id in (...)`,
    );
  }
  if (report.materialBodies.orphanSourceIds.length > 0) {
    log.error(`  FK 고아행(source_id) ${report.materialBodies.orphanSourceIds.length}건`);
  } else {
    log.success("  FK 정상");
  }

  printSetDiff("reference_documents", report.referenceDocuments, []);
  if (report.referenceDocuments.extraInDb.length > 0) {
    log.error(
      `  ↑ 이 stale 행은 정리해야 합니다. ` +
        `수동: delete from public.reference_documents where (subject, slug) in (...)`,
    );
  }

  log.info("\nrelations");
  log.detail(`  원본(JSON) ${report.relations.jsonCount}건 / DB ${report.relations.dbCount}건`);
  if (report.relations.jsonCount !== report.relations.dbCount) {
    log.error("  건수가 다릅니다");
  } else {
    log.success("  건수 일치");
  }
  if (report.relations.missingRelationIds.length > 0) {
    log.error(`  누락된 관계 ${report.relations.missingRelationIds.length}건: ${report.relations.missingRelationIds.slice(0, 10).join(", ")}`);
  }
  if (report.relations.orphanMaterialIds.length > 0 || report.relations.orphanZipIds.length > 0) {
    log.error(
      `  FK 고아행 — material_id ${report.relations.orphanMaterialIds.length}건, zip_id ${report.relations.orphanZipIds.length}건`,
    );
  } else {
    log.success("  FK 정상");
  }

  printSetDiff("learning_documents", report.learningDocuments, report.learningDocuments.duplicatesInJson);
  if (report.learningDocuments.orphanMaterialIds.length > 0) {
    log.error(`  FK 고아행(material_id) ${report.learningDocuments.orphanMaterialIds.length}건`);
  }

  printSetDiff("comparisons", report.comparisons, report.comparisons.duplicatesInJson);
  if (report.comparisons.orphanMaterialIds.length > 0) {
    log.error(`  FK 고아행(material_id) ${report.comparisons.orphanMaterialIds.length}건`);
  }

  printSetDiff("study_guides", report.studyGuides, report.studyGuides.duplicatesInJson);
  if (report.studyGuides.orphanComparisonIds.length > 0 || report.studyGuides.orphanMaterialIds.length > 0) {
    log.error(
      `  FK 고아행 — comparison_id ${report.studyGuides.orphanComparisonIds.length}건, material_id ${report.studyGuides.orphanMaterialIds.length}건`,
    );
  }

  const hasProblem = hasVerifyProblems(report);
  log.info("");
  if (hasProblem) {
    log.error("검증에서 문제를 찾았습니다. 위 내용을 확인하세요.");
  } else {
    log.success("모든 테이블이 원본과 일치하고 FK 고아행이 없습니다.");
  }
  return hasProblem;
}
