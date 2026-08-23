/**
 * 실습파일 Markdown 에서 **코드 원문을 그대로** 꺼내오는 부분.
 *
 * ■ 어디서 꺼내오는가
 *
 * 8단계가 zip 안의 소스코드를 이런 모양으로 저장해 두었습니다.
 *
 *   ## 수업 코드
 *   ### src/hooks/useDebounce.js
 *   ```javascript
 *   (코드)
 *   ```
 *
 * 그러니 zip 을 다시 풀 필요가 없습니다. 이 Markdown 만 읽으면 됩니다.
 * 원본 zip 도, 8단계가 만든 Markdown 도 **건드리지 않습니다.**
 *
 * ■ 코드는 한 글자도 고치지 않습니다
 *
 * 강사님이 준 실습 코드가 학습의 근거입니다.
 * 다듬거나 고치면 "수업에서 배운 것"이 아니게 됩니다.
 * 여기서는 코드블록 울타리만 걷어내고 안의 내용은 그대로 옮깁니다.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../config/paths.ts";

/** 실습파일에서 꺼낸 소스 파일 하나 */
export interface PracticeCode {
  /** zip 안에서의 상대경로 */
  path: string;
  /** Markdown 코드블록에 적혀 있던 언어 이름 */
  language: string;
  /** 코드 원문 */
  code: string;
}

/**
 * 파일 확장자로 언어를 정합니다.
 *
 * 8단계가 코드블록에 언어를 이미 적어 두었으므로 보통은 그것을 씁니다.
 * 이 함수는 어쩌다 언어가 비어 있을 때를 위한 대비책입니다.
 */
export function languageOf(path: string): string {
  const extension = path.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? "";

  const table: Record<string, string> = {
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

  return table[extension] ?? "text";
}

/**
 * 코드블록 하나에서 언어와 내용을 꺼냅니다.
 *
 * 울타리 길이가 일정하지 않습니다. 8단계가 코드 안에 ``` 이 들어 있으면
 * 바깥 울타리를 한 칸 더 길게 만들기 때문입니다. (README.md 를 담은 실습파일이 그렇습니다)
 * 그래서 **여는 울타리와 길이가 같은 줄**을 닫는 울타리로 봅니다.
 */
function unwrapCodeBlock(block: string): { language: string; code: string } | null {
  const lines = block.split("\n");

  let start = -1;
  let fence = "";
  let language = "";

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index]?.match(/^(`{3,})(\S*)\s*$/);
    if (match) {
      start = index;
      fence = match[1] ?? "";
      language = match[2] ?? "";
      break;
    }
  }

  if (start === -1) return null;

  for (let index = start + 1; index < lines.length; index++) {
    if (lines[index] === fence) {
      return { language, code: lines.slice(start + 1, index).join("\n") };
    }
  }

  // 닫는 울타리를 못 찾으면 끝까지를 코드로 봅니다. (파일이 잘렸을 때 대비)
  return { language, code: lines.slice(start + 1).join("\n") };
}

/**
 * 실습파일 Markdown 한 편에서 소스 파일들을 모두 꺼냅니다.
 *
 * @returns 경로 → 코드
 */
export async function readPracticeCode(filePath: string): Promise<Map<string, PracticeCode>> {
  const result = new Map<string, PracticeCode>();

  let raw: string;
  try {
    raw = await readFile(join(DATA_DIR, filePath), "utf8");
  } catch {
    return result;
  }

  const section = raw.split("\n## 수업 코드\n")[1];
  if (!section) return result;

  // "### 생략된 파일" 절은 코드가 아니라 안내 목록입니다.
  const codeOnly = section.split("\n### 생략된 파일\n")[0] ?? section;

  const headings = [...codeOnly.matchAll(/^### (.+)$/gm)];

  headings.forEach((heading, position) => {
    const path = (heading[1] ?? "").trim();
    if (!path) return;

    const start = (heading.index ?? 0) + heading[0].length;
    const end = position + 1 < headings.length ? headings[position + 1]?.index : undefined;

    const unwrapped = unwrapCodeBlock(codeOnly.slice(start, end));
    if (!unwrapped) return;

    result.set(path, {
      path,
      language: unwrapped.language || languageOf(path),
      code: unwrapped.code,
    });
  });

  return result;
}
