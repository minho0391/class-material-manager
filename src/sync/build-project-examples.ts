/**
 * project-examples/*.json → project_examples 행 변환.
 *
 * 수업자료 파이프라인과 완전히 분리된 경로입니다. refresh/ci-refresh/verifySupabase 는
 * 이 파일을 부르지 않습니다 — 오직 `node src/index.ts sync-project-examples` 만 씁니다.
 *
 * 소스 JSON 은 저장소에 커밋된 수기 큐레이션 파일입니다(공개 GitHub 저장소의 코드 발췌).
 * 코드 텍스트(code)는 원본 커밋에서 라인 범위만 잘라 온 것으로, 여기서 손대지 않습니다.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PROJECT_EXAMPLES_DIR } from "../config/paths.ts";
import { SUBJECTS } from "../config/subjects.ts";

/** project_examples 테이블 한 행 (컬럼명 = DB 컬럼명). */
export interface ProjectExampleRow {
  id: string;
  project: string;
  repo_url: string;
  repo_ref: string;
  title: string;
  summary: string;
  subject: string | null;
  concepts: string[];
  file_path: string;
  file_url: string;
  language: string | null;
  code: string;
  line_start: number | null;
  line_end: number | null;
  related_material_ids: string[];
  authorship_note: string | null;
  ord: number;
}

interface RawExample {
  id?: unknown;
  project?: unknown;
  repo_url?: unknown;
  repo_ref?: unknown;
  title?: unknown;
  summary?: unknown;
  subject?: unknown;
  concepts?: unknown;
  file_path?: unknown;
  file_url?: unknown;
  language?: unknown;
  code?: unknown;
  line_start?: unknown;
  line_end?: unknown;
  related_material_ids?: unknown;
  authorship_note?: unknown;
  ord?: unknown;
}

interface RawFile {
  version?: unknown;
  project?: unknown;
  repo_url?: unknown;
  repo_ref?: unknown;
  examples?: unknown;
}

/**
 * repo_url / file_url 은 항상 GitHub 웹 주소이므로 http(s) 만 허용합니다.
 * 그 외(mailto:·javascript:·data: · 상대경로 등)는 null → 호출부가 형식 오류로 처리합니다.
 * (뷰어 렌더 시 viewer/lib/url.ts:safeHref 가 한 번 더 거릅니다 — 이중 방어.)
 */
function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const scheme = parsed.protocol.toLowerCase();
  return scheme === "http:" || scheme === "https:" ? parsed.href : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

const VALID_SUBJECTS = new Set<string>(Object.values(SUBJECTS));

export interface BuildProjectExamplesResult {
  rows: ProjectExampleRow[];
  /** 사람이 봐야 하는 경고 (치명적이지 않음) */
  warnings: string[];
  /** 읽은 소스 파일 목록 */
  sourceFiles: string[];
}

/**
 * project-examples/ 아래 모든 *.json 을 읽어 행으로 만듭니다.
 *
 * 형식 오류(id 없음, code 없음 등)는 예외를 던집니다 — 잘못된 데이터를 조용히 올리지 않습니다.
 * related_material_ids 가 data/index.json 에 없는 것 등은 warning 으로만 모읍니다.
 */
export async function buildProjectExampleRows(opts: {
  /** related_material_ids 대조용. 없으면(로컬 data/ 부재) 대조를 건너뜁니다. */
  knownMaterialIds?: Set<string> | null;
} = {}): Promise<BuildProjectExamplesResult> {
  const warnings: string[] = [];
  const sourceFiles: string[] = [];

  let files: string[];
  try {
    files = (await readdir(PROJECT_EXAMPLES_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    throw new Error(`project-examples 폴더를 읽지 못했습니다: ${PROJECT_EXAMPLES_DIR}`);
  }
  if (files.length === 0) {
    throw new Error(`project-examples 폴더에 *.json 이 없습니다: ${PROJECT_EXAMPLES_DIR}`);
  }

  const rows: ProjectExampleRow[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const full = join(PROJECT_EXAMPLES_DIR, file);
    sourceFiles.push(file);

    let parsed: RawFile;
    try {
      parsed = JSON.parse(await readFile(full, "utf8")) as RawFile;
    } catch (error) {
      throw new Error(`${file}: JSON 파싱 실패 — ${error instanceof Error ? error.message : String(error)}`);
    }

    const examples = Array.isArray(parsed.examples) ? (parsed.examples as RawExample[]) : null;
    if (!examples) throw new Error(`${file}: examples 배열이 없습니다`);

    const fileProject = asString(parsed.project);
    const fileRepo = asString(parsed.repo_url);
    const fileRef = asString(parsed.repo_ref);

    for (const [i, ex] of examples.entries()) {
      const where = `${file} examples[${i}]`;

      const id = asString(ex.id).trim();
      if (!id) throw new Error(`${where}: id 가 없습니다`);
      if (seen.has(id)) throw new Error(`${where}: id 중복 — ${id}`);
      seen.add(id);

      const code = typeof ex.code === "string" ? ex.code : null;
      if (code === null || code.length === 0) throw new Error(`${where} (${id}): code 가 비어 있습니다`);

      const title = asString(ex.title).trim();
      if (!title) throw new Error(`${where} (${id}): title 이 없습니다`);
      const summary = asString(ex.summary).trim();
      if (!summary) throw new Error(`${where} (${id}): summary 가 없습니다`);
      const filePath = asString(ex.file_path).trim();
      if (!filePath) throw new Error(`${where} (${id}): file_path 가 없습니다`);

      const repoUrl = sanitizeUrl(ex.repo_url ?? fileRepo);
      if (!repoUrl) throw new Error(`${where} (${id}): repo_url 이 http(s) 가 아닙니다`);
      const fileUrl = sanitizeUrl(ex.file_url);
      if (!fileUrl) throw new Error(`${where} (${id}): file_url 이 http(s) 가 아닙니다`);

      const subjectRaw = asString(ex.subject).trim();
      const subject = subjectRaw.length > 0 ? subjectRaw : null;
      if (subject && !VALID_SUBJECTS.has(subject)) {
        warnings.push(`${id}: subject "${subject}" 는 알려진 과목(config/subjects.ts)이 아닙니다`);
      }

      const lineStart = typeof ex.line_start === "number" ? ex.line_start : null;
      const lineEnd = typeof ex.line_end === "number" ? ex.line_end : null;

      const related = asStringArray(ex.related_material_ids);
      if (opts.knownMaterialIds) {
        for (const rid of related) {
          if (!opts.knownMaterialIds.has(rid)) {
            warnings.push(`${id}: related_material_ids "${rid}" 가 data/index.json 에 없습니다`);
          }
        }
      }

      const ord = typeof ex.ord === "number" ? ex.ord : 0;

      rows.push({
        id,
        project: asString(ex.project).trim() || fileProject || "unknown",
        repo_url: repoUrl,
        repo_ref: asString(ex.repo_ref).trim() || fileRef || "",
        title,
        summary,
        subject,
        concepts: asStringArray(ex.concepts),
        file_path: filePath,
        file_url: fileUrl,
        language: asString(ex.language).trim() || null,
        code,
        line_start: lineStart,
        line_end: lineEnd,
        related_material_ids: related,
        authorship_note: asString(ex.authorship_note).trim() || null,
        ord,
      });
    }
  }

  return { rows, warnings, sourceFiles };
}
