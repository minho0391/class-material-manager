/**
 * ZIP 실습파일 안의 소스코드를 읽어내는 부분.
 *
 * ■ 왜 필요한가
 *
 * 수업자료 중 115건(347MB)이 zip 실습파일입니다. 그런데 지금까지는 파일만 보관하고
 * "무슨 코드가 들어 있는지"는 한 글자도 읽지 못했습니다.
 * 그래서 zip 자료는 파일 이름만으로 과목이 정해졌고, 검색에는 아예 걸리지 않았습니다.
 *
 * PDF 를 `pdf-text.ts` 로 읽어 Markdown 에 실었던 것과 똑같은 일을 zip 에도 해 줍니다.
 * 읽어낸 코드가 본문에 들어가면 분류·검색·이후 단계가 전부 그대로 동작합니다.
 *
 * ■ fflate 를 쓰는 이유
 *
 * 순수 JavaScript 로 되어 있어 의존성이 하나도 딸려오지 않고(설치 용량 ~50KB),
 * 무엇보다 **압축을 풀기 전에 파일 목록과 원본 크기를 먼저 볼 수 있습니다.**
 *
 *   unzipSync(bytes, { filter })  ← filter 가 false 를 돌려주면 그 파일은 아예 풀지 않는다
 *
 * 이 성질 덕분에 "1KB 짜리가 풀면 10GB 가 되는" 압축 폭탄을 만나도
 * 압축을 풀기 전에 걸러낼 수 있습니다. 이것이 이 라이브러리를 고른 가장 큰 이유입니다.
 *
 * ■ 절대 하지 않는 일
 *
 * zip 안의 코드는 **읽기만 합니다.** 실행하지 않고, 디스크에 풀어놓지도 않습니다.
 * 전부 메모리에서 처리하고 텍스트만 뽑아냅니다.
 */
import { unzipSync } from "fflate";

// ─────────────────────────────────────────────────────────────
// 안전 제한
//
// 수업자료 115건을 미리 조사한 수치를 근거로 정했습니다.
//   · 가장 큰 텍스트 파일 190KB (빌드 결과물 dist/index-*.js)
//   · zip 하나당 텍스트 총량 최대 831KB
//   · zip 하나당 엔트리 최대 156개
// 실제 수업 코드는 전부 이 아래에 들어오고, 상한에 걸리는 것은
// 라이브러리 번들처럼 학습 가치가 없는 파일들입니다.
// ─────────────────────────────────────────────────────────────

/** 텍스트 파일 하나에서 읽어들일 최대 크기 */
export const MAX_TEXT_FILE_BYTES = 128 * 1024; // 128 KB

/** zip 하나에서 읽어들일 텍스트 총량 */
export const MAX_TOTAL_TEXT_BYTES = 512 * 1024; // 512 KB

/** zip 하나에서 본문에 실을 소스 파일 최대 개수 */
export const MAX_SOURCE_FILES = 80;

/** zip 하나에서 살펴볼 최대 엔트리 개수 (비정상적으로 항목이 많은 파일 방어) */
export const MAX_ENTRIES = 2000;

/** 파일 구조 목록에 표시할 최대 줄 수 */
const MAX_TREE_LINES = 300;

/**
 * 텍스트 학습자료로 인정할 확장자와, Markdown 코드블록에 쓸 이름.
 *
 * `.less` `.markdown` 은 실제 수업자료 안에 들어 있어서 함께 넣었습니다.
 */
const TEXT_LANGUAGES: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  sql: "sql",
};

/**
 * 통째로 건너뛸 폴더 이름.
 *
 * 직접 쓴 코드가 아니라 도구가 만들어낸 것들입니다.
 * `__MACOSX` 는 맥에서 압축하면 자동으로 끼어드는 폴더인데,
 * 그 안에는 `._index.html` 처럼 **확장자만 소스처럼 생긴 바이너리**가 들어 있어
 * 걸러내지 않으면 본문에 깨진 글자가 들어갑니다.
 */
const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".cache",
  "coverage",
  "__MACOSX",
  ".svn",
  ".idea",
  ".vscode",
]);

/** 자동으로 만들어져 학습 가치가 없는 파일들 */
function isGeneratedFile(baseName: string): boolean {
  const lower = baseName.toLowerCase();

  // 의존성 잠금 파일 — 사람이 쓰지 않았고 수만 줄입니다
  if (/^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock)$/.test(lower)) {
    return true;
  }
  // 압축된 라이브러리 배포본 (jquery.min.js 등)
  if (/\.min\.(js|css)$/.test(lower)) return true;
  // 소스맵
  if (/\.map$/.test(lower)) return true;
  // 맥의 AppleDouble 부산물
  if (lower.startsWith("._")) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────
// 글자 인코딩
// ─────────────────────────────────────────────────────────────

/**
 * zip 안의 파일 이름을 제대로 된 한글로 되돌립니다.
 *
 * ■ 무엇이 문제인가
 *
 * zip 형식은 파일 이름이 어떤 인코딩인지 표시하는 칸(UTF-8 플래그)이 있는데,
 * 윈도우 탐색기로 만든 옛날 압축파일은 그 칸을 켜지 않고 **CP949(EUC-KR)** 로 적습니다.
 * 그러면 이름이 이렇게 보입니다.
 *
 *   ¼Ò½ºÀÌ¹ÌÁö  ←  실제로는 "소스이미지"
 *
 * 실제 수업자료에서 이런 이름이 70건 나왔습니다.
 *
 * ■ 어떻게 되돌리는가
 *
 * fflate 는 UTF-8 플래그가 없는 이름을 latin1 로 읽어 줍니다.
 * latin1 은 바이트 하나가 글자 하나에 그대로 대응하므로 **원래 바이트가 보존됩니다.**
 * 그래서 그 바이트를 꺼내 UTF-8 → EUC-KR 순서로 다시 읽어 보면 됩니다.
 * (EUC-KR 한글 바이트는 UTF-8 로는 거의 해석되지 않으므로 UTF-8 을 먼저 시도해도 안전합니다)
 */
function decodeEntryName(name: string): string {
  let hasHighByte = false;

  for (let index = 0; index < name.length; index++) {
    const code = name.charCodeAt(index);
    // 0xFF 를 넘는 글자가 있으면 이미 유니코드로 제대로 읽힌 이름입니다.
    if (code > 0xff) return name;
    if (code >= 0x80) hasHighByte = true;
  }

  // 전부 ASCII 면 손댈 것이 없습니다.
  if (!hasHighByte) return name;

  const bytes = Uint8Array.from(name, (character) => character.charCodeAt(0));
  return decodeBytes(bytes, name);
}

/** 바이트를 UTF-8 → EUC-KR 순서로 읽어 봅니다. 둘 다 실패하면 fallback 을 돌려줍니다. */
function decodeBytes(bytes: Uint8Array, fallback: string): string {
  for (const encoding of ["utf-8", "euc-kr"]) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      // 다음 인코딩으로 넘어갑니다
    }
  }
  return fallback;
}

/**
 * 파일 맨 앞의 BOM(보이지 않는 인코딩 표식)을 읽습니다.
 *
 * 없으면 null 을 돌려줍니다. 실제 수업자료에 UTF-16 으로 저장된 파일이 14건 있어서
 * 이 검사가 필요했습니다. (전부 BOM 두 글자만 있는 빈 파일이었습니다)
 */
function bomOf(bytes: Uint8Array): { encoding: string; length: number } | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: "utf-8", length: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: "utf-16le", length: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: "utf-16be", length: 2 };
  }
  return null;
}

/**
 * 소스 파일의 내용을 글자로 바꿉니다.
 *
 * 옛날 수업자료에는 CP949 로 저장된 HTML·CSS 가 섞여 있어서
 * UTF-8 로만 읽으면 주석의 한글이 전부 깨집니다. 파일 이름과 같은 방식으로 처리합니다.
 */
function decodeFileText(bytes: Uint8Array): string {
  const bom = bomOf(bytes);
  const body = bom ? bytes.subarray(bom.length) : bytes;

  // BOM 이 알려준 인코딩이 있으면 그대로 믿습니다.
  if (bom && bom.encoding !== "utf-8") {
    return new TextDecoder(bom.encoding).decode(body);
  }

  const text = decodeBytes(body, "");
  if (text) return text;

  // 어느 쪽으로도 읽히지 않으면 깨진 글자를 감수하고 UTF-8 로 읽습니다.
  return new TextDecoder("utf-8").decode(body);
}

/**
 * 확장자는 텍스트인데 실제 내용은 바이너리인 경우를 걸러냅니다.
 *
 * 글자 파일에는 0x00 바이트가 들어가지 않습니다. 이것 하나로 충분히 구분됩니다.
 */
function looksBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// 경로 안전
// ─────────────────────────────────────────────────────────────

/**
 * 압축파일 안의 경로를 믿어도 되는지 봅니다. (Zip Slip 방어)
 *
 * zip 안에 `../../../Windows/System32/무언가` 같은 경로를 넣어두고
 * 그것을 그대로 파일 경로로 쓰게 만드는 공격이 있습니다.
 *
 * 이 프로그램은 zip 을 디스크에 풀지 않으므로 원래 위험하지 않지만,
 * 나중에 누군가 "여기서 받은 경로로 파일을 쓰는" 코드를 붙일 수 있으므로
 * 애초에 이런 항목은 읽지 않고 버립니다.
 */
function isUnsafePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");

  if (normalized.startsWith("/")) return true; // 절대 경로
  if (/^[A-Za-z]:/.test(normalized)) return true; // C: 같은 드라이브 문자
  return normalized.split("/").some((segment) => segment === ".." || segment === "~");
}

// ─────────────────────────────────────────────────────────────
// 결과 자료 구조
// ─────────────────────────────────────────────────────────────

/** 본문에 실을 소스 파일 하나 */
export interface ZipSourceFile {
  /** zip 안에서의 상대경로 */
  path: string;
  /** Markdown 코드블록에 쓸 언어 이름 */
  language: string;
  /** 파일 내용 */
  text: string;
  /** 원본 크기(바이트) */
  bytes: number;
}

/** 본문에 싣지 않은 파일 하나 */
export interface ZipSkippedFile {
  path: string;
  reason: string;
  /** 안전 제한에 걸려 생략된 것인지 (단순히 이미지·바이너리라서 뺀 것과 구분) */
  byLimit: boolean;
}

/** zip 하나를 읽은 결과 */
export interface ZipContents {
  ok: boolean;
  /** 읽지 못했을 때의 이유 */
  reason?: string;
  /** 폴더를 뺀 전체 파일 개수 */
  fileCount: number;
  /** 폴더 개수 */
  directoryCount: number;
  /** 본문에 실은 소스 파일들 */
  sourceFiles: ZipSourceFile[];
  /** 본문에 싣지 않은 파일들 */
  skipped: ZipSkippedFile[];
  /** 파일 구조 목록 (그대로 코드블록에 넣습니다) */
  tree: string;
  /** 실제로 읽어들인 글자 바이트 수 */
  textBytes: number;
  /** 안전 제한 때문에 일부를 생략했는지 */
  truncated: boolean;
}

/** 이 파일이 zip 인지 */
export function isZipMime(mimeType: string): boolean {
  return mimeType === "application/zip" || mimeType === "application/x-zip-compressed";
}

/** 경로에서 파일 이름만 */
function baseNameOf(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** 파일 이름에서 확장자(소문자, 점 없음)를 꺼냅니다 */
function extensionOf(baseName: string): string {
  const match = baseName.match(/\.([A-Za-z0-9]{1,10})$/);
  return match?.[1]?.toLowerCase() ?? "";
}

// ─────────────────────────────────────────────────────────────
// 파일 구조 목록
// ─────────────────────────────────────────────────────────────

interface TreeNode {
  children: Map<string, TreeNode>;
  isFile: boolean;
}

function emptyNode(): TreeNode {
  return { children: new Map(), isFile: false };
}

/**
 * 경로 목록을 보기 좋은 폴더 구조로 만듭니다.
 *
 *   index.html
 *   css/
 *     style.css
 *
 * 제외한 파일(이미지·영상 등)도 **목록에는 그대로 남깁니다.**
 * "이 실습파일에 무엇이 들어 있는지"를 보는 것이 목록의 목적이기 때문입니다.
 */
function buildTree(paths: string[]): string {
  const root = emptyNode();

  for (const path of paths) {
    const segments = path.split("/").filter(Boolean);
    let node = root;

    segments.forEach((segment, position) => {
      let child = node.children.get(segment);
      if (!child) {
        child = emptyNode();
        node.children.set(segment, child);
      }
      if (position === segments.length - 1) child.isFile = true;
      node = child;
    });
  }

  const lines: string[] = [];
  let dropped = 0;

  const walk = (node: TreeNode, depth: number): void => {
    // 파일을 먼저, 폴더를 나중에. 각각 이름순으로 보여줍니다.
    const entries = [...node.children.entries()].sort(([nameA, a], [nameB, b]) => {
      const aIsDirectory = a.children.size > 0;
      const bIsDirectory = b.children.size > 0;
      if (aIsDirectory !== bIsDirectory) return aIsDirectory ? 1 : -1;
      return nameA.localeCompare(nameB, "ko");
    });

    for (const [name, child] of entries) {
      const isDirectory = child.children.size > 0;

      if (lines.length >= MAX_TREE_LINES) {
        dropped++;
        continue;
      }

      lines.push(`${"  ".repeat(depth)}${name}${isDirectory ? "/" : ""}`);
      if (isDirectory) walk(child, depth + 1);
    }
  };

  walk(root, 0);
  if (dropped > 0) lines.push(`… 외 ${dropped}개`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// 본체
// ─────────────────────────────────────────────────────────────

/**
 * zip 바이트에서 파일 구조와 소스코드를 읽어냅니다.
 *
 * 압축을 디스크에 풀지 않고 메모리에서만 처리합니다.
 * 읽을 파일을 **먼저 정하고 그것만 압축을 푸는** 순서라 큰 파일을 만나도 부담이 없습니다.
 */
export function readZipContents(bytes: Uint8Array): ZipContents {
  const result: ZipContents = {
    ok: false,
    fileCount: 0,
    directoryCount: 0,
    sourceFiles: [],
    skipped: [],
    tree: "",
    textBytes: 0,
    truncated: false,
  };

  /** 구조 목록에 넣을 경로들 (제외한 파일도 포함) */
  const allPaths: string[] = [];
  /** fflate 가 쓰는 원래 이름 → 우리가 읽어낸 경로 */
  const acceptedNames = new Map<string, { path: string; language: string; bytes: number }>();

  let seenEntries = 0;
  let textBudget = 0;

  /**
   * 압축을 풀기 **전에** 각 항목을 살펴봅니다.
   * 여기서 false 를 돌려주면 그 파일은 압축이 풀리지 않습니다.
   */
  const filter = (file: { name: string; originalSize: number }): boolean => {
    if (seenEntries >= MAX_ENTRIES) {
      result.truncated = true;
      return false;
    }
    seenEntries++;

    const path = decodeEntryName(file.name).replace(/\\/g, "/");

    // ── 안전하지 않은 경로는 목록에도 넣지 않고 버립니다 ──
    if (isUnsafePath(path)) {
      result.skipped.push({ path, reason: "안전하지 않은 경로라 건너뜁니다", byLimit: false });
      return false;
    }

    // ── 폴더 ──
    if (path.endsWith("/")) {
      result.directoryCount++;
      return false;
    }

    result.fileCount++;
    allPaths.push(path);

    const segments = path.split("/");
    const baseName = baseNameOf(path);

    // ── 도구가 만든 폴더 ──
    const excludedDirectory = segments
      .slice(0, -1)
      .find((segment) => EXCLUDED_DIRECTORIES.has(segment));
    if (excludedDirectory) {
      result.skipped.push({ path, reason: `${excludedDirectory}/ 안의 파일`, byLimit: false });
      return false;
    }

    // ── 자동 생성 파일 ──
    if (isGeneratedFile(baseName)) {
      result.skipped.push({ path, reason: "자동으로 만들어진 파일", byLimit: false });
      return false;
    }

    // ── 텍스트가 아닌 파일 (이미지·영상·폰트·실행파일 등) ──
    const extension = extensionOf(baseName);
    const language = TEXT_LANGUAGES[extension];
    if (!language) {
      result.skipped.push({
        path,
        reason: extension ? `${extension} 파일` : "확장자 없음",
        byLimit: false,
      });
      return false;
    }

    // ── 여기부터 안전 제한 ──
    if (file.originalSize > MAX_TEXT_FILE_BYTES) {
      result.truncated = true;
      result.skipped.push({
        path,
        reason: `${Math.round(file.originalSize / 1024)}KB 로 파일 상한(${MAX_TEXT_FILE_BYTES / 1024}KB)을 넘어 생략됨`,
        byLimit: true,
      });
      return false;
    }

    if (acceptedNames.size >= MAX_SOURCE_FILES) {
      result.truncated = true;
      result.skipped.push({
        path,
        reason: `소스 파일 개수 상한(${MAX_SOURCE_FILES}개)을 넘어 생략됨`,
        byLimit: true,
      });
      return false;
    }

    if (textBudget + file.originalSize > MAX_TOTAL_TEXT_BYTES) {
      result.truncated = true;
      result.skipped.push({
        path,
        reason: `압축파일당 총량 상한(${MAX_TOTAL_TEXT_BYTES / 1024}KB)을 넘어 생략됨`,
        byLimit: true,
      });
      return false;
    }

    textBudget += file.originalSize;
    acceptedNames.set(file.name, { path, language, bytes: file.originalSize });
    return true;
  };

  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(bytes, { filter });
  } catch (e) {
    return { ...result, ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  // ── 압축을 푼 파일들을 글자로 바꿉니다 ──
  for (const [rawName, info] of acceptedNames) {
    const content = unpacked[rawName];
    if (!content) continue;

    // 압축을 풀기 전에 본 크기가 거짓일 수 있으므로 실제 크기도 확인합니다. (압축 폭탄 2차 방어)
    if (content.length > MAX_TEXT_FILE_BYTES) {
      result.truncated = true;
      result.skipped.push({
        path: info.path,
        reason: `푼 뒤 크기가 파일 상한을 넘어 생략됨`,
        byLimit: true,
      });
      continue;
    }

    // UTF-16 으로 저장된 글자 파일에는 0x00 이 정상적으로 들어갑니다.
    // BOM 이 "나는 UTF-16 이다"라고 알려주는 경우에는 바이너리 검사를 건너뜁니다.
    if (!bomOf(content) && looksBinary(content)) {
      result.skipped.push({
        path: info.path,
        reason: "확장자와 달리 바이너리 파일입니다",
        byLimit: false,
      });
      continue;
    }

    const text = decodeFileText(content).replace(/\r\n?/g, "\n").trimEnd();
    if (!text) {
      result.skipped.push({ path: info.path, reason: "빈 파일", byLimit: false });
      continue;
    }

    result.sourceFiles.push({
      path: info.path,
      language: info.language,
      text,
      bytes: content.length,
    });
    result.textBytes += content.length;
  }

  // 경로 순서대로 정렬해 두면 같은 zip 을 다시 읽어도 결과가 같습니다.
  result.sourceFiles.sort((a, b) => a.path.localeCompare(b.path, "ko"));
  result.skipped.sort((a, b) => a.path.localeCompare(b.path, "ko"));
  result.tree = buildTree(allPaths);
  result.ok = true;

  return result;
}

// ─────────────────────────────────────────────────────────────
// Markdown 만들기
// ─────────────────────────────────────────────────────────────

/**
 * 코드 안에 ``` 이 들어 있어도 깨지지 않는 코드블록 울타리를 만듭니다.
 *
 * Markdown 문서 자체(.md)를 코드블록에 넣을 때 실제로 문제가 됩니다.
 * 안에 있는 것보다 하나 더 긴 울타리를 쓰면 됩니다.
 */
function fenceFor(text: string): string {
  let longest = 0;
  for (const match of text.matchAll(/^`{3,}/gm)) {
    longest = Math.max(longest, match[0].length);
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * 읽어낸 결과를 Markdown 본문으로 만듭니다.
 *
 * 이 글이 그대로 자료 Markdown 의 본문이 되므로
 * 5단계 과목 분류와 뷰어 검색이 곧바로 이 내용을 보게 됩니다.
 */
export function buildZipMarkdown(contents: ZipContents): string {
  const lines: string[] = [];

  lines.push("## 압축파일 구성");
  lines.push("");
  lines.push(`- 총 파일: ${contents.fileCount}개`);
  lines.push(`- 학습 가능한 소스: ${contents.sourceFiles.length}개`);
  lines.push(`- 제외된 파일: ${contents.fileCount - contents.sourceFiles.length}개`);
  if (contents.directoryCount > 0) lines.push(`- 폴더: ${contents.directoryCount}개`);
  lines.push("");

  if (contents.tree) {
    lines.push("### 파일 구조");
    lines.push("");
    lines.push("```text");
    lines.push(contents.tree);
    lines.push("```");
    lines.push("");
  }

  if (contents.sourceFiles.length > 0) {
    lines.push("## 수업 코드");
    lines.push("");

    for (const file of contents.sourceFiles) {
      const fence = fenceFor(file.text);
      lines.push(`### ${file.path}`);
      lines.push("");
      lines.push(`${fence}${file.language}`);
      lines.push(file.text);
      lines.push(fence);
      lines.push("");
    }
  } else {
    lines.push("> 이 압축파일에는 읽어들일 수 있는 소스 파일이 없습니다.");
    lines.push("> (이미지·영상·디자인 원본만 들어 있는 자료일 수 있습니다)");
    lines.push("");
  }

  // 안전 제한에 걸려 못 읽은 파일은 따로 밝혀 둡니다.
  // 이 표시가 없으면 "원래 없는 파일"인지 "못 읽은 파일"인지 알 수 없습니다.
  const byLimit = contents.skipped.filter((file) => file.byLimit);
  if (byLimit.length > 0) {
    lines.push("### 생략된 파일");
    lines.push("");
    for (const file of byLimit) lines.push(`- \`${file.path}\` — ${file.reason}`);
    lines.push("");
    lines.push("> 원본 압축파일에는 그대로 들어 있습니다. 위 저장 위치에서 열어볼 수 있습니다.");
    lines.push("");
  }

  return lines.join("\n");
}
