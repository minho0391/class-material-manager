/**
 * 학습용 실전 예제(Momentalk 등) 읽기.
 *
 * ■ 수업자료와 분리된 데이터
 *
 * 이 모듈은 `project_examples` 테이블 / `project-examples/*.json` 파일만 읽습니다.
 * 수업자료 파이프라인(`data.ts` · `db.ts` · 5+2개 테이블)과 섞이지 않습니다 —
 * 자동 갱신·검증도 이 데이터를 건드리지 않습니다.
 *
 * ■ DB 우선, 없으면 로컬 파일
 *
 * `data.ts` 의 하이브리드 원칙을 그대로 따릅니다. Supabase 공개 환경변수가 있으면
 * `project_examples` 를 읽고, 없거나 실패하거나 0건이면 저장소에 커밋된
 * `project-examples/*.json` 으로 폴백합니다. 배포 환경(로컬 파일 없음)에서는 DB 만 씁니다.
 *
 * ■ 읽기 전용
 *
 * `.select()` 만 씁니다. 코드 원문(code)은 원본 저장소 커밋에서 잘라 온 그대로입니다.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "./supabase/server";
import { dbConfigured } from "./db";

/** 실전 예제 한 건 */
export interface ProjectExample {
  id: string;
  project: string;
  repoUrl: string;
  repoRef: string;
  title: string;
  summary: string;
  subject: string | null;
  concepts: string[];
  filePath: string;
  fileUrl: string;
  language: string | null;
  code: string;
  lineStart: number | null;
  lineEnd: number | null;
  /** 연결 가능한 수업자료 docId 목록 */
  relatedMaterialIds: string[];
  /** 팀 역할(저장소 README 기준) 관련 메모 — 파일 단위 작성자 추정 아님 */
  authorshipNote: string | null;
  ord: number;
}

interface ProjectExampleRow {
  id: string;
  project: string;
  repo_url: string;
  repo_ref: string;
  title: string;
  summary: string;
  subject: string | null;
  concepts: unknown;
  file_path: string;
  file_url: string;
  language: string | null;
  code: string;
  line_start: number | null;
  line_end: number | null;
  related_material_ids: unknown;
  authorship_note: string | null;
  ord: number | null;
}

const COLUMNS =
  "id,project,repo_url,repo_ref,title,summary,subject,concepts,file_path,file_url,language,code,line_start,line_end,related_material_ids,authorship_note,ord";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * repo_url / file_url 은 항상 GitHub 웹 주소입니다. http(s) 가 아니면 빈 문자열로 두어
 * 링크 버튼이 렌더되지 않게 합니다 (파일 폴백 경로는 sync 검증을 거치지 않으므로 여기서
 * 한 번 더 확인 — DB 경로는 src/sync/build-project-examples.ts 가 이미 걸러냅니다).
 */
function httpUrlOrEmpty(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const scheme = new URL(value).protocol.toLowerCase();
    return scheme === "http:" || scheme === "https:" ? value : "";
  } catch {
    return "";
  }
}

function fromRow(row: ProjectExampleRow): ProjectExample {
  return {
    id: row.id,
    project: row.project,
    repoUrl: httpUrlOrEmpty(row.repo_url),
    repoRef: row.repo_ref,
    title: row.title,
    summary: row.summary,
    subject: row.subject ?? null,
    concepts: asStringArray(row.concepts),
    filePath: row.file_path,
    fileUrl: httpUrlOrEmpty(row.file_url),
    language: row.language ?? null,
    code: row.code,
    lineStart: typeof row.line_start === "number" ? row.line_start : null,
    lineEnd: typeof row.line_end === "number" ? row.line_end : null,
    relatedMaterialIds: asStringArray(row.related_material_ids),
    authorshipNote: row.authorship_note ?? null,
    ord: typeof row.ord === "number" ? row.ord : 0,
  };
}

// ── 캐시 (data.ts 와 같은 30초 TTL) ──────────────────────────
let cache: { at: number; examples: ProjectExample[] } | null = null;
const TTL_MS = 30_000;

async function fetchFromDb(): Promise<ProjectExample[] | null> {
  if (!dbConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_examples")
      .select(COLUMNS)
      .order("ord", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ProjectExampleRow[];
    return rows.length > 0 ? rows.map(fromRow) : null;
  } catch {
    // 미로그인·네트워크·권한·미설정 → 파일 폴백
    return null;
  }
}

/** 저장소에 커밋된 project-examples/*.json 에서 읽습니다 (로컬 개발·폴백용). */
async function readFromFiles(): Promise<ProjectExample[]> {
  const dir = join(process.cwd(), "..", "project-examples");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }

  const examples: ProjectExample[] = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(join(dir, file), "utf8")) as {
        project?: string;
        repo_url?: string;
        repo_ref?: string;
        examples?: Array<Partial<ProjectExampleRow>>;
      };
      for (const ex of parsed.examples ?? []) {
        if (!ex.id || typeof ex.code !== "string") continue;
        examples.push(
          fromRow({
            id: String(ex.id),
            project: String(ex.project ?? parsed.project ?? "unknown"),
            repo_url: String(ex.repo_url ?? parsed.repo_url ?? ""),
            repo_ref: String(ex.repo_ref ?? parsed.repo_ref ?? ""),
            title: String(ex.title ?? ex.id),
            summary: String(ex.summary ?? ""),
            subject: (ex.subject as string | null) ?? null,
            concepts: ex.concepts ?? [],
            file_path: String(ex.file_path ?? ""),
            file_url: String(ex.file_url ?? ""),
            language: (ex.language as string | null) ?? null,
            code: ex.code,
            line_start: (ex.line_start as number | null) ?? null,
            line_end: (ex.line_end as number | null) ?? null,
            related_material_ids: ex.related_material_ids ?? [],
            authorship_note: (ex.authorship_note as string | null) ?? null,
            ord: (ex.ord as number | null) ?? 0,
          }),
        );
      }
    } catch {
      // 한 파일이 깨져도 나머지는 보여줍니다.
    }
  }
  return examples;
}

/** 실전 예제 전체 (ord → 과목 → 제목 순). DB 우선, 없으면 로컬 파일. */
export async function getProjectExamples(): Promise<ProjectExample[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.examples;

  const fromDb = await fetchFromDb();
  const examples = fromDb ?? (await readFromFiles());
  examples.sort(
    (a, b) =>
      a.ord - b.ord ||
      (a.subject ?? "").localeCompare(b.subject ?? "") ||
      a.title.localeCompare(b.title, "ko"),
  );

  cache = { at: Date.now(), examples };
  return examples;
}

/** 실전 예제 한 건. */
export async function getProjectExample(id: string): Promise<ProjectExample | null> {
  const all = await getProjectExamples();
  return all.find((e) => e.id === id) ?? null;
}

/** 이 수업자료(docId)와 연결된 실전 예제. 없으면 빈 배열. */
export async function getProjectExamplesForMaterial(docId: string): Promise<ProjectExample[]> {
  const all = await getProjectExamples();
  return all.filter((e) => e.relatedMaterialIds.includes(docId));
}
