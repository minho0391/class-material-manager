/**
 * `.md` 파일의 frontmatter 를 분리하고 평평한(flat) 키:값만 읽는 작은 도우미.
 *
 * 뷰어(`viewer/lib/data.ts`)는 `gray-matter`를 쓰지만, CLI 쪽에는 그 의존성이 없고
 * 여기서 다루는 파일(`data/materials/**.md`, `data/references/**.md`)의 frontmatter 는
 * `src/store/markdown-writer.ts`·`src/enrich/enrich-runner.ts`가 만든 것이라
 * **최상위 스칼라 위주로 규칙적**입니다. 그래서 YAML 파서를 새로 들이지 않고
 * 최소한만 파싱합니다.
 *
 * - `splitFrontmatter`: 맨 앞의 `---\n … \n---\n` 블록을 떼어 frontmatter 원문과 본문을
 *   나눕니다. frontmatter 가 없으면 body 만 돌려줍니다. (본문 중간의 `---`(수평선)은
 *   건드리지 않습니다 — 닫는 구분자는 2번째 줄부터 처음 만나는 `---` 하나뿐입니다.)
 * - `parseFlatFrontmatter`: 들여쓰기 없는 `key: value` 줄만 읽습니다. 값이 JSON 따옴표로
 *   감싸져 있으면 벗깁니다. 중첩 목록(`  - item`)이나 블록 스칼라는 무시합니다 —
 *   references frontmatter 는 전부 최상위 스칼라라 이걸로 충분합니다.
 */

export interface SplitResult {
  /** frontmatter 원문 (구분자 `---` 제외). frontmatter 가 없으면 빈 문자열. */
  frontmatter: string;
  /** frontmatter 를 뺀 본문. */
  body: string;
}

export function splitFrontmatter(raw: string): SplitResult {
  const text = raw.replace(/^﻿/, "");
  if (!text.startsWith("---")) return { frontmatter: "", body: text };

  const lines = text.split("\n");
  // lines[0] 이 "---". 닫는 "---" 를 1번 줄부터 찾습니다.
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? "").trim() === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) return { frontmatter: "", body: text };

  const frontmatter = lines.slice(1, close).join("\n");
  // 닫는 구분자 다음 줄부터가 본문. 바로 뒤 빈 줄 하나는 흡수합니다.
  let bodyStart = close + 1;
  if (lines[bodyStart] === "") bodyStart += 1;
  const body = lines.slice(bodyStart).join("\n");
  return { frontmatter, body };
}

export function parseFlatFrontmatter(frontmatter: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of frontmatter.split("\n")) {
    // 들여쓰기된 줄(목록 항목 등)과 빈 줄·주석은 건너뜁니다.
    if (!line || /^\s/.test(line) || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s?(.*)$/);
    if (!match || match[1] === undefined) continue;
    const key = match[1];
    let value = (match[2] ?? "").trim();
    // JSON 따옴표로 감싼 문자열이면 그대로 파싱해 벗깁니다.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      try {
        value = JSON.parse(value.startsWith("'") ? `"${value.slice(1, -1)}"` : value);
      } catch {
        value = value.slice(1, -1);
      }
    }
    out[key] = value;
  }
  return out;
}
