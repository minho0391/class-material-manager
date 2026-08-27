/**
 * Supabase DB 에서 **구조화 데이터**를 읽어 오는 부분.
 *
 * ■ 무엇을 읽고 무엇을 안 읽는가
 *
 * 읽습니다 (5개 중 4개 테이블):
 *   · material_metadata  → 자료 목록(Material) · 자료별 복습 요약(StudyMaterial)
 *   · learning_documents → 통합 학습자료 메타(LearningDocument, 코드 원문 제외)
 *   · comparisons        → 수업 방식 점검(ComparisonItem)
 *   · study_guides       → 다시 공부하기(StudyGuide)
 *
 * 읽지 않습니다:
 *   · 수업자료 본문(.md) · 실습 코드 원문 · 공식 문서 요약(references)
 *     → "원본 본문은 Supabase 에 저장하지 않는다"는 프로젝트 원칙에 따라 DB 에 없습니다.
 *       `data.ts` 가 지금처럼 로컬 `data/` 파일에서 읽습니다 (하이브리드).
 *   · relations 테이블 → 뷰어는 relations.json 을 직접 읽지 않습니다.
 *
 * ■ 실패는 곧 폴백입니다
 *
 * 문제가 생기면 (환경변수 없음 · 네트워크 · 권한 · 파싱) **예외를 던집니다.** 부르는
 * 쪽(`data.ts`)이 잡아 기존 파일 경로로 폴백합니다. "행이 0건"과 "읽지 못함"은 다릅니다
 * — 0건은 정상적으로 빈 배열/빈 값을 돌려줍니다.
 *
 * ■ 읽기 전용
 *
 * `.from(...).select(...)` 만 씁니다. 쓰기·RPC 없음. 로그인 세션(authenticated)으로
 * 접근하며, RLS SELECT 정책 + 테이블 GRANT 로 이 4개 테이블만 읽을 수 있습니다.
 * service_role 키는 뷰어 런타임에 들어오지 않습니다.
 */
import { createClient } from "./supabase/server";
import {
  COMPARISON_COLUMNS,
  LEARNING_DOC_COLUMNS,
  MATERIAL_COLUMNS,
  REFERENCE_COLUMNS,
  STUDY_GUIDE_COLUMNS,
  STUDY_MATERIAL_COLUMNS,
  latestStamp,
  toComparison,
  toLearningDocument,
  toMaterial,
  toReference,
  toStudyGuide,
  toStudyMaterials,
  type ComparisonRow,
  type LearningDocRow,
  type MaterialRow,
  type ReferenceRow,
  type StudyGuideRow,
  type StudyMaterialRow,
} from "./db-map";
import type {
  ComparisonItem,
  LearningDocument,
  Material,
  Reference,
  StudyGuide,
  StudyMaterial,
} from "./data";

/** Supabase 접속에 필요한 공개 환경변수가 있는지. 없으면 DB 경로를 시도조차 하지 않습니다. */
export function dbConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * 테이블 전체를 읽습니다. Supabase Data API 는 한 번에 최대 1000행만 주므로 range 로
 * 이어 읽습니다 (현재 데이터는 1000행 미만이지만, references/comparisons 가 늘어도
 * 뒷부분이 조용히 잘리지 않도록). error 가 있으면 던집니다 (부르는 쪽이 파일로 폴백).
 */
async function selectAll<Row>(table: string, columns: string): Promise<Row[]> {
  const supabase = await createClient();
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`Supabase select 실패 (${table}): ${error.message}`);
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export async function fetchMaterialsFromDb(): Promise<Material[]> {
  const rows = await selectAll<MaterialRow>("material_metadata", MATERIAL_COLUMNS);
  return rows.map(toMaterial);
}

export async function fetchStudyMaterialsFromDb(): Promise<StudyMaterial[]> {
  const rows = await selectAll<StudyMaterialRow>("material_metadata", STUDY_MATERIAL_COLUMNS);
  return toStudyMaterials(rows);
}

export async function fetchComparisonsFromDb(): Promise<{
  items: ComparisonItem[];
  generatedAt: string;
}> {
  const rows = await selectAll<ComparisonRow>("comparisons", COMPARISON_COLUMNS);
  return { items: rows.map(toComparison), generatedAt: latestStamp(rows) };
}

export async function fetchStudyGuidesFromDb(): Promise<{
  guides: StudyGuide[];
  generatedAt: string;
}> {
  const rows = await selectAll<StudyGuideRow>("study_guides", STUDY_GUIDE_COLUMNS);
  return { guides: rows.map(toStudyGuide), generatedAt: latestStamp(rows) };
}

export async function fetchLearningDocsFromDb(): Promise<LearningDocument[]> {
  const rows = await selectAll<LearningDocRow>("learning_documents", LEARNING_DOC_COLUMNS);
  return rows.map(toLearningDocument);
}

export async function fetchReferencesFromDb(): Promise<Reference[]> {
  const rows = await selectAll<ReferenceRow>("reference_documents", REFERENCE_COLUMNS);
  return rows.map(toReference);
}

/**
 * 자료 한 건의 텍스트 본문. 자료 상세(/m/[docId])에서만 부릅니다 — 목록·홈은 본문을
 * 끌고 오지 않습니다. 행이 없으면 null (뷰어가 로컬 파일 폴백 또는 메타데이터 화면).
 */
export async function fetchMaterialBodyFromDb(sourceId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_bodies")
    .select("body")
    .eq("source_id", sourceId)
    .maybeSingle();
  if (error) {
    throw new Error(`Supabase select 실패 (material_bodies): ${error.message}`);
  }
  return (data as { body: string } | null)?.body ?? null;
}

/**
 * 검색 haystack 용 — 모든 자료 본문을 한 번에 (source_id, body). 콜드 캐시마다 ~4MB.
 * 성능 문제가 확인되면 서버 사이드 검색으로 옮기는 것은 이후 별도 최적화.
 */
export async function fetchAllMaterialBodiesFromDb(): Promise<Array<{ sourceId: string; body: string }>> {
  const rows = await selectAll<{ source_id: string; body: string }>("material_bodies", "source_id,body");
  return rows.map((r) => ({ sourceId: r.source_id, body: r.body }));
}
