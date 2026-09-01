/**
 * 자료를 읽어 오는 부분 — 뷰어의 유일한 데이터 통로입니다.
 *
 * ■ 읽기만 합니다
 *
 * 이 파일에는 파일을 쓰거나 지우는 코드가 **하나도 없습니다.**
 * 수업자료와 참고자료는 CLI 도구가 만들고, 뷰어는 보여주기만 합니다.
 * 그래서 뷰어를 아무리 조작해도 원본이 바뀔 수 없습니다.
 *
 * ■ 경로 안전
 *
 * 주소창의 값(`/m/어떤ID`)을 그대로 파일 경로에 쓰면
 * `../../` 같은 값으로 엉뚱한 파일을 열 수 있습니다.
 * 그래서 **index.json 에 실제로 등록된 자료만** 열도록 했습니다.
 * 목록에 없는 ID 는 파일을 열어보지도 않고 없는 것으로 처리합니다.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import matter from "gray-matter";

import {
  dbConfigured,
  fetchAllMaterialBodiesFromDb,
  fetchComparisonsFromDb,
  fetchLearningDocsFromDb,
  fetchMaterialBodyFromDb,
  fetchMaterialsFromDb,
  fetchReferencesFromDb,
  fetchStudyGuidesFromDb,
  fetchStudyMaterialsFromDb,
} from "./db";

/** 프로젝트의 data 폴더. viewer 폴더 기준으로 한 단계 위입니다. */
const DATA_DIR = join(process.cwd(), "..", "data");

/**
 * data/ 안으로 정규화되는 경로만 돌려줍니다. 벗어나면 null.
 *
 * 예전에는 filePath 가 로컬 index.json(뷰어와 같은 디스크)에서만 왔기에 그 자체가
 * 신뢰 경계였습니다. 이제는 Supabase 의 material_metadata.file_path 도 쓰므로, 원격에서
 * 넘어온 값이 `../` 같은 것을 담아 data/ 밖 파일(.env.local 등)을 열지 못하도록
 * 실제로 확인합니다. 주소창 값(docId)은 여전히 카탈로그와 대조 후에만 씁니다.
 */
function safeDataPath(filePath: string | undefined | null): string | null {
  if (!filePath) return null;
  const full = resolve(DATA_DIR, filePath);
  const rel = relative(DATA_DIR, full);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return null;
  }
  return full;
}

/** 카탈로그(index.json)에 들어 있는 자료 하나 */
export interface Material {
  docId: string;
  title: string;
  kind: string;
  subject?: string;
  sourceUrl: string;
  filePath: string;
  downloadPath?: string;
  modifiedTime: string;
  updatedAt: string;
  occurrences: Array<{ section: string | null; text: string }>;
  sizeBytes?: number;
  pageCount?: number;
  mimeType: string;
  fileAction?: string;
}

/** 공식 문서 요약 하나 */
export interface Reference {
  subject: string;
  /** 주소에 쓰는 이름 (파일명에서 .md 를 뗀 것) */
  slug: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  language: string;
  fetchedAt: string;
  /** 수업자료에서 몇 번 언급됐는지 */
  mentions: number;
  /** 어느 수업자료에서 나왔는지 (제목 목록) */
  relatedMaterials: string[];
  body: string;
}

/** 과목 하나의 요약 정보 */
export interface SubjectInfo {
  /** 폴더 경로 (예: "javascript/jquery") */
  id: string;
  /** 화면에 보일 이름 */
  label: string;
  count: number;
  referenceCount: number;
}

// ─────────────────────────────────────────────────────────────
// 캐시
//
// 개발 서버는 요청마다 코드를 다시 불러올 수 있으므로, 읽어 둔 자료를
// 모듈 안에 담아 둡니다. 546개 파일을 매번 읽으면 느리기 때문입니다.
// index.json 의 갱신 시각이 달라지면 캐시를 버리고 다시 읽습니다.
// ─────────────────────────────────────────────────────────────

interface Cache {
  stamp: string;
  materials: Material[];
  references: Reference[];
  /** 검색용 본문. docId 또는 slug 를 열쇠로 합니다. */
  bodies: Map<string, string>;
  /** 자료를 읽지 못했다면 그 사정 (18단계) */
  problem?: DataProblem;
}

let cache: Cache | null = null;

/**
 * 자료를 읽지 못했을 때의 사정.
 *
 * ■ 왜 나누는가 (18단계)
 *
 * 예전에는 `index.json` 을 읽다 실패하면 그대로 던져서 **화면 전체가 500** 이 됐습니다.
 * 파일 하나가 깨졌을 뿐인데 아무것도 볼 수 없었습니다.
 *
 * 그렇다고 조용히 빈 목록을 돌려주면 더 나쁩니다 —
 * 자료가 사라진 것처럼 보이면서 **아무 문제 없는 척**하게 되니까요.
 *
 * 그래서 무슨 일인지 구분해 들고 다니다가 화면에 그대로 알립니다.
 */
export type DataProblem =
  /** 아직 만든 적이 없습니다. 오류가 아니라 "시작 전" 입니다 */
  | "missing"
  /** 있는데 읽지 못했습니다. 깨졌을 수 있습니다 */
  | "unreadable";

/** index.json 을 읽어 자료 목록과 갱신 시각을 얻습니다. */
async function readIndexFile(): Promise<{
  stamp: string;
  materials: Material[];
  problem?: DataProblem;
}> {
  let raw: string;
  try {
    raw = await readFile(join(DATA_DIR, "index.json"), "utf8");
  } catch {
    // 아직 한 번도 수집하지 않은 상태입니다. 화면은 "시작하는 법" 을 알려 주면 됩니다.
    return { stamp: "", materials: [], problem: "missing" };
  }

  try {
    const parsed = JSON.parse(raw) as {
      updatedAt: string;
      entries: Record<string, Material>;
    };

    return {
      stamp: parsed.updatedAt,
      materials: Object.values(parsed.entries ?? {}),
    };
  } catch {
    // 파일은 있는데 읽지 못했습니다. **이것은 조용히 넘어가면 안 됩니다.**
    return { stamp: "", materials: [], problem: "unreadable" };
  }
}

// ─────────────────────────────────────────────────────────────
// 데이터 출처 결정 — DB 우선, 안 되면 파일
//
// 구조화 데이터(자료 목록·비교·복습·학습자료 메타)는 Supabase 에서 읽고, 읽지 못하면
// 지금까지처럼 로컬 data/ 파일에서 읽습니다. 어느 쪽을 쓸지는 material_metadata 를
// 실제로 읽어 보고 한 번에 정합니다 — 그래야 4개 데이터셋이 서로 다른 세대(sync 도중)
// 가 되지 않고, 로컬(빈 스택)·미동기화·오류가 모두 "파일" 로 일관되게 떨어집니다.
//
// 30초 캐시: 자동 갱신 주기가 24시간이라 이 정도 지연은 "갱신 후 다음 요청부터 새
// 데이터" 요건에 영향이 없고, 매 요청 DB 왕복을 막습니다.
// ─────────────────────────────────────────────────────────────

interface ResolvedSource {
  source: "db" | "file";
  /** DB 를 쓸 때 이미 읽어 둔 자료 목록 (loadAll 이 다시 읽지 않도록) */
  dbMaterials: Material[] | null;
  at: number;
}

let resolvedSource: ResolvedSource | null = null;
const SOURCE_TTL_MS = 30_000;

async function resolveSource(): Promise<ResolvedSource> {
  if (resolvedSource && Date.now() - resolvedSource.at < SOURCE_TTL_MS) {
    return resolvedSource;
  }

  const configured = dbConfigured();
  let dbMaterials: Material[] | null = null;
  if (configured) {
    try {
      dbMaterials = await fetchMaterialsFromDb();
    } catch (error) {
      // 로그인 안 된 요청·네트워크·권한 등. 조용히 파일로 폴백합니다.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[data] Supabase 읽기 실패, 로컬 파일로 폴백:", (error as Error).message);
      }
      dbMaterials = null;
    }
  }

  // 행이 1건 이상 있을 때만 DB 를 씁니다. 0건은 "아직 sync 안 함" 으로 보고 파일로 갑니다
  // (sync 는 upsert 만 하고 DELETE 가 없어, 0건이 "비운 것" 을 뜻하지 않습니다).
  const source: "db" | "file" = dbMaterials && dbMaterials.length > 0 ? "db" : "file";
  const resolved: ResolvedSource = { source, dbMaterials, at: Date.now() };

  // ── 이 30초 모듈 캐시는 "모든 요청에서 답이 같을 때"만 안전합니다 ──
  //
  // DB 가 설정돼 있는데 "file" 로 떨어졌다면, 그 요청에 로그인 세션이 없어 RLS 가
  // 막은 것입니다(fetchMaterialsFromDb 가 permission denied 로 던짐). 이것은 요청마다
  // 다른, 세션에 종속된 결과입니다. 배포 환경에는 로컬 data/ 도 없어 이 경우 홈이
  // "자료 없음" 이 됩니다.
  //
  // 그 결과를 모듈 캐시에 담으면 — 로그인 직전 /login 렌더가 이 경로를 매번 지나므로 —
  // 곧바로 이어지는 "로그인된" 요청까지 최대 30초 동안 "자료 없음" 을 물려받습니다.
  // 그래서 이때는 캐시하지 않고, 각 요청이 자기 세션으로 다시 판단하게 둡니다.
  // "db" 성공 결과(로그인 사용자 모두에게 동일)와, DB 미설정 환경의 "file" 결정
  // (세션과 무관하게 안정적)만 공유 캐시에 담습니다.
  if (source === "db" || !configured) {
    resolvedSource = resolved;
  }
  return resolved;
}

/** 참고자료(공식 문서 요약)를 전부 읽습니다. DB 우선, 없으면 로컬 파일. */
async function readReferences(): Promise<Reference[]> {
  if ((await resolveSource()).source === "db") {
    try {
      const fromDb = await fetchReferencesFromDb();
      if (fromDb.length > 0) return fromDb;
      // DB 에 references 가 아직 없으면(백필 전) 아래 파일 경로로.
    } catch {
      // DB 조회 실패 → 아래 파일 경로로 폴백.
    }
  }

  const references: Reference[] = [];
  const referencesDir = join(DATA_DIR, "references");

  let subjects: string[];
  try {
    subjects = await readdir(referencesDir);
  } catch {
    return references;
  }

  for (const subject of subjects) {
    let files: string[];
    try {
      files = await readdir(join(referencesDir, subject));
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".md") || file === "INDEX.md") continue;

      try {
        const raw = await readFile(join(referencesDir, subject, file), "utf8");
        const { data, content } = matter(raw);

        // "이 주제를 다룬 수업자료" 목록을 뽑아 둡니다.
        // 수업자료 쪽에서 "관련 공식 문서"를 보여줄 때 이 정보를 씁니다.
        const related: string[] = [];
        const section = content.split("## 📚 이 주제를 다룬 수업자료")[1]?.split("##")[0] ?? "";
        for (const line of section.split("\n")) {
          const item = line.match(/^-\s+(.+)$/);
          if (item?.[1]) related.push(item[1].trim());
        }

        references.push({
          subject,
          slug: file.replace(/\.md$/, ""),
          title: String(data.title ?? file),
          sourceUrl: String(data.sourceUrl ?? ""),
          sourceName: String(data.sourceName ?? ""),
          language: String(data.language ?? "en"),
          fetchedAt: String(data.fetchedAt ?? ""),
          mentions: Number(data.mentionsInMaterials ?? 0),
          relatedMaterials: related,
          body: content,
        });
      } catch {
        // 한 건을 못 읽어도 나머지는 보여줍니다.
      }
    }
  }

  return references;
}

/** 자료 본문을 로컬 파일에서 읽어 검색 haystack 에 담습니다. */
async function fillBodiesFromFiles(
  materials: Material[],
  bodies: Map<string, string>,
): Promise<void> {
  for (const material of materials) {
    const full = safeDataPath(material.filePath);
    if (!full) continue;
    try {
      const raw = await readFile(full, "utf8");
      bodies.set(material.docId, raw.toLowerCase());
    } catch {
      // 파일이 없으면 검색에서만 빠집니다.
    }
  }
}

/**
 * 검색에 쓸 본문을 전부 담습니다. 검색 함수(`search`)는 그대로이고, 이 Map 의 출처만
 * DB(모드) 또는 로컬 파일입니다. references 본문은 이미 읽어 둔 `references` 인자에서 옵니다.
 */
async function readBodies(materials: Material[], references: Reference[]): Promise<Map<string, string>> {
  const bodies = new Map<string, string>();

  if ((await resolveSource()).source === "db") {
    try {
      const dbBodies = await fetchAllMaterialBodiesFromDb();
      if (dbBodies.length > 0) {
        for (const { sourceId, body } of dbBodies) bodies.set(sourceId, body.toLowerCase());
      } else {
        await fillBodiesFromFiles(materials, bodies); // 백필 전 — 로컬에서
      }
    } catch {
      await fillBodiesFromFiles(materials, bodies); // DB 조회 실패 — 로컬에서
    }
  } else {
    await fillBodiesFromFiles(materials, bodies);
  }

  for (const reference of references) {
    bodies.set(`ref:${reference.subject}/${reference.slug}`, reference.body.toLowerCase());
  }

  return bodies;
}

/**
 * 자료를 읽어 옵니다. 이미 읽어 둔 것이 있으면 그대로 씁니다.
 *
 * CLI 로 자료를 다시 수집하면 index.json 의 갱신 시각이 바뀌므로
 * 브라우저를 새로고침하는 것만으로 최신 내용이 반영됩니다.
 */
export async function loadAll(): Promise<Cache> {
  const resolved = await resolveSource();

  // ── DB 경로 ── 자료 메타데이터는 Supabase 에서, 본문·공식문서는 로컬 파일에서.
  if (resolved.source === "db" && resolved.dbMaterials) {
    const stamp = `db:${resolved.at}`;
    if (cache && cache.stamp === stamp) return cache;

    const references = await readReferences();
    const bodies = await readBodies(resolved.dbMaterials, references);

    cache = { stamp, materials: resolved.dbMaterials, references, bodies };
    return cache;
  }

  // ── 파일 경로 ── DB 미설정·오류·아직 sync 안 함.
  const { stamp, materials, problem } = await readIndexFile();

  // 자료를 읽지 못했으면 캐시에 담지 않습니다.
  // 담아 두면 파일을 고친 뒤에도 계속 "없다" 고 답하게 됩니다.
  if (problem) {
    return { stamp: "", materials: [], references: await readReferences(), bodies: new Map(), problem };
  }

  if (cache && cache.stamp === stamp) return cache;

  const references = await readReferences();
  const bodies = await readBodies(materials, references);

  cache = { stamp, materials, references, bodies };
  return cache;
}

/**
 * 자료가 지금 어떤 상태인지. (18단계)
 *
 * 화면이 "왜 비어 있는지" 를 사용자에게 말해 줄 수 있게 합니다.
 * 조용히 빈 화면을 보여주면, 자료가 사라진 것인지 아직 안 만든 것인지 알 수 없습니다.
 */
export async function getDataHealth(): Promise<{
  ok: boolean;
  problem?: DataProblem;
  materialCount: number;
}> {
  const all = await loadAll();
  return {
    ok: !all.problem && all.materials.length > 0,
    problem: all.problem,
    materialCount: all.materials.length,
  };
}

// ─────────────────────────────────────────────────────────────
// 화면에서 쓰는 함수들
// ─────────────────────────────────────────────────────────────

/** 과목 이름을 사람이 읽기 좋게 바꿉니다. */
export function subjectLabel(id: string): string {
  const labels: Record<string, string> = {
    html: "HTML",
    css: "CSS",
    javascript: "JavaScript",
    "javascript/jquery": "jQuery",
    react: "React",
    typescript: "TypeScript",
    nextjs: "Next.js",
    supabase: "Supabase",
    mui: "MUI",
    "others/design": "디자인",
    "others/git": "GIT",
    "others/ai": "AI 활용",
    "others/planning": "기획·설계",
    "others/class-info": "수업 운영",
    "others/tools": "개발 도구",
    "others/deploy": "배포",
    "others/etc": "기타",
    _unclassified: "미분류",
  };
  return labels[id] ?? id;
}

/** 과목 목록을 자료가 많은 순서로 돌려줍니다. */
export async function getSubjects(): Promise<SubjectInfo[]> {
  const { materials, references } = await loadAll();

  const counts = new Map<string, number>();
  for (const material of materials) {
    const id = material.subject ?? "_unclassified";
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const referenceCounts = new Map<string, number>();
  for (const reference of references) {
    referenceCounts.set(reference.subject, (referenceCounts.get(reference.subject) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: subjectLabel(id),
      count,
      referenceCount: referenceCounts.get(id) ?? 0,
    }))
    .sort((a, b) => {
      // 미분류는 맨 아래로 보냅니다.
      if (a.id === "_unclassified") return 1;
      if (b.id === "_unclassified") return -1;
      return b.count - a.count;
    });
}

/** 한 과목의 자료를 제목 순서로 돌려줍니다. */
export async function getMaterialsBySubject(subject: string): Promise<Material[]> {
  const { materials } = await loadAll();
  return materials
    .filter((m) => (m.subject ?? "_unclassified") === subject)
    .sort((a, b) => a.title.localeCompare(b.title, "ko"));
}

/**
 * 자료 하나와 그 본문을 가져옵니다.
 *
 * 주소로 들어온 docId 가 카탈로그에 없으면 null 을 돌려줍니다.
 * 본문은 DB(material_bodies) 우선, 없으면 로컬 파일, 그것도 없으면 메타데이터만.
 * 어느 경우든 파일 경로를 주소값으로 만들지 않으므로 엉뚱한 파일이 열릴 수 없습니다.
 */
export async function getMaterial(
  docId: string,
): Promise<{ material: Material; body: string; bodyAvailable: boolean } | null> {
  const { materials } = await loadAll();
  const material = materials.find((m) => m.docId === docId);
  // 카탈로그에 없는 ID 는 없는 것으로 처리합니다 (경로 안전).
  if (!material) return null;

  // DB 모드면 본문을 material_bodies 에서 먼저 시도합니다.
  if ((await resolveSource()).source === "db") {
    try {
      const body = await fetchMaterialBodyFromDb(material.docId);
      if (body !== null) return { material, body, bodyAvailable: true };
    } catch {
      // DB 본문 조회 실패 → 아래 로컬 파일 폴백.
    }
  }

  const full = safeDataPath(material.filePath);
  if (full) {
    try {
      const raw = await readFile(full, "utf8");
      const { content } = matter(raw);
      return { material, body: content, bodyAvailable: true };
    } catch {
      // 본문 파일이 없습니다. 배포 환경엔 로컬 data/ 가 없으므로 정상적인 상황입니다 —
      // 화면은 메타데이터와 원본 링크만 보여 줍니다.
    }
  }

  return { material, body: "", bodyAvailable: false };
}

/** 참고자료 하나를 가져옵니다. */
export async function getReference(subject: string, slug: string): Promise<Reference | null> {
  const { references } = await loadAll();
  return references.find((r) => r.subject === subject && r.slug === slug) ?? null;
}

/** 한 과목의 참고자료를 언급 횟수 순서로 돌려줍니다. */
export async function getReferencesBySubject(subject: string): Promise<Reference[]> {
  const { references } = await loadAll();
  return references
    .filter((r) => r.subject === subject)
    .sort((a, b) => b.mentions - a.mentions);
}

/**
 * 이 수업자료와 관련된 공식 문서를 찾습니다.
 *
 * 6단계에서 각 요약본에 "어느 수업자료에서 나온 주제인지" 적어 두었으므로,
 * 그것을 거꾸로 훑어 연결합니다.
 */
export async function getRelatedReferences(material: Material): Promise<Reference[]> {
  const { references } = await loadAll();
  const subject = material.subject ?? "";

  return references
    .filter((r) => {
      // 같은 과목이면서, 이 자료가 관련 목록에 있는 것
      const sameSubject = subject === r.subject || subject.startsWith(`${r.subject}/`);
      return sameSubject && r.relatedMaterials.includes(material.title);
    })
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 8);
}

/** 검색 결과 하나 */
export interface SearchHit {
  type: "material" | "reference";
  title: string;
  subject: string;
  href: string;
  /** 검색어 주변 글 */
  snippet: string;
  /** 제목에서 걸렸는지 (제목 일치를 위로 올립니다) */
  inTitle: boolean;
  /** 이 자료에 딸린 **실습 코드**에서 걸렸는지 (10단계 통합 학습자료) */
  inPractice?: boolean;
}

/** 검색어 주변의 글을 잘라 옵니다. */
function makeSnippet(body: string, query: string): string {
  const at = body.indexOf(query);
  if (at === -1) return "";

  const start = Math.max(0, at - 60);
  const end = Math.min(body.length, at + query.length + 90);
  const text = body.slice(start, end).replace(/\s+/g, " ").trim();

  return `${start > 0 ? "…" : ""}${text}${end < body.length ? "…" : ""}`;
}

/** 검색 결과 전체 */
export interface SearchResult {
  hits: SearchHit[];
  /** 종류별로 실제로 걸린 전체 개수 (표시 제한 전) */
  totalMaterials: number;
  totalReferences: number;
}

/**
 * 제목과 본문을 함께 검색합니다.
 *
 * 546건의 본문을 미리 읽어 두었으므로 파일을 다시 열지 않습니다.
 *
 * 개수 제한은 **종류별로 따로** 겁니다.
 * 전체에 하나의 제한을 걸면, 수업자료가 자리를 다 차지해
 * 공식 문서 요약이 한 건도 안 보이는 일이 생깁니다.
 */
export async function search(query: string, perType = 40): Promise<SearchResult> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return { hits: [], totalMaterials: 0, totalReferences: 0 };

  const { materials, references, bodies } = await loadAll();

  // ── 통합 학습자료도 함께 봅니다 ──
  //
  // 새 결과 목록을 따로 만들지 않습니다. 그렇게 하면 같은 수업자료가 두 번 나옵니다.
  // 대신 **기존 수업자료 결과를 넓힙니다.**
  //   · 그 자료에 딸린 실습 코드에서 걸리면 그 자료도 결과에 넣고
  //   · 본문에는 없던 낱말이면 실습 코드에서 뽑은 글을 미리보기로 보여줍니다
  //
  // 이렇게 하면 검색 → 수업자료 → (설명 + 실습 코드 + 공식 문서) 로 한 번에 이어집니다.
  const learning = await loadLearning();

  const materialHits: SearchHit[] = [];
  const referenceHits: SearchHit[] = [];

  for (const material of materials) {
    const title = material.title.toLowerCase();
    const linkTexts = material.occurrences.map((o) => o.text).join(" ").toLowerCase();
    const body = bodies.get(material.docId) ?? "";
    const practice = learning?.haystack.get(material.docId) ?? "";

    const inTitle = title.includes(trimmed) || linkTexts.includes(trimmed);
    const inBody = body.includes(trimmed);
    const inPractice = practice.includes(trimmed);
    if (!inTitle && !inBody && !inPractice) continue;

    materialHits.push({
      type: "material",
      title: material.title,
      subject: material.subject ?? "_unclassified",
      href: `/m/${encodeURIComponent(material.docId)}`,
      // 본문에서 걸렸으면 본문을, 실습 코드에서만 걸렸으면 코드를 보여줍니다.
      snippet: inBody ? makeSnippet(body, trimmed) : inPractice ? makeSnippet(practice, trimmed) : "",
      inTitle,
      inPractice: inPractice && !inBody,
    });
  }

  for (const reference of references) {
    const title = reference.title.toLowerCase();
    const body = bodies.get(`ref:${reference.subject}/${reference.slug}`) ?? "";

    const inTitle = title.includes(trimmed);
    const inBody = body.includes(trimmed);
    if (!inTitle && !inBody) continue;

    referenceHits.push({
      type: "reference",
      title: reference.title,
      subject: reference.subject,
      href: `/r/${encodeURIComponent(reference.subject)}/${encodeURIComponent(reference.slug)}`,
      snippet: inBody ? makeSnippet(body, trimmed) : "",
      inTitle,
    });
  }

  // 제목에서 걸린 것을 먼저 보여줍니다.
  const byRelevance = (a: SearchHit, b: SearchHit): number =>
    Number(b.inTitle) - Number(a.inTitle) || a.title.localeCompare(b.title, "ko");

  materialHits.sort(byRelevance);
  referenceHits.sort(byRelevance);

  return {
    hits: [...materialHits.slice(0, perType), ...referenceHits.slice(0, perType)],
    totalMaterials: materialHits.length,
    totalReferences: referenceHits.length,
  };
}

// ─────────────────────────────────────────────────────────────
// 통합 학습자료 (10단계)
//
// CLI 의 `build-learning` 이 만들어 둔 data/learning.json 을 읽습니다.
// 여기서도 **읽기만** 합니다. 코드를 해석하거나 다시 만들지 않습니다.
//
// 실습 코드는 이미 learning.json 안에 원문 그대로 들어 있어서,
// 뷰어가 실습파일 Markdown 을 파헤칠 필요가 없습니다.
// ─────────────────────────────────────────────────────────────

/** 학습자료에 실린 실습 코드 파일 하나 */
export interface LearningSourceFile {
  path: string;
  language: string;
  /** 9단계가 이 파일을 고른 이유 */
  reason: string;
  /** 코드 원문 */
  code: string;
}

/** 이 수업자료에 딸린 실습파일 하나 */
export interface LearningPractice {
  zipId: string;
  zipTitle: string;
  confidence: "high" | "medium";
  score: number;
  reasons: string[];
  sourceFiles: LearningSourceFile[];
}

/** 학습자료에 딸린 공식 문서 요약 (본문은 references 쪽에서 읽습니다) */
export interface LearningReferenceLink {
  subject: string;
  slug: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  language: string;
  mentions: number;
}

/** 통합 학습자료 한 편 */
export interface LearningDocument {
  materialId: string;
  title: string;
  subject: string;
  materialKind: string;
  materialPath: string;
  sourceUrl: string;
  practice: LearningPractice[];
  references: LearningReferenceLink[];
}

/**
 * learning.json 은 index.json 과 따로 갱신되므로 캐시도 따로 둡니다.
 * 파일이 바뀐 시각(mtime)이 달라지면 다시 읽습니다.
 */
interface LearningCache {
  stamp: number;
  documents: LearningDocument[];
  byMaterial: Map<string, LearningDocument>;
  /** 검색에 쓸 글자 — 실습 코드·경로·ZIP 제목·연결 근거를 한 덩이로 모아 둡니다 */
  haystack: Map<string, string>;
}

let learningCache: LearningCache | null = null;
let learningDbCache: (LearningCache & { srcAt: number }) | null = null;

/**
 * DB 의 learning_documents 로 통합 학습자료를 만듭니다.
 *
 * 코드 원문(sourceFiles[].code)은 sync 가 DB 에 채웁니다. 아직 백필 전이면 "" 이므로,
 * 로컬 learning.json 이 있으면 그걸로 덮어씁니다(전환기 폴백). 배포 환경에서 백필 후에는
 * DB 값만으로 코드 블록이 채워집니다.
 *
 * DB 조회 자체가 실패하면 null 을 돌려주고, 부르는 쪽이 파일 경로로 폴백합니다.
 */
async function loadLearningFromDb(): Promise<LearningCache | null> {
  const resolved = await resolveSource();
  if (learningDbCache && learningDbCache.srcAt === resolved.at) return learningDbCache;

  let documents: LearningDocument[];
  try {
    documents = await fetchLearningDocsFromDb();
  } catch {
    return null;
  }
  if (documents.length === 0) return null;

  try {
    const localRaw = await readFile(join(DATA_DIR, "learning.json"), "utf8");
    const local = JSON.parse(localRaw) as { documents?: LearningDocument[] };
    const codeByKey = new Map<string, string>();
    for (const doc of local.documents ?? []) {
      for (const practice of doc.practice) {
        for (const file of practice.sourceFiles) {
          codeByKey.set(`${doc.materialId} ${practice.zipId} ${file.path}`, file.code);
        }
      }
    }
    for (const doc of documents) {
      for (const practice of doc.practice) {
        for (const file of practice.sourceFiles) {
          file.code =
            codeByKey.get(`${doc.materialId} ${practice.zipId} ${file.path}`) ?? file.code;
        }
      }
    }
  } catch {
    // 로컬 learning.json 없음 — 배포 환경. code 는 "" 로 둡니다.
  }

  const byMaterial = new Map<string, LearningDocument>();
  const haystack = new Map<string, string>();
  for (const document of documents) {
    byMaterial.set(document.materialId, document);
    const parts: string[] = [];
    for (const practice of document.practice) {
      parts.push(practice.zipTitle, ...practice.reasons);
      for (const file of practice.sourceFiles) parts.push(file.path, file.code);
    }
    haystack.set(document.materialId, parts.join("\n").toLowerCase());
  }

  learningDbCache = { stamp: resolved.at, documents, byMaterial, haystack, srcAt: resolved.at };
  return learningDbCache;
}

/**
 * 통합 학습자료를 읽어 옵니다. 아직 만들지 않았으면 null 입니다. (오류가 아닙니다)
 */
async function loadLearning(): Promise<LearningCache | null> {
  if ((await resolveSource()).source === "db") {
    const fromDb = await loadLearningFromDb();
    if (fromDb) return fromDb;
    // DB 모드인데 learning 조회만 실패 → 아래 파일 경로로 폴백.
  }

  const path = join(DATA_DIR, "learning.json");

  let stamp: number;
  try {
    stamp = (await stat(path)).mtimeMs;
  } catch {
    return null; // 아직 build-learning 을 돌리지 않았습니다
  }

  if (learningCache && learningCache.stamp === stamp) return learningCache;

  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { documents?: LearningDocument[] };
    const documents = parsed.documents ?? [];

    const byMaterial = new Map<string, LearningDocument>();
    const haystack = new Map<string, string>();

    for (const document of documents) {
      byMaterial.set(document.materialId, document);

      // 실습 코드까지 한 번에 찾을 수 있도록 미리 이어 붙여 둡니다.
      const parts: string[] = [];
      for (const practice of document.practice) {
        parts.push(practice.zipTitle, ...practice.reasons);
        for (const file of practice.sourceFiles) parts.push(file.path, file.code);
      }
      haystack.set(document.materialId, parts.join("\n").toLowerCase());
    }

    learningCache = { stamp, documents, byMaterial, haystack };
    return learningCache;
  } catch {
    return null; // 파일이 깨져 있어도 나머지 화면은 그대로 보여줍니다
  }
}

/**
 * 이 수업자료의 통합 학습자료를 가져옵니다.
 *
 * 아직 만들지 않았거나 이 자료에 실습 코드가 없으면 null 입니다.
 */
export async function getLearning(docId: string): Promise<LearningDocument | null> {
  const cache = await loadLearning();
  return cache?.byMaterial.get(docId) ?? null;
}

/** 목록 화면에 보여줄 한 줄 */
export interface LearningListItem {
  materialId: string;
  title: string;
  subject: string;
  materialKind: string;
  /** 연결된 실습파일 수 */
  practiceCount: number;
  /** 실습 코드 파일 수 */
  codeCount: number;
  /** 공식 문서 수 */
  referenceCount: number;
  /** 가장 높은 신뢰도 — 목록에서 한눈에 보여줍니다 */
  bestConfidence: "high" | "medium";
  /** 어떤 실습파일이 붙어 있는지 (목록에 이름만 보여줍니다) */
  zipTitles: string[];
}

/**
 * 통합 학습자료 목록을 돌려줍니다.
 *
 * 과목 → 제목 순입니다. 여기서 학습자료를 새로 만들지 않고 읽기만 합니다.
 */
export async function getLearningList(): Promise<LearningListItem[]> {
  const cache = await loadLearning();
  if (!cache) return [];

  return cache.documents
    .map((document) => ({
      materialId: document.materialId,
      title: document.title,
      subject: document.subject,
      materialKind: document.materialKind,
      practiceCount: document.practice.length,
      codeCount: document.practice.reduce((sum, item) => sum + item.sourceFiles.length, 0),
      referenceCount: document.references.length,
      bestConfidence: document.practice.some((item) => item.confidence === "high")
        ? ("high" as const)
        : ("medium" as const),
      zipTitles: document.practice.map((item) => item.zipTitle),
    }))
    .sort(
      (a, b) => a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title, "ko"),
    );
}

// ─────────────────────────────────────────────────────────────
// 수업 방식 ↔ 공식 문서 비교 (13단계)
//
// CLI 의 `compare` 가 만들어 둔 data/comparisons.json 을 읽습니다.
// 여기서도 읽기만 합니다. 판단을 다시 하지 않습니다.
// ─────────────────────────────────────────────────────────────

/** 판단의 근거 한 줄 */
export interface ComparisonEvidence {
  source: string;
  text: string;
  where?: string;
}

/** 비교 항목 하나 */
export interface ComparisonItem {
  id: string;
  subject: string;
  topic: string;
  kind: "api" | "package";
  status: string;
  reason: string;

  // ── 14단계 ──
  // status 는 "어떻게 되었나" 를 말하고, 아래 둘은 "내 코드를 고쳐야 하나" 에 답합니다.
  // 13단계에 만들어진 자료에는 없는 칸이라 없을 수 있습니다.
  changeType?: string;
  severity?: string;
  oldPattern?: string;
  currentPattern?: string;
  recommendedAlternative?: string;

  lessons: Array<{ materialId: string; title: string; path: string }>;
  taughtIn: Array<{ materialId: string; title: string; path: string; line?: string }>;
  usedIn: Array<{ zipId: string; zipTitle: string; files: string[] }>;
  official?: {
    subject: string;
    slug: string;
    title: string;
    sourceUrl: string;
    fetchedAt: string;
    contentHash: string;
    docStatus: string[];
  };
  versions?: {
    atLesson: string;
    latestInCourse: string | null;
    inThisProject: string | null;
  };
  evidence: ComparisonEvidence[];
  lastComparedAt: string;
  needsReview?: boolean;
}

/** 상태값을 사람이 읽을 말로. CLI 와 같은 뜻을 씁니다. */
export const COMPARISON_LABEL: Record<string, string> = {
  CURRENT: "그대로 사용 가능",
  DEPRECATED: "사용 중단됨",
  UNSTABLE: "실험적·비표준",
  VERSION_GAP: "버전 차이 있음",
  NOT_FOUND: "공식문서에서 확인 안 됨",
  REVIEW_REQUIRED: "확인 필요",
};

/** 상태값의 뜻 — 화면에서 그대로 보여 줍니다. */
export const COMPARISON_MEANING: Record<string, string> = {
  CURRENT: "공식 문서에서 확인되고, 문서가 아무 경고도 달지 않았습니다.",
  DEPRECATED: "공식 문서가 이 기능을 쓰지 말라고 직접 밝혔습니다.",
  UNSTABLE: "공식 문서가 실험적·비표준이라고 밝혔습니다.",
  VERSION_GAP: "수업 때 쓴 버전과 더 최신 자료의 버전이 메이저로 다릅니다.",
  NOT_FOUND: "우리가 가진 공식 문서 표본에 없어 확인하지 못했습니다. 없어졌다는 뜻이 아닙니다.",
  REVIEW_REQUIRED: "근거가 모자라거나 엇갈립니다. 사람이 봐야 합니다.",
};

/** 변화의 종류 — 무엇이 달라졌는가 */
export const CHANGE_TYPE_LABEL: Record<string, string> = {
  NONE: "달라진 것 없음",
  VERSION_ONLY: "버전만 다름",
  RECOMMENDED_CHANGED: "권장 방식이 바뀜",
  API_CHANGED: "사용법이 바뀜",
  DEPRECATED: "사용 중단됨",
  REMOVED: "제거됨",
  REVIEW_REQUIRED: "사람이 봐야 함",
};

/** 변화의 종류가 무슨 뜻인지 — 화면에서 그대로 보여 줍니다. */
export const CHANGE_TYPE_MEANING: Record<string, string> = {
  NONE: "공식 문서에 아무 경고가 없고, 코드에서도 바뀐 사용법을 찾지 못했습니다.",
  VERSION_ONLY:
    "버전 숫자만 다릅니다. 사용법이 달라졌다는 근거는 찾지 못했으니, 숫자만 보고 고칠 일은 아닙니다.",
  RECOMMENDED_CHANGED: "그대로도 돌아가지만, 공식 문서가 다른 방식을 권합니다.",
  API_CHANGED: "쓰는 방법 자체가 달라졌습니다. 코드를 고쳐야 합니다.",
  DEPRECATED: "공식 문서가 이것을 쓰지 말라고 직접 밝혔습니다.",
  REMOVED: "공식 문서가 이것이 없어졌다고 밝혔습니다.",
  REVIEW_REQUIRED: "근거가 모자라거나 서로 엇갈립니다. 확정하지 않고 남겨 둡니다.",
};

/** 무게 — 얼마나 급한가 */
export const SEVERITY_LABEL: Record<string, string> = {
  NONE: "손댈 것 없음",
  LOW: "알아만 두기",
  MEDIUM: "챙겨볼 것",
  HIGH: "고쳐야 함",
};

interface ComparisonCache {
  stamp: number;
  items: ComparisonItem[];
  byMaterial: Map<string, ComparisonItem[]>;
  generatedAt: string;
}

let comparisonCache: ComparisonCache | null = null;
let comparisonDbCache: (ComparisonCache & { srcAt: number }) | null = null;

/** DB 의 comparisons 로 비교 결과를 만듭니다. 조회 실패 시 null → 파일로 폴백. */
async function loadComparisonsFromDb(): Promise<ComparisonCache | null> {
  const resolved = await resolveSource();
  if (comparisonDbCache && comparisonDbCache.srcAt === resolved.at) return comparisonDbCache;

  let items: ComparisonItem[];
  let generatedAt: string;
  try {
    ({ items, generatedAt } = await fetchComparisonsFromDb());
  } catch {
    return null;
  }
  // DB 에 이 데이터셋이 아직 없으면(부분 sync·초기화) 파일 경로가 있는지 먼저 봅니다.
  if (items.length === 0) return null;

  const byMaterial = new Map<string, ComparisonItem[]>();
  for (const item of items) {
    const ids = new Set([
      ...item.lessons.map((l) => l.materialId),
      ...item.taughtIn.map((t) => t.materialId),
    ]);
    for (const id of ids) {
      const list = byMaterial.get(id) ?? [];
      list.push(item);
      byMaterial.set(id, list);
    }
  }

  comparisonDbCache = { stamp: resolved.at, items, byMaterial, generatedAt, srcAt: resolved.at };
  return comparisonDbCache;
}

/** 비교 결과를 읽어 옵니다. 아직 만들지 않았으면 null 입니다. (오류가 아닙니다) */
async function loadComparisons(): Promise<ComparisonCache | null> {
  if ((await resolveSource()).source === "db") {
    const fromDb = await loadComparisonsFromDb();
    if (fromDb) return fromDb;
  }

  const path = join(DATA_DIR, "comparisons.json");

  let stamp: number;
  try {
    stamp = (await stat(path)).mtimeMs;
  } catch {
    return null;
  }

  if (comparisonCache && comparisonCache.stamp === stamp) return comparisonCache;

  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      items?: ComparisonItem[];
      generatedAt?: string;
    };
    const items = parsed.items ?? [];

    // 수업자료 하나에서 그 자료와 얽힌 비교를 바로 찾을 수 있게 미리 묶어 둡니다.
    const byMaterial = new Map<string, ComparisonItem[]>();
    for (const item of items) {
      const ids = new Set([
        ...item.lessons.map((l) => l.materialId),
        ...item.taughtIn.map((t) => t.materialId),
      ]);
      for (const id of ids) {
        const list = byMaterial.get(id) ?? [];
        list.push(item);
        byMaterial.set(id, list);
      }
    }

    comparisonCache = { stamp, items, byMaterial, generatedAt: parsed.generatedAt ?? "" };
    return comparisonCache;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// 공식 문서가 얼마나 최신인가 (16단계)
//
// 바깥에서 자료를 못 받아 왔을 때, 화면이 그것을 모른 척하면
// 사용자는 지금 보는 것이 최신인 줄 압니다. 한 줄이면 됩니다.
// ═══════════════════════════════════════════════════════════

export type CollectStatus = "SUCCESS" | "PARTIAL" | "STALE" | "FAILED";

export interface CollectStatusInfo {
  status: CollectStatus;
  checkedAt: string;
  lastSuccessAt?: string;
  rateLimited: boolean;
  rateLimitResetAt?: string;
  /** 못 받아온 과목 */
  staleSubjects: string[];
  /** 못 받은 공식 문서 수 (17단계) */
  failedDocumentCount: number;
}

export const COLLECT_LABEL: Record<string, string> = {
  SUCCESS: "최신",
  PARTIAL: "일부만 갱신",
  STALE: "예전 자료 사용",
  FAILED: "갱신 실패",
};

export const COLLECT_MEANING: Record<string, string> = {
  SUCCESS: "공식 문서를 정상으로 받아왔습니다.",
  PARTIAL: "일부 출처는 받아왔고 일부는 받지 못했습니다. 받지 못한 쪽은 예전 자료를 그대로 씁니다.",
  STALE: "새로 받지 못해 이미 가진 공식 문서를 그대로 씁니다. 자료를 잃지는 않았습니다.",
  FAILED: "받지도 못했고 쓸 수 있는 예전 자료도 없습니다.",
};

/**
 * 공식 문서 갱신 상태를 읽어 옵니다.
 *
 * 아직 기록이 없으면 null 입니다 — 오류가 아니라 "아직 안 돌려 봤다" 는 뜻입니다.
 */
export async function getCollectStatus(): Promise<CollectStatusInfo | null> {
  try {
    const raw = await readFile(join(DATA_DIR, "collect-status.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      version?: number;
      status?: CollectStatus;
      checkedAt?: string;
      lastSuccessAt?: string;
      rateLimited?: boolean;
      rateLimitResetAt?: string;
      subjects?: Array<{ subject: string; status: string }>;
      failedDocuments?: unknown[];
    };

    if (parsed.version !== 1 || !parsed.status || !parsed.checkedAt) return null;

    return {
      status: parsed.status,
      checkedAt: parsed.checkedAt,
      lastSuccessAt: parsed.lastSuccessAt,
      rateLimited: Boolean(parsed.rateLimited),
      rateLimitResetAt: parsed.rateLimitResetAt,
      staleSubjects: (parsed.subjects ?? [])
        .filter((entry) => entry.status === "STALE" || entry.status === "FAILED")
        .map((entry) => entry.subject),
      failedDocumentCount: (parsed.failedDocuments ?? []).length,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// 학습 설명 (15단계)
//
// 14단계가 "이것이 사용 중단이다" 라고 판정했다면,
// 15단계는 "그래서 지금 다시 공부할 때 무엇을 어떻게 보면 되는가" 에 답합니다.
// 여기서는 읽어 오기만 합니다. 판정도 설명 생성도 하지 않습니다.
// ═══════════════════════════════════════════════════════════

export type LearningPriority = "KEEP" | "CHECK" | "RELEARN" | "REPLACE";

export interface StudyGuide {
  comparisonId: string;
  subject: string;
  topic: string;
  kind: "api" | "package";
  learningPriority: LearningPriority;
  changeType: string;
  severity: string;
  status: string;
  explanation: string;
  lessonSummary?: string;
  statusSummary: string;
  changeSummary: string;
  oldPattern?: string;
  oldCode?: string;
  currentPattern?: string;
  recommendedAlternative?: string;
  studyPoint: string;
  evidence: ComparisonEvidence[];
  materials: Array<{ materialId: string; title: string; path: string }>;
  practice: Array<{ zipId: string; zipTitle: string; files: string[] }>;
  versions?: { atLesson: string; latestInCourse: string | null; inThisProject: string | null };
  /** 나중에 AI 설명을 붙일 자리. 기본 생성은 채우지 않습니다 */
  aiExplanation?: string;
  updatedAt: string;
}

export interface StudyMaterial {
  materialId: string;
  title: string;
  subject: string;
  path: string;
  priority: LearningPriority;
  counts: Record<LearningPriority, number>;
  topics: Array<{ comparisonId: string; topic: string; priority: LearningPriority }>;
}

/** 복습 우선순위를 사람이 읽을 말로. CLI·README 와 같은 말을 씁니다. */
export const PRIORITY_LABEL: Record<string, string> = {
  KEEP: "그대로 복습",
  CHECK: "확인하면서 복습",
  RELEARN: "다시 공부",
  REPLACE: "새 방식으로 교체",
};

/** 우선순위의 뜻 — 화면에서 그대로 보여 줍니다. */
export const PRIORITY_MEANING: Record<string, string> = {
  KEEP: "공식 문서가 따로 경고를 달지 않았습니다. 수업자료를 그대로 다시 봐도 됩니다.",
  CHECK: "개념은 그대로 쓸 수 있지만, 버전 차이가 있거나 우리가 확인하지 못한 것이 있습니다.",
  RELEARN: "사용법이나 공식 문서가 권하는 방식이 달라졌습니다. 그 부분만 다시 보면 됩니다.",
  REPLACE: "공식 문서가 쓰지 말라고 했거나 없어졌다고 밝혔습니다. 새 방식을 중심으로 공부하세요.",
};

/** 급한 순서 — 화면 정렬과 대표값 고르기에 씁니다. */
export const PRIORITY_ORDER: LearningPriority[] = ["REPLACE", "RELEARN", "CHECK", "KEEP"];

/** 우선순위별 색 — REPLACE 만 눈에 띄게, KEEP 은 조용하게 */
export const PRIORITY_COLOR: Record<string, "default" | "error" | "warning" | "info" | "success"> = {
  REPLACE: "error",
  RELEARN: "warning",
  CHECK: "info",
  KEEP: "success",
};

interface StudyCache {
  stamp: number;
  guides: StudyGuide[];
  byMaterial: Map<string, StudyGuide[]>;
  materials: StudyMaterial[];
  materialById: Map<string, StudyMaterial>;
  generatedAt: string;
}

let studyCache: StudyCache | null = null;
let studyDbCache: (StudyCache & { srcAt: number }) | null = null;

/**
 * DB 의 study_guides + material_metadata.extra.studyPriority 로 학습 설명을 만듭니다.
 * 조회 실패 시 null → 파일로 폴백.
 */
async function loadStudyFromDb(): Promise<StudyCache | null> {
  const resolved = await resolveSource();
  if (studyDbCache && studyDbCache.srcAt === resolved.at) return studyDbCache;

  let guides: StudyGuide[];
  let generatedAt: string;
  let materials: StudyMaterial[];
  try {
    ({ guides, generatedAt } = await fetchStudyGuidesFromDb());
    materials = await fetchStudyMaterialsFromDb();
  } catch {
    return null;
  }
  if (guides.length === 0) return null;

  const byMaterial = new Map<string, StudyGuide[]>();
  for (const guide of guides) {
    for (const material of guide.materials) {
      const list = byMaterial.get(material.materialId) ?? [];
      list.push(guide);
      byMaterial.set(material.materialId, list);
    }
  }

  for (const list of byMaterial.values()) {
    list.sort(
      (a, b) =>
        PRIORITY_ORDER.indexOf(a.learningPriority) - PRIORITY_ORDER.indexOf(b.learningPriority) ||
        a.topic.localeCompare(b.topic, "ko"),
    );
  }

  studyDbCache = {
    stamp: resolved.at,
    guides,
    byMaterial,
    materials,
    materialById: new Map(materials.map((material) => [material.materialId, material])),
    generatedAt,
    srcAt: resolved.at,
  };
  return studyDbCache;
}

/** 학습 설명을 읽어 옵니다. 아직 만들지 않았으면 null 입니다. (오류가 아닙니다) */
async function loadStudy(): Promise<StudyCache | null> {
  if ((await resolveSource()).source === "db") {
    const fromDb = await loadStudyFromDb();
    if (fromDb) return fromDb;
  }

  const path = join(DATA_DIR, "study-guides.json");

  let stamp: number;
  try {
    stamp = (await stat(path)).mtimeMs;
  } catch {
    return null;
  }

  if (studyCache && studyCache.stamp === stamp) return studyCache;

  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      guides?: StudyGuide[];
      materials?: StudyMaterial[];
      generatedAt?: string;
    };
    const guides = parsed.guides ?? [];
    const materials = parsed.materials ?? [];

    const byMaterial = new Map<string, StudyGuide[]>();
    for (const guide of guides) {
      for (const material of guide.materials) {
        const list = byMaterial.get(material.materialId) ?? [];
        list.push(guide);
        byMaterial.set(material.materialId, list);
      }
    }

    for (const list of byMaterial.values()) {
      list.sort(
        (a, b) =>
          PRIORITY_ORDER.indexOf(a.learningPriority) - PRIORITY_ORDER.indexOf(b.learningPriority) ||
          a.topic.localeCompare(b.topic, "ko"),
      );
    }

    studyCache = {
      stamp,
      guides,
      byMaterial,
      materials,
      materialById: new Map(materials.map((material) => [material.materialId, material])),
      generatedAt: parsed.generatedAt ?? "",
    };
    return studyCache;
  } catch {
    return null;
  }
}

/** 학습 설명 전체 */
export async function getStudyGuides(): Promise<{
  guides: StudyGuide[];
  materials: StudyMaterial[];
  generatedAt: string;
}> {
  const cache = await loadStudy();
  return {
    guides: cache?.guides ?? [],
    materials: cache?.materials ?? [],
    generatedAt: cache?.generatedAt ?? "",
  };
}

/** 수업자료 하나에 딸린 학습 설명 (급한 것부터) */
export async function getStudyFor(docId: string): Promise<{
  guides: StudyGuide[];
  material: StudyMaterial | null;
}> {
  const cache = await loadStudy();
  return {
    guides: cache?.byMaterial.get(docId) ?? [],
    material: cache?.materialById.get(docId) ?? null,
  };
}

/** 과목 하나의 복습 상태 — 과목 화면에서 "여기 뭐부터 볼까" 에 답합니다 */
export async function getStudyForSubject(subject: string): Promise<{
  materials: StudyMaterial[];
  counts: Record<string, number>;
}> {
  const cache = await loadStudy();
  const materials = (cache?.materials ?? []).filter((material) => material.subject === subject);

  const counts: Record<string, number> = {};
  for (const material of materials) {
    counts[material.priority] = (counts[material.priority] ?? 0) + 1;
  }

  return { materials, counts };
}

/** 비교 결과 전체를 돌려줍니다. */
export async function getComparisons(): Promise<{ items: ComparisonItem[]; generatedAt: string }> {
  const cache = await loadComparisons();
  return { items: cache?.items ?? [], generatedAt: cache?.generatedAt ?? "" };
}

/**
 * 이 수업자료와 얽힌 비교 결과를 돌려줍니다.
 *
 * 눈여겨볼 것(그대로 사용 가능이 아닌 것)을 앞에 둡니다.
 */
export async function getComparisonsFor(docId: string): Promise<ComparisonItem[]> {
  const cache = await loadComparisons();
  const items = cache?.byMaterial.get(docId) ?? [];

  const weight = (status: string): number =>
    ["DEPRECATED", "UNSTABLE", "VERSION_GAP", "REVIEW_REQUIRED", "NOT_FOUND", "CURRENT"].indexOf(status);

  return [...items].sort(
    (a, b) => weight(a.status) - weight(b.status) || a.topic.localeCompare(b.topic, "ko"),
  );
}

/** 홈 화면에 보여줄 전체 통계 */
export async function getStats(): Promise<{
  materials: number;
  references: number;
  subjects: number;
  files: number;
}> {
  const { materials, references } = await loadAll();
  return {
    materials: materials.length,
    references: references.length,
    subjects: new Set(materials.map((m) => m.subject ?? "_unclassified")).size,
    files: materials.filter((m) => m.downloadPath).length,
  };
}
