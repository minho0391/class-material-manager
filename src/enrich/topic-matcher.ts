/**
 * 수업자료와 공식 문서를 이어 주는 부분.
 *
 * ■ 왜 매칭이 필요한가
 *
 * 공식 문서는 다 합쳐 700개가 넘습니다. 전부 요약하는 건 낭비입니다.
 * **수업에서 실제로 다룬 주제**만 골라 보충하는 것이 요구사항이기도 합니다.
 *
 * ■ 어떻게 고르는가
 *
 * 공식 문서의 제목(예: `flex`, `grid-template-columns`, `useState`)이
 * 수업자료 안에 몇 번이나 나오는지 셉니다. 많이 나올수록 중요한 주제입니다.
 *
 * 제목만 보지 않고 **본문까지 읽는 이유**는, 수업자료 파일 이름이
 * `CSS_P1_BASE.zip` 처럼 내용을 알 수 없게 되어 있는 경우가 많기 때문입니다.
 * 본문을 봐야 그 안에서 `grid-template-columns` 를 다뤘는지 알 수 있습니다.
 */
import { readFile } from "node:fs/promises";
import { DATA_DIR } from "../config/paths.ts";
import { join } from "node:path";
import type { IndexEntry } from "../store/index-store.ts";
import type { DocIndexEntry } from "./index-fetcher.ts";

/** 매칭된 문서 하나 */
export interface MatchedTopic {
  doc: DocIndexEntry;
  /** 수업자료에서 몇 번 언급됐는지 */
  hits: number;
  /** 어느 수업자료에서 나왔는지 (최대 5건) */
  materials: string[];
}

/**
 * 너무 짧거나 흔한 낱말은 매칭에서 뺍니다.
 *
 * MDN 문서 중에는 `in`, `or`, `and` 같은 제목이 있는데
 * 이런 것으로 매칭하면 아무 문서에나 걸립니다.
 */
const MIN_TITLE_LENGTH = 4;

const STOP_TITLES = new Set([
  "index", "readme", "guide", "guides", "reference", "tutorial", "intro",
  "introduction", "overview", "get", "set", "all", "any", "new", "this",
  "and", "or", "not", "in", "of", "to", "is", "as", "at", "by",
  // 영어 문서에서 너무 흔하게 쓰이는 낱말들.
  // React 문서에는 `use`, `act` 라는 진짜 API 가 있지만,
  // 본문 어디에나 나오는 단어라 몇 번 언급됐는지로는 중요도를 알 수 없습니다.
  "use", "act", "target", "cache", "value", "type", "types", "data",
  "text", "code", "test", "page", "link", "list", "form", "name",
]);

/**
 * 한 과목의 수업자료 본문을 전부 읽어 하나의 글로 합칩니다.
 *
 * 이 글에서 공식 문서 제목을 찾게 됩니다.
 */
export async function collectMaterialText(
  entries: IndexEntry[],
): Promise<{ text: string; byFile: Array<{ title: string; text: string; explanatory: boolean }> }> {
  const byFile: Array<{ title: string; text: string; explanatory: boolean }> = [];

  for (const entry of entries) {
    if (!entry.filePath) continue;
    try {
      const content = await readFile(join(DATA_DIR, entry.filePath), "utf8");
      byFile.push({
        title: entry.title ?? entry.docId,
        text: content.toLowerCase(),
        // 강사 설명자료인지 실습파일인지 표시해 둡니다.
        // "이 주제를 다룬 수업자료" 를 고를 때 설명자료를 앞세우려고 씁니다. (아래 matchTopics)
        explanatory:
          entry.kind === "document" ||
          entry.kind === "published-document" ||
          entry.mimeType === "application/pdf",
      });
    } catch {
      // 파일을 못 읽어도 넘어갑니다. 나머지 자료로 충분합니다.
    }
  }

  return { text: byFile.map((f) => f.text).join("\n"), byFile };
}

/**
 * 매칭에 쓸 낱말을 만듭니다.
 *
 * MDN 문서 폴더 이름은 `grid-template-columns` 처럼 하이픈으로 되어 있는데
 * 실제 수업자료에도 같은 형태로 쓰이므로 그대로 씁니다.
 * TypeScript 핸드북은 `Everyday Types` 처럼 공백과 대문자가 섞여 있어 소문자로 맞춥니다.
 */
function searchTermOf(doc: DocIndexEntry): string | null {
  const raw = doc.title.trim().toLowerCase();

  // 파일 이름에 붙은 순번(예: "01-basics")은 떼어냅니다.
  const cleaned = raw.replace(/^\d+[-_. ]+/, "");

  if (cleaned.length < MIN_TITLE_LENGTH) return null;
  if (STOP_TITLES.has(cleaned)) return null;

  return cleaned;
}

/**
 * 어떤 낱말이 글 안에 **낱말 단위로** 몇 번 나오는지 셉니다.
 *
 * 단순히 글자가 들어 있는지만 보면 안 됩니다.
 * 실제로 그렇게 해봤더니 `use` 가 1790번 나온 것으로 셌는데,
 * 대부분 `useState`·`useEffect` 안에 들어 있는 "use" 였습니다.
 *
 * 그래서 앞뒤가 영문자·숫자가 아닐 때만 셉니다.
 * `grid-template-columns` 처럼 하이픈이 든 낱말도 제대로 세어집니다.
 */
function countOccurrences(haystack: string, needle: string): number {
  // 정규식에서 특별한 뜻을 갖는 글자를 그대로 찾도록 escape 합니다.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // \b 는 한글 옆에서 뜻대로 동작하지 않으므로 직접 앞뒤를 확인합니다.
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "g");

  let count = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(haystack)) !== null) {
    count++;
    // 겹치는 경우를 놓치지 않도록 한 글자만 뒤로 물러섭니다.
    pattern.lastIndex = match.index + match[0].length - 1;
  }

  return count;
}

/**
 * 공식 문서 목록에서 "수업에서 다룬 것들"을 골라 냅니다.
 *
 * @param docs 공식 문서 목록
 * @param material collectMaterialText 의 결과
 * @param limit 최대 몇 개까지 고를지
 */
export function matchTopics(
  docs: DocIndexEntry[],
  material: { text: string; byFile: Array<{ title: string; text: string; explanatory: boolean }> },
  limit: number,
): MatchedTopic[] {
  const matched: MatchedTopic[] = [];

  for (const doc of docs) {
    const term = searchTermOf(doc);
    if (!term) continue;

    const hits = countOccurrences(material.text, term);
    if (hits === 0) continue;

    // 어느 수업자료에서 나왔는지 찾아 둡니다. 나중에 나란히 놓고 비교할 때 씁니다.
    //
    // ■ 설명자료를 앞에 둡니다
    //
    // 8단계에서 zip 안의 소스코드를 본문에 실은 뒤로, 낱말이 실습파일에서도 잔뜩 걸립니다.
    // 그런데 먼저 만난 5건만 담다 보니 **강사 설명자료가 실습파일에 밀려 사라졌습니다.**
    // (12단계 첫 refresh 에서 학습자료의 공식문서 연결이 81개 → 58개로 줄었습니다)
    //
    // 이 목록이 뜻하는 것은 "이 주제를 다룬 수업"이므로 설명자료가 먼저 와야 맞습니다.
    // 실습파일은 그 뒤에, 자리가 남을 때만 담습니다.
    const matching = material.byFile.filter((file) => file.text.includes(term));
    const materials = [
      ...matching.filter((file) => file.explanatory),
      ...matching.filter((file) => !file.explanatory),
    ]
      .map((file) => file.title)
      .slice(0, 5);

    matched.push({ doc, hits, materials });
  }

  // 많이 언급된 순서로 고릅니다.
  matched.sort((a, b) => b.hits - a.hits || a.doc.title.localeCompare(b.doc.title));

  return matched.slice(0, limit);
}
