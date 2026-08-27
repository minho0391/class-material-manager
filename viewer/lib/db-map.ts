/**
 * Supabase 행(row) → 뷰어 인터페이스 변환기.
 *
 * 순수 함수만 있습니다 — 네트워크·쿠키·`next/headers` 에 의존하지 않아 따로 시험할 수
 * 있습니다. 실제 조회는 `db.ts` 가 하고, 여기 함수로 모양을 되돌립니다.
 *
 * sync 쪽 빌더(`src/sync/build-*.ts`)의 역변환입니다 — 전용 컬럼으로 못 옮긴 값은
 * jsonb(`extra`/`details`/`content`)에 그대로 들어가 있어, 그걸 풀어 원래 인터페이스로
 * 맞춥니다.
 */
import type {
  ComparisonItem,
  LearningDocument,
  LearningPractice,
  Material,
  Reference,
  StudyGuide,
  StudyMaterial,
} from "./data";

// ── 공통 도우미 ─────────────────────────────────────────────
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function asNum(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

// ═══════════════════════════════════════════════════════════
// material_metadata → Material
// ═══════════════════════════════════════════════════════════

export const MATERIAL_COLUMNS =
  "source_id,kind,title,subject,mime_type,source_url,file_path,source_modified_at,source_updated_at,occurrences,extra";

export interface MaterialRow {
  source_id: string;
  kind: string;
  title: string;
  subject: string | null;
  mime_type: string | null;
  source_url: string | null;
  file_path: string | null;
  source_modified_at: string | null;
  source_updated_at: string | null;
  occurrences: unknown;
  extra: Record<string, unknown> | null;
}

export function toMaterial(row: MaterialRow): Material {
  const extra = row.extra ?? {};
  return {
    docId: row.source_id,
    title: row.title,
    kind: row.kind,
    subject: row.subject ?? undefined,
    sourceUrl: row.source_url ?? "",
    filePath: row.file_path ?? "",
    downloadPath: asStr(extra.downloadPath),
    modifiedTime: row.source_modified_at ?? "",
    updatedAt: row.source_updated_at ?? "",
    occurrences: Array.isArray(row.occurrences)
      ? (row.occurrences as Material["occurrences"])
      : [],
    sizeBytes: asNum(extra.sizeBytes),
    pageCount: asNum(extra.pageCount),
    mimeType: row.mime_type ?? "",
    fileAction: asStr(extra.fileAction),
  };
}

// ═══════════════════════════════════════════════════════════
// material_metadata.extra.studyPriority → StudyMaterial
//
// study-guides.json 의 자료별 요약(materials[])은 별도 테이블 없이
// material_metadata.extra.studyPriority 에 자료 1건당 1개로 들어가 있습니다.
// ═══════════════════════════════════════════════════════════

export const STUDY_MATERIAL_COLUMNS = "source_id,title,subject,file_path,extra";

interface StudyPriorityBlob {
  priority: StudyMaterial["priority"];
  counts: StudyMaterial["counts"];
  topics: StudyMaterial["topics"];
}

export interface StudyMaterialRow {
  source_id: string;
  title: string;
  subject: string | null;
  file_path: string | null;
  extra: { studyPriority?: StudyPriorityBlob | null } | null;
}

/** studyPriority 가 있는 행만 StudyMaterial 로 바꿉니다. */
export function toStudyMaterials(rows: StudyMaterialRow[]): StudyMaterial[] {
  const materials: StudyMaterial[] = [];
  for (const row of rows) {
    const blob = row.extra?.studyPriority;
    if (!blob || !blob.priority) continue;
    materials.push({
      materialId: row.source_id,
      title: row.title,
      subject: row.subject ?? "",
      path: row.file_path ?? "",
      priority: blob.priority,
      counts: blob.counts,
      topics: blob.topics ?? [],
    });
  }
  return materials;
}

// ═══════════════════════════════════════════════════════════
// comparisons → ComparisonItem
// ═══════════════════════════════════════════════════════════

export const COMPARISON_COLUMNS =
  "id,subject,technology,status,change_type,severity,reason,needs_review,evidence,official,details,checked_at,generated_at";

export interface ComparisonRow {
  id: string;
  subject: string | null;
  technology: string | null;
  status: string;
  change_type: string | null;
  severity: string | null;
  reason: string | null;
  needs_review: boolean | null;
  evidence: unknown;
  official: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
  checked_at: string | null;
  generated_at: string | null;
}

export function toComparison(row: ComparisonRow): ComparisonItem {
  const d = row.details ?? {};
  const official =
    row.official && typeof row.official === "object" && Object.keys(row.official).length > 0
      ? (row.official as ComparisonItem["official"])
      : undefined;

  return {
    id: row.id,
    subject: row.subject ?? "",
    topic: row.technology ?? "",
    kind: d.kind === "package" ? "package" : "api",
    status: row.status,
    reason: row.reason ?? "",
    changeType: asStr(d.changeType) ?? row.change_type ?? undefined,
    severity: row.severity ?? undefined,
    oldPattern: asStr(d.oldPattern),
    currentPattern: asStr(d.currentPattern),
    recommendedAlternative: asStr(d.recommendedAlternative),
    lessons: asArray<ComparisonItem["lessons"][number]>(d.lessons),
    taughtIn: asArray<ComparisonItem["taughtIn"][number]>(d.taughtIn),
    usedIn: asArray<ComparisonItem["usedIn"][number]>(d.usedIn),
    official,
    versions: (d.versions as ComparisonItem["versions"]) ?? undefined,
    evidence: asArray<ComparisonItem["evidence"][number]>(row.evidence),
    lastComparedAt: row.checked_at ?? "",
    needsReview: row.needs_review ?? undefined,
  };
}

/** 여러 행 중 가장 늦은 generated_at (캐시 무효화용 스탬프). */
export function latestStamp(rows: Array<{ generated_at: string | null }>): string {
  return rows.reduce((max, r) => (r.generated_at && r.generated_at > max ? r.generated_at : max), "");
}

// ═══════════════════════════════════════════════════════════
// study_guides → StudyGuide
// ═══════════════════════════════════════════════════════════

export const STUDY_GUIDE_COLUMNS =
  "comparison_id,subject,learning_priority,explanation,recommended_alternative,study_point,details,generated_at";

export interface StudyGuideRow {
  comparison_id: string;
  subject: string | null;
  learning_priority: StudyGuide["learningPriority"];
  explanation: string | null;
  recommended_alternative: string | null;
  study_point: string | null;
  details: Record<string, unknown> | null;
  generated_at: string | null;
}

export function toStudyGuide(row: StudyGuideRow): StudyGuide {
  const d = row.details ?? {};
  return {
    comparisonId: row.comparison_id,
    subject: row.subject ?? "",
    topic: asStr(d.topic) ?? "",
    kind: d.kind === "package" ? "package" : "api",
    learningPriority: row.learning_priority,
    changeType: asStr(d.changeType) ?? "NONE",
    severity: asStr(d.severity) ?? "NONE",
    status: asStr(d.status) ?? "",
    explanation: row.explanation ?? "",
    lessonSummary: asStr(d.lessonSummary),
    statusSummary: asStr(d.statusSummary) ?? "",
    changeSummary: asStr(d.changeSummary) ?? "",
    oldPattern: asStr(d.oldPattern),
    oldCode: asStr(d.oldCode),
    currentPattern: asStr(d.currentPattern),
    recommendedAlternative: row.recommended_alternative ?? undefined,
    studyPoint: row.study_point ?? "",
    evidence: asArray<StudyGuide["evidence"][number]>(d.evidence),
    materials: asArray<StudyGuide["materials"][number]>(d.materials),
    practice: asArray<StudyGuide["practice"][number]>(d.practice),
    versions: (d.versions as StudyGuide["versions"]) ?? undefined,
    aiExplanation: asStr(d.aiExplanation),
    updatedAt: asStr(d.updatedAt) ?? row.generated_at ?? "",
  };
}

// ═══════════════════════════════════════════════════════════
// learning_documents → LearningDocument
//
// source_files 에 코드 원문(code)은 없습니다 — sync 가 경로·언어·이유만 남깁니다.
// code 는 부르는 쪽(`data.ts`)이 로컬 learning.json 이 있을 때만 채웁니다 (하이브리드).
// ═══════════════════════════════════════════════════════════

export const LEARNING_DOC_COLUMNS =
  "material_id,subject,title,practice_relations,source_files,official_docs,content";

interface PracticeRelationBlob {
  zipId: string;
  zipTitle: string;
  confidence: LearningPractice["confidence"];
  score: number;
  reasons: string[];
}
interface SourceFileBlob {
  zipId: string;
  zipTitle: string;
  path: string;
  language: string;
  reason: string;
  code?: string;
}
export interface LearningDocRow {
  material_id: string;
  subject: string | null;
  title: string | null;
  practice_relations: unknown;
  source_files: unknown;
  official_docs: unknown;
  content: Record<string, unknown> | null;
}

export function toLearningDocument(row: LearningDocRow): LearningDocument {
  const content = row.content ?? {};
  const relations = asArray<PracticeRelationBlob>(row.practice_relations);
  const files = asArray<SourceFileBlob>(row.source_files);

  const filesByZip = new Map<string, SourceFileBlob[]>();
  for (const file of files) {
    const list = filesByZip.get(file.zipId) ?? [];
    list.push(file);
    filesByZip.set(file.zipId, list);
  }

  const practice: LearningPractice[] = relations.map((relation) => ({
    zipId: relation.zipId,
    zipTitle: relation.zipTitle,
    confidence: relation.confidence,
    score: relation.score,
    reasons: relation.reasons ?? [],
    sourceFiles: (filesByZip.get(relation.zipId) ?? []).map((file) => ({
      path: file.path,
      language: file.language,
      reason: file.reason,
      // sync 가 code 를 채웁니다. 아직 백필 전이면 "" 이고, 로컬 learning.json 이 있으면
      // data.ts:loadLearningFromDb 가 덮어씁니다 (전환기 폴백).
      code: file.code ?? "",
    })),
  }));

  return {
    materialId: row.material_id,
    title: row.title ?? "",
    subject: row.subject ?? "",
    materialKind: asStr(content.materialKind) ?? "",
    materialPath: asStr(content.materialPath) ?? "",
    sourceUrl: asStr(content.sourceUrl) ?? "",
    practice,
    references: asArray<LearningDocument["references"][number]>(row.official_docs),
  };
}

// ═══════════════════════════════════════════════════════════
// reference_documents → Reference
//
// 공식 문서(references) 발췌본. frontmatter 는 sync 에서 이미 파싱해 컬럼으로 저장돼
// 있으므로 여기서는 YAML/gray-matter 를 실행하지 않습니다.
// ═══════════════════════════════════════════════════════════

export const REFERENCE_COLUMNS =
  "subject,slug,title,source_url,source_name,language,fetched_at,mentions,related_materials,body";

export interface ReferenceRow {
  subject: string;
  slug: string;
  title: string;
  source_url: string | null;
  source_name: string | null;
  language: string;
  fetched_at: string | null;
  mentions: number | null;
  related_materials: unknown;
  body: string;
}

export function toReference(row: ReferenceRow): Reference {
  return {
    subject: row.subject,
    slug: row.slug,
    title: row.title,
    sourceUrl: row.source_url ?? "",
    sourceName: row.source_name ?? "",
    language: row.language ?? "en",
    fetchedAt: row.fetched_at ?? "",
    mentions: row.mentions ?? 0,
    relatedMaterials: asArray<string>(row.related_materials),
    body: row.body,
  };
}
