/**
 * 수집한 자료를 Markdown 파일로 저장하는 부분.
 *
 * ■ 파일 하나의 모양
 *
 *   ---
 *   docId: 1AbC...
 *   title: React 핵심정리
 *   subject: react
 *   ...
 *   ---
 *
 *   (본문)
 *
 * 맨 위 `---` 사이의 부분을 front matter 라고 합니다.
 * 문서에 대한 정보(언제 받았는지, 어디서 왔는지)를 본문과 섞이지 않게 적어두는 자리로,
 * 블로그 도구나 정적 사이트 생성기에서 널리 쓰는 방식입니다.
 *
 * ■ 왜 이 형식인가
 *
 * 파일을 열면 사람이 바로 읽을 수 있고, 프로그램도 정보를 꺼내 쓸 수 있습니다.
 * 나중에 Next.js 로 뷰어를 만들 때도 그대로 씁니다.
 */
import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DATA_DIR, HISTORY_DIR, MATERIALS_DIR } from "../config/paths.ts";
import type { IndexEntry } from "./index-store.ts";
import { writeBytesAtomic, writeFileAtomic } from "./atomic-write.ts";

/**
 * 과목 분류 전에 자료를 모아두는 곳.
 *
 * 5단계에서 과목별 폴더로 옮깁니다.
 * "받는 일"과 "분류하는 일"을 나눠두면 각각을 따로 고치기 쉽습니다.
 */
export const INBOX_DIR = join(MATERIALS_DIR, "_inbox");

/**
 * 내려받은 원본 파일(PDF, zip, 이미지 등)을 두는 곳.
 *
 * 설명을 담은 Markdown 은 _inbox 에 함께 두고, 원본 파일만 여기로 나눕니다.
 * 그래야 5단계에서 과목별로 정리할 때 Markdown 만 보고 옮길 수 있습니다.
 */
export const FILES_DIR = join(INBOX_DIR, "files");

/**
 * 제목을 파일 이름으로 쓸 수 있게 다듬습니다.
 *
 * 윈도우에서 파일 이름에 쓸 수 없는 글자들이 있습니다: \ / : * ? " < > |
 * 한글은 그대로 두어 사람이 알아볼 수 있게 합니다.
 *
 * 뒤에 문서 ID 앞 8글자를 붙이는 이유는, 제목이 같은 문서가 여러 개 있어도
 * 서로 덮어쓰지 않게 하기 위해서입니다.
 */
export function safeFileName(title: string, docId: string): string {
  const cleaned = title
    // 윈도우 금지 문자와 제어 문자를 밑줄로
    .replace(/[\\/:*?"<>|]/g, "_")
    // 눈에 보이지 않는 제어 문자(0x00~0x1F)를 없앱니다
    .replace(/[\u0000-\u001f]/g, "")
    // 공백 정리
    .replace(/\s+/g, " ")
    .trim()
    // 이름 끝의 점과 공백은 윈도우에서 문제가 됩니다
    .replace(/[. ]+$/, "");

  // 너무 길면 경로 길이 제한에 걸리므로 자릅니다.
  const base = (cleaned || "제목없음").slice(0, 60).trim();

  return `${base}--${docId.slice(0, 8)}.md`;
}

/**
 * 참고자료(공식 문서 요약)의 파일 이름을 만듭니다.
 *
 * 수업자료와 달리 문서 ID 가 없고, 제목이 곧 고유한 이름입니다.
 * (`flex`, `useState`, `grid-template-columns` 처럼)
 * 그래서 뒤에 ID 를 붙이지 않고 제목만으로 짧게 만듭니다.
 */
export function referenceFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|`]/g, "")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .trim()
    .replace(/^-+|-+$/g, "");

  return `${(cleaned || "제목없음").slice(0, 70)}.md`;
}

/** front matter 에 넣을 값 하나를 YAML 로 안전하게 표현합니다. */
function yamlValue(value: string): string {
  // 특수한 뜻을 가지거나 오해를 살 수 있는 글자가 있으면 따옴표로 감쌉니다.
  const needsQuote = /[:#\-{}[\]&*!|>'"%@`]|^\s|\s$|^$/.test(value);
  if (!needsQuote) return value;

  // 큰따옴표 안에서는 역슬래시와 큰따옴표를 escape 합니다.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * 기록(IndexEntry)을 front matter 문자열로 바꿉니다.
 *
 * YAML 라이브러리를 쓰지 않는 이유는, 우리가 넣는 값의 종류가 정해져 있어
 * 직접 만드는 편이 훨씬 짧고 무슨 일이 일어나는지 잘 보이기 때문입니다.
 */
export function buildFrontMatter(entry: IndexEntry): string {
  const lines: string[] = ["---"];

  lines.push(`docId: ${yamlValue(entry.docId)}`);
  lines.push(`title: ${yamlValue(entry.title)}`);
  lines.push(`kind: ${entry.kind}`);
  lines.push(`format: ${entry.format}`);
  if (entry.subject) lines.push(`subject: ${entry.subject}`);
  lines.push(`sourceUrl: ${yamlValue(entry.sourceUrl)}`);

  // 이 자료가 기준 문서의 어느 섹션들에 링크되어 있었는지.
  // 중복을 없애고 순서를 유지합니다. 5단계 과목 분류의 핵심 단서입니다.
  const sections = [...new Set(entry.occurrences.map((o) => o.section).filter(Boolean))];
  if (sections.length > 0) {
    lines.push("sourceSections:");
    for (const section of sections) lines.push(`  - ${yamlValue(String(section))}`);
  }

  // 문서에 적혀 있던 링크 글자들 (제목과 다를 수 있어 분류에 도움이 됩니다)
  const linkTexts = [...new Set(entry.occurrences.map((o) => o.text).filter(Boolean))];
  if (linkTexts.length > 0) {
    lines.push("linkTexts:");
    for (const text of linkTexts) lines.push(`  - ${yamlValue(text)}`);
  }

  lines.push(`contentHash: ${entry.contentHash}`);
  lines.push(`modifiedTime: ${yamlValue(entry.modifiedTime)}`);
  lines.push(`collectedAt: ${yamlValue(entry.collectedAt)}`);
  lines.push(`updatedAt: ${yamlValue(entry.updatedAt)}`);

  if (entry.viaFallback) {
    lines.push("viaFallback: true");
    lines.push("# 10MB 제한 때문에 웹 export 로 받았습니다. 제목 계층과 링크가 없을 수 있습니다.");
  }
  if (entry.removedImages && entry.removedImages > 0) {
    lines.push(`removedImages: ${entry.removedImages}`);
  }

  // ── 파일 자료(PDF·zip·이미지 등)일 때만 붙는 항목들 ──
  if (entry.sizeBytes !== undefined) lines.push(`sizeBytes: ${entry.sizeBytes}`);
  if (entry.pageCount !== undefined) lines.push(`pageCount: ${entry.pageCount}`);
  if (entry.zipFileCount !== undefined) lines.push(`zipFileCount: ${entry.zipFileCount}`);
  if (entry.zipSourceCount !== undefined) lines.push(`zipSourceCount: ${entry.zipSourceCount}`);
  if (entry.md5Checksum) lines.push(`md5Checksum: ${entry.md5Checksum}`);
  if (entry.fileAction) lines.push(`fileAction: ${entry.fileAction}`);
  if (entry.downloadPath) lines.push(`downloadPath: ${yamlValue(entry.downloadPath)}`);
  if (entry.discoveredIn) lines.push(`discoveredIn: ${yamlValue(entry.discoveredIn)}`);

  lines.push("---");
  return lines.join("\n");
}

/**
 * 내려받은 원본 파일을 저장합니다.
 *
 * @returns data 폴더 기준 상대 경로
 */
export async function writeBinaryFile(
  title: string,
  docId: string,
  extension: string,
  bytes: Uint8Array,
): Promise<string> {
  // safeFileName 이 .md 를 붙여 주므로, 그것을 실제 확장자로 바꿔 씁니다.
  const fileName = safeFileName(title, docId).replace(/\.md$/, extension);
  const absolutePath = join(FILES_DIR, fileName);

  await mkdir(FILES_DIR, { recursive: true });
  await writeBytesAtomic(absolutePath, bytes);

  return absolutePath.slice(DATA_DIR.length + 1).replace(/\\/g, "/");
}

/**
 * 내용이 바뀐 자료의 **이전 버전을 보관**합니다.
 *
 * 수업에서 쓰던 자료가 갱신되었을 때, 예전 내용도 볼 수 있어야 합니다.
 * (요구사항: 수업에서 배운 방식은 삭제하지 않는다)
 *
 * git 을 쓰지 않기로 했으므로 이 폴더가 변경 이력을 담당합니다.
 *
 * @returns 옮긴 위치. 옮길 파일이 없었으면 null.
 */
export async function archivePrevious(
  entry: IndexEntry,
  previousFilePath: string,
): Promise<string | null> {
  const absolutePrevious = join(DATA_DIR, previousFilePath);

  // 파일 이름에 시각을 넣어 언제 것인지 알 수 있게 합니다.
  // 콜론(:)은 파일 이름에 쓸 수 없으므로 하이픈으로 바꿉니다.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(HISTORY_DIR, entry.docId, `${stamp}.md`);

  try {
    await mkdir(dirname(target), { recursive: true });
    await rename(absolutePrevious, target);
    return target;
  } catch {
    // 이전 파일이 없거나(처음 수집) 이미 지워졌으면 보관할 것도 없습니다.
    return null;
  }
}

/**
 * 자료를 파일로 저장합니다.
 *
 * @returns data 폴더 기준 상대 경로. index.json 에 이 값을 기록합니다.
 *          절대 경로를 저장하면 폴더를 옮겼을 때 전부 깨지기 때문입니다.
 */
export async function writeMaterial(entry: IndexEntry, body: string): Promise<string> {
  const fileName = safeFileName(entry.title, entry.docId);
  const absolutePath = join(INBOX_DIR, fileName);

  await mkdir(INBOX_DIR, { recursive: true });
  await writeFileAtomic(absolutePath, `${buildFrontMatter(entry)}\n\n${body}`);

  // data/ 를 기준으로 한 상대 경로로 바꿔 돌려줍니다.
  return absolutePath.slice(DATA_DIR.length + 1).replace(/\\/g, "/");
}

/**
 * **이미 자리를 잡은** 자료를 그 자리에서 다시 씁니다.
 *
 * `writeMaterial` 은 항상 `_inbox` 에 씁니다. 처음 수집할 때는 그것이 맞지만,
 * 이미 5단계에서 과목 폴더로 옮겨진 자료를 다시 만들 때 그대로 쓰면
 * `_inbox` 에 같은 자료가 하나 더 생겨 버립니다.
 *
 * 8단계에서 기존 zip 115건을 다시 읽을 때 쓰는 함수입니다.
 * 자리를 옮기지 않고 내용만 갈아끼웁니다.
 */
export async function rewriteMaterial(entry: IndexEntry, body: string): Promise<string> {
  // 아직 저장된 적이 없으면 평소대로 _inbox 에 만듭니다.
  if (!entry.filePath) return writeMaterial(entry, body);

  const absolutePath = join(DATA_DIR, entry.filePath);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFileAtomic(absolutePath, `${buildFrontMatter(entry)}\n\n${body}`);

  return entry.filePath;
}
