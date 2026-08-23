/**
 * 공식 문서를 요약하는 부분.
 *
 * ■ 왜 요약하는가
 *
 * 요구사항이 분명합니다 — **외부 문서를 통째로 복제하지 않습니다.**
 * 핵심 요약과 출처 주소, 학습 포인트만 저장합니다.
 * (React 의 useState 문서 하나가 38KB 입니다. 그대로 담을 이유가 없습니다)
 *
 * ■ 지금은 규칙으로, 나중에는 AI 로
 *
 * 이 파일은 `Summarizer` 라는 **약속(인터페이스)** 을 두고,
 * 지금은 규칙 기반 구현을 씁니다.
 *
 *   지금  ruleBasedSummarizer  — 문서의 첫 문단·소제목·코드 예제를 그대로 뽑아냅니다.
 *                                무료이고 즉시 동작하며 결과가 항상 같습니다.
 *   나중  (AI 기반 구현)        — 진짜 한국어 요약과 "수업 방식과의 차이"까지 판단합니다.
 *
 * 나중에 AI 방식을 추가할 때, 이 약속만 지키면 나머지 코드는 하나도 고치지 않아도 됩니다.
 */

/** 요약 결과 */
export interface DocSummary {
  /** 문서 제목 */
  title: string;
  /** 사람이 볼 원문 주소 */
  sourceUrl: string;
  /** 핵심 설명 (문서의 정의 부분) */
  summary: string;
  /** 학습 포인트 — 이 문서에서 다루는 항목들 */
  learningPoints: string[];
  /** 대표 코드 예제 하나 */
  example?: string;
  /** 한국어 문서인지 */
  language: "ko" | "en";
  /** 원문 글자 수 (요약이 얼마나 줄였는지 확인용) */
  originalLength: number;
}

/** 요약기가 지켜야 할 약속. 나중에 AI 구현을 끼워 넣을 자리입니다. */
export interface Summarizer {
  /** 이 요약기의 이름 (저장할 때 기록합니다) */
  readonly name: string;
  summarize(input: {
    markdown: string;
    fallbackTitle: string;
    fallbackUrl: string;
    language: "ko" | "en";
  }): Promise<DocSummary>;
}

/** front matter 를 떼어내고 그 내용을 함께 돌려줍니다. */
function splitFrontMatter(markdown: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match?.[1]) return { meta: {}, body: markdown };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv?.[1]) meta[kv[1]] = (kv[2] ?? "").trim().replace(/^["']|["']$/g, "");
  }

  return { meta, body: markdown.slice(match[0].length) };
}

/**
 * 문서에 섞여 있는 표시들을 걷어냅니다.
 *
 * MDN 은 `{{CSSRef}}`, `{{Glossary("HTML")}}` 같은 매크로를 씁니다.
 * React 문서는 `<Intro>`, `<Sandpack>` 같은 컴포넌트를 씁니다.
 * 사람이 읽을 요약에는 방해만 되므로 정리합니다.
 */
function cleanMarkup(text: string): string {
  return (
    text
      // {{Glossary("HTML", "HTML")}} → HTML  (표시할 낱말만 남깁니다)
      .replace(/\{\{\s*\w+\s*\(\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?[^)]*\)\s*\}\}/g, (_m, a, b) => b || a)
      // {{CSSRef}} 처럼 인자가 없는 매크로는 지웁니다
      .replace(/\{\{[^}]*\}\}/g, "")
      // React 문서의 소제목에 붙는 앵커 표시를 지웁니다.
      //   `## Reference {/*reference*/}` → `## Reference`
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      // <Intro> 같은 JSX 태그는 지우되 안의 글은 남깁니다
      .replace(/<\/?[A-Za-z][A-Za-z0-9]*(?:\s[^>]*)?\/?>/g, "")
      // 마크다운 링크는 글자만 남깁니다
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // 강조 표시 제거
      .replace(/[*_`]{1,3}/g, "")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

/**
 * 글이 아니라 문서 구조를 나타내는 줄인지 판단합니다.
 *
 * React 문서는 설명을 `<Intro>` 컴포넌트로 감싸 둡니다.
 *
 *   <Intro>
 *
 *   `useState` is a React Hook that lets you add a state variable…
 *
 *   </Intro>
 *
 * 이런 줄을 그냥 두면 첫 문단으로 `<Intro>` 를 잡고 끝나 버립니다.
 * (실제로 React 요약이 전부 비어 있던 원인입니다)
 */
function isStructuralLine(line: string): boolean {
  // 대문자로 시작하는 JSX 컴포넌트 태그만 있는 줄
  if (/^<\/?[A-Z][A-Za-z0-9]*(?:\s[^>]*)?\/?>$/.test(line)) return true;

  // MDN 매크로만 있는 줄.
  //   {{HTMLSidebar}}  {{JSRef}}  {{CSSRef}}
  // MDN 문서는 본문 맨 앞에 이런 줄을 두는데, 그냥 두면 이것을 첫 문단으로 잡습니다.
  // (실제로 HTML 39건 중 31건, JavaScript 14건 중 10건의 요약이 비어 있던 원인입니다)
  if (/^\{\{[^}]*\}\}$/.test(line)) return true;

  // 가로 구분선
  if (/^-{3,}$/.test(line)) return true;

  return false;
}

/**
 * 본문에서 "정의"에 해당하는 첫 문단을 찾습니다.
 *
 * 공식 문서는 대부분 맨 앞에 그 대상이 무엇인지 한두 문장으로 설명합니다.
 * 제목 줄, 빈 줄, 코드 블록, 알림 상자는 건너뜁니다.
 */
function findFirstParagraph(body: string): string {
  const lines = body.split("\n");
  const collected: string[] = [];
  let insideCode = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      insideCode = !insideCode;
      if (collected.length > 0) break;
      continue;
    }
    if (insideCode) continue;

    // <Intro> 같은 구조 표시 줄은 글이 아니므로 건너뜁니다.
    if (isStructuralLine(trimmed)) continue;

    // 제목·인용·목록·표는 정의 문단이 아닙니다.
    if (/^(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|\|)/.test(trimmed)) {
      if (collected.length > 0) break;
      continue;
    }

    if (trimmed === "") {
      if (collected.length > 0) break;
      continue;
    }

    collected.push(trimmed);

    // 두세 문장이면 정의로 충분합니다.
    if (collected.join(" ").length > 300) break;
  }

  const cleaned = cleanMarkup(collected.join(" "));
  return cleaned.length > 500 ? `${cleaned.slice(0, 500)}…` : cleaned;
}

/**
 * 소제목을 모아 학습 포인트로 씁니다.
 *
 * 공식 문서의 소제목은 그 자체로 "이 문서에서 배울 것들" 목록입니다.
 * 예) 구문 / 값 / 예제 / 브라우저 호환성
 */
function findHeadings(body: string): string[] {
  const headings: string[] = [];
  let insideCode = false;

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      insideCode = !insideCode;
      continue;
    }
    if (insideCode) continue;

    const match = trimmed.match(/^(#{2,3})\s+(.+)$/);
    if (!match?.[2]) continue;

    const title = cleanMarkup(match[2]);
    // 학습 내용과 무관한 항목은 뺍니다.
    if (/^(브라우저 호환성|browser compatibility|명세|specifications|같이 보기|see also)$/i.test(title)) {
      continue;
    }
    if (title) headings.push(title);
  }

  return [...new Set(headings)].slice(0, 8);
}

/**
 * 쓸 만한 코드 예제 하나를 뽑습니다.
 *
 * 첫 번째 코드 블록을 그냥 가져오면 안 됩니다.
 * MDN 문서에는 내용이 비어 있는 코드 블록이 앞쪽에 오는 경우가 많아서,
 * 실제로 확인해 보니 예제 칸이 빈 채로 저장됐습니다.
 * 그래서 **내용이 있는** 첫 블록을 찾습니다.
 */
function findFirstExample(body: string): string | undefined {
  const blocks = [...body.matchAll(/```([A-Za-z]*)\r?\n([\s\S]*?)```/g)];

  for (const block of blocks) {
    const code = (block[2] ?? "").trimEnd();

    // 빈 블록이나 한두 글자짜리는 예제로 쓸 수 없습니다.
    if (code.trim().length < 10) continue;

    const language = block[1] ?? "";
    const lines = code.split("\n");
    const clipped = lines.length > 20 ? `${lines.slice(0, 20).join("\n")}\n…` : code;

    return `\`\`\`${language}\n${clipped}\n\`\`\``;
  }

  return undefined;
}

/**
 * 문서 제목을 다듬습니다.
 *
 * MDN 영어 문서의 제목은 `` `display` CSS property `` 처럼 백틱이 들어 있어
 * 그대로 쓰면 파일 이름과 목록이 지저분해집니다.
 * (한국어 문서는 `flex` 처럼 깔끔합니다)
 */
function cleanTitle(title: string): string {
  return title.replace(/`/g, "").replace(/\s+/g, " ").trim();
}

/**
 * MDN 문서의 front matter 에 있는 slug 로 실제 웹 주소를 만듭니다.
 *
 * 예) slug: Web/CSS/flex  →  https://developer.mozilla.org/ko/docs/Web/CSS/flex
 */
function mdnUrlFromSlug(slug: string, language: "ko" | "en"): string {
  const locale = language === "ko" ? "ko" : "en-US";
  return `https://developer.mozilla.org/${locale}/docs/${slug}`;
}

/**
 * 규칙 기반 요약기.
 *
 * AI 를 쓰지 않고, 문서 안에 이미 있는 것들(정의 문단·소제목·예제)을 뽑아냅니다.
 * 사람이 직접 요약한 것만큼 매끄럽지는 않지만
 *   · 출처가 분명하고 (원문 문장을 그대로 씁니다)
 *   · 결과가 항상 같으며
 *   · 비용이 들지 않습니다.
 */
export const ruleBasedSummarizer: Summarizer = {
  name: "rule-based",

  async summarize({ markdown, fallbackTitle, fallbackUrl, language }): Promise<DocSummary> {
    const { meta, body } = splitFrontMatter(markdown);

    const title = cleanTitle(meta.title ?? fallbackTitle);

    // MDN 문서는 slug 로 정확한 주소를 만들 수 있습니다.
    // 그 외에는 받아온 주소를 쓰되, 사람이 볼 주소이므로 `.md` 는 떼어냅니다.
    //   https://react.dev/reference/react/useState.md → …/useState
    const sourceUrl = meta.slug
      ? mdnUrlFromSlug(meta.slug, language)
      : (meta.url ?? fallbackUrl).replace(/\.md$/, "");

    // 문서가 description 을 갖고 있으면 그것이 가장 좋은 요약입니다.
    const summary = meta.description
      ? cleanMarkup(meta.description)
      : findFirstParagraph(body);

    return {
      title,
      sourceUrl,
      summary,
      learningPoints: findHeadings(body),
      example: findFirstExample(body),
      language,
      originalLength: markdown.length,
    };
  },
};
