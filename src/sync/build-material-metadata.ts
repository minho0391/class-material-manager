/**
 * index.json → material_metadata 행 변환.
 *
 * study-guides.json 의 자료별 요약(StudyMaterial, 89건)은 material_metadata 1행과
 * 정확히 1:1 대응하는 "자료별" 데이터라 별도 테이블 없이 extra.studyPriority 로
 * 함께 담습니다 (schema-design.md 의 study_priorities 테이블은 실제 DB에 만들어지지
 * 않았고, 이번 작업은 확정 스키마를 바꾸지 않는 것이 원칙이라 기존 jsonb 컬럼을 씁니다).
 */
import type { IndexData, IndexEntry } from "../store/index-store.ts";
import type { StudyData, StudyMaterial } from "../store/study-store.ts";

export interface MaterialMetadataRow {
  source_id: string;
  kind: string;
  title: string;
  subject: string | null;
  mime_type: string | null;
  format: string | null;
  source_url: string | null;
  file_path: string | null;
  content_hash: string | null;
  source_modified_at: string | null;
  collected_at: string | null;
  source_updated_at: string | null;
  occurrences: unknown;
  extra: Record<string, unknown>;
}

/** 전용 컬럼으로 옮긴 필드는 extra 에 중복해서 넣지 않습니다. */
const MAPPED_KEYS = new Set<keyof IndexEntry>([
  "docId",
  "kind",
  "title",
  "mimeType",
  "format",
  "sourceUrl",
  "occurrences",
  "contentHash",
  "modifiedTime",
  "collectedAt",
  "updatedAt",
  "filePath",
  "subject",
]);

export function buildMaterialMetadataRows(
  index: IndexData,
  study: StudyData | null,
  existingExtra: Map<string, Record<string, unknown>> = new Map(),
): MaterialMetadataRow[] {
  const studyByMaterial = new Map<string, StudyMaterial>();
  if (study) {
    for (const material of study.materials) studyByMaterial.set(material.materialId, material);
  }

  return Object.values(index.entries).map((entry) => {
    // upsert는 extra 컬럼 전체를 통째로 덮어씁니다. DB에 이미 있던 extra 를 먼저 펼치고
    // 그 위에 이번에 계산한 값을 얹어야, 이 스크립트가 모르는 다른 기능이 나중에 extra 에
    // 적어 둔 값을 재실행할 때 지우지 않습니다.
    const extra: Record<string, unknown> = { ...existingExtra.get(entry.docId) };
    for (const [key, value] of Object.entries(entry) as [keyof IndexEntry, unknown][]) {
      if (!MAPPED_KEYS.has(key) && value !== undefined) extra[key] = value;
    }

    // 이번 study-guides.json 기준으로 매번 다시 씁니다. studyMaterial 이 없으면 명시적으로
    // undefined 를 넣어 지웁니다 (JSON.stringify 가 undefined 키를 빼주므로, 이 자료가 더 이상
    // 우선순위 목록에 없을 때 예전 값이 extra 에 그대로 남는 것을 막습니다).
    const studyMaterial = studyByMaterial.get(entry.docId);
    extra.studyPriority = studyMaterial
      ? { priority: studyMaterial.priority, counts: studyMaterial.counts, topics: studyMaterial.topics }
      : undefined;

    return {
      source_id: entry.docId,
      kind: entry.kind,
      title: entry.title,
      subject: entry.subject ?? null,
      mime_type: entry.mimeType ?? null,
      format: entry.format ?? null,
      source_url: entry.sourceUrl ?? null,
      file_path: entry.filePath ?? null,
      content_hash: entry.contentHash ?? null,
      source_modified_at: entry.modifiedTime ?? null,
      collected_at: entry.collectedAt ?? null,
      source_updated_at: entry.updatedAt ?? null,
      occurrences: entry.occurrences,
      extra,
    };
  });
}
