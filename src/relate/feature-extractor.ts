/**
 * 자료에서 "연결 판정에 쓸 단서"를 뽑아내는 부분.
 *
 * ■ 무엇을 뽑는가
 *
 *   설명자료(PDF·Google 문서)  제목 낱말 · 본문에 나온 기술 낱말
 *   실습파일(zip)              제목 낱말 · 소스 파일 경로 · 코드에 쓰인 기술 낱말
 *
 * ■ 이미 저장된 Markdown 만 읽습니다
 *
 * PDF 는 4단계에서 글자를 뽑아 Markdown 에 실어 두었고,
 * zip 은 8단계에서 소스코드를 Markdown 에 실어 두었습니다.
 * 그러므로 여기서는 **`data/materials/` 의 파일만 읽으면 됩니다.**
 * 원본 PDF 를 다시 열지도, zip 을 다시 풀지도, Drive 에 접속하지도 않습니다.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../config/paths.ts";
import {
  COMMON_PATH_SEGMENTS,
  COMMON_SOURCE_NAMES,
  KOREAN_TERM_ALIASES,
  TECH_KEYWORDS,
  TITLE_STOPWORDS,
} from "../config/tech-keywords.ts";
import type { IndexEntry } from "../store/index-store.ts";

/** 이 자료가 "설명 중심 자료"인지 (학습의 중심) */
export function isExplanatory(entry: IndexEntry): boolean {
  return (
    entry.kind === "document" ||
    entry.kind === "published-document" ||
    entry.mimeType === "application/pdf"
  );
}

/** 이 자료가 "실습 코드 자료"인지 */
export function isPractice(entry: IndexEntry): boolean {
  return (
    (entry.mimeType === "application/zip" || entry.mimeType === "application/x-zip-compressed") &&
    (entry.zipSourceCount ?? 0) > 0
  );
}

/** 실습파일 안의 소스 파일 하나 */
export interface SourceFileFeature {
  /** zip 안에서의 상대경로 */
  path: string;
  /** 파일 이름 (소문자) */
  baseName: string;
  /** 경로에서 뽑은 낱말 (흔한 폴더·파일 이름 제외) */
  tokens: Set<string>;
  /** 이 파일의 코드에 쓰인 기술 낱말 */
  keywords: Set<string>;
  /** 코드 길이 */
  length: number;
}

/** 자료 하나에서 뽑아낸 단서 */
export interface MaterialFeature {
  entry: IndexEntry;
  subject: string;
  /** 제목에서 뽑은 낱말 (불용어 제외) */
  titleTokens: Set<string>;
  /** 본문/코드에 나온 기술 낱말 → 나온 횟수 */
  keywords: Map<string, number>;
  /** 실습파일일 때만: 안에 든 소스 파일들 */
  sourceFiles: SourceFileFeature[];
  /** 본문 길이 */
  bodyLength: number;
}

/**
 * 저장된 Markdown 에서 front matter 를 떼고 본문만 돌려줍니다.
 *
 * gray-matter 같은 라이브러리를 쓰지 않는 이유는, 여기서 필요한 것이
 * "앞의 --- 블록을 잘라내기" 하나뿐이기 때문입니다.
 */
async function readBody(filePath: string): Promise<string> {
  const raw = await readFile(join(DATA_DIR, filePath), "utf8");
  if (!raw.startsWith("---")) return raw;

  const end = raw.indexOf("\n---", 3);
  return end === -1 ? raw : raw.slice(end + 4);
}

/**
 * 글에서 낱말을 뽑습니다.
 *
 * 영문·숫자·한글만 남기고 나머지는 경계로 봅니다.
 * `react-custom-hooks-v202606` → `react` `custom` `hooks` `v202606`
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\.(zip|pdf|md|html?|css|jsx?|tsx?)$/g, "")
    .split(/[^a-z0-9가-힣]+/)
    .filter(Boolean);
}

/**
 * 근거로 쓸 만한 낱말만 남깁니다.
 *
 * 걸러내는 것:
 *   · 불용어 (base, final, 예제 …)
 *   · 숫자만 있는 낱말 (01, 2026 …)
 *   · 버전 표기 (v202606)
 *   · 너무 짧은 낱말
 */
export function meaningfulTokens(tokens: Iterable<string>): Set<string> {
  const result = new Set<string>();

  for (const token of tokens) {
    if (TITLE_STOPWORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (/^v?\d{4,}$/.test(token)) continue; // v202606, 202604
    if (/^p\d+$/.test(token)) continue; // p1, p2
    // 한글은 두 글자부터, 영문은 세 글자부터 의미가 있다고 봅니다.
    const minimum = /[가-힣]/.test(token) ? 2 : 3;
    if (token.length < minimum) continue;

    result.add(token);

    // 한글 기술 용어는 영어 낱말로도 함께 담아 둡니다.
    // "제네릭" 과 "generic" 이 같은 것을 가리킨다는 사실을 이렇게 알려 줍니다.
    // 한 낱말이 여러 영어 낱말을 뜻하면 공백으로 나눠 적혀 있습니다. (멀티미디어 → audio video)
    const alias = KOREAN_TERM_ALIASES[token];
    if (alias) for (const word of alias.split(" ")) result.add(word);
  }

  return result;
}

/** 글에 어떤 기술 낱말이 몇 번 나오는지 셉니다. */
function countKeywords(text: string): Map<string, number> {
  const found = new Map<string, number>();

  for (const keyword of TECH_KEYWORDS) {
    // 원래 패턴에 g 를 붙여 전부 세되, 원본 정규식은 건드리지 않습니다.
    const global = new RegExp(keyword.pattern.source, `${keyword.pattern.flags}g`);
    const count = (text.match(global) ?? []).length;
    if (count > 0) found.set(keyword.label, count);
  }

  return found;
}

/**
 * 8단계가 만든 Markdown 에서 소스 파일들을 되읽습니다.
 *
 * 본문이 이런 모양이라는 것을 이용합니다.
 *
 *   ## 수업 코드
 *   ### src/App.jsx
 *   ```jsx
 *   (코드)
 *   ```
 *
 * zip 을 다시 풀지 않고 Markdown 만으로 코드를 되찾을 수 있습니다.
 */
function parseSourceFiles(body: string): SourceFileFeature[] {
  const codeSection = body.split("\n## 수업 코드\n")[1];
  if (!codeSection) return [];

  // "### 생략된 파일" 절이 뒤에 붙어 있으면 잘라냅니다. 그 목록은 코드가 아닙니다.
  const codeOnly = codeSection.split("\n### 생략된 파일\n")[0] ?? codeSection;

  const files: SourceFileFeature[] = [];
  const headings = [...codeOnly.matchAll(/^### (.+)$/gm)];

  headings.forEach((heading, position) => {
    const path = (heading[1] ?? "").trim();
    if (!path) return;

    const start = (heading.index ?? 0) + heading[0].length;
    const end = position + 1 < headings.length ? headings[position + 1]?.index : undefined;
    const code = codeOnly.slice(start, end);

    const baseName = (path.split("/").pop() ?? path).toLowerCase();

    // 경로 낱말 — 흔한 폴더·파일 이름은 근거가 되지 못하므로 뺍니다.
    const segments = path.split("/");
    const rawTokens: string[] = [];
    segments.forEach((segment, depth) => {
      const isFile = depth === segments.length - 1;
      const lower = segment.toLowerCase();
      if (!isFile && COMMON_PATH_SEGMENTS.has(lower)) return;
      if (isFile && COMMON_SOURCE_NAMES.has(lower)) return;
      rawTokens.push(...tokenize(segment));
    });

    files.push({
      path,
      baseName,
      tokens: meaningfulTokens(rawTokens),
      keywords: new Set(countKeywords(code).keys()),
      length: code.length,
    });
  });

  return files;
}

/**
 * 자료 하나에서 단서를 뽑습니다.
 *
 * 파일을 읽지 못하면 null 을 돌려줍니다. (한 건 때문에 전체가 멈추지 않게)
 */
export async function extractFeature(entry: IndexEntry): Promise<MaterialFeature | null> {
  if (!entry.filePath) return null;

  let body: string;
  try {
    body = await readBody(entry.filePath);
  } catch {
    return null;
  }

  const practice = isPractice(entry);

  // 실습파일은 "수업 코드" 절만 봅니다.
  // 그 앞의 파일 구조 목록에는 이미지·영상 이름까지 들어 있어 낱말이 섞이기 때문입니다.
  const keywordSource = practice ? (body.split("\n## 수업 코드\n")[1] ?? "") : body;

  const titleTokens = meaningfulTokens(tokenize(entry.title));
  const sourceFiles = practice ? parseSourceFiles(body) : [];

  // ── 제목과 같은 경로 낱말은 빼둡니다 ──
  //
  // 압축을 풀면 대개 파일 이름과 똑같은 폴더가 하나 생깁니다.
  //
  //   css-container-queries....zip  →  css-container-queries..../LICENSE.txt
  //
  // 이것을 그대로 두면 "제목이 겹친다"와 "파일 이름이 겹친다"가 **같은 사실을 두 번**
  // 세게 됩니다. 실제로 LICENSE.txt 가 "container 라는 이름이 겹치는 관련 코드"로
  // 올라오는 일이 있었습니다. 근거는 서로 독립이어야 의미가 있습니다.
  for (const file of sourceFiles) {
    for (const token of titleTokens) file.tokens.delete(token);
  }

  return {
    entry,
    subject: entry.subject ?? "_unclassified",
    titleTokens,
    keywords: countKeywords(keywordSource),
    sourceFiles,
    bodyLength: body.length,
  };
}
