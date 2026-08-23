/**
 * 공식 문서의 "목록"을 가져오는 부분.
 *
 * ■ 왜 목록을 먼저 만드는가
 *
 * 공식 문서는 전부 합쳐 700개가 넘습니다. 전부 내려받을 이유가 없습니다.
 * 먼저 **제목과 주소만 담긴 가벼운 목록**을 만들어 두면
 *   · 나중에 "그 내용 어디서 봤더라" 할 때 찾아볼 수 있고
 *   · 그중 수업에서 배운 주제만 골라 원문을 받을 수 있습니다.
 *
 * ■ 두 가지 방식
 *
 *   llms.txt     사이트가 AI 도구용으로 제공하는 목록. `- [제목](주소)` 형태입니다.
 *   github-dir   GitHub 저장소의 폴더 목록. MDN·TypeScript·MUI 가 여기 해당합니다.
 */
import {
  githubDirApiUrl,
  markdownUrlFor,
  rawGithubUrl,
  type DocSource,
  type IndexSource,
} from "../config/doc-sources.ts";
import { fetchWithRetry, type RetryDeps } from "../net/fetch-retry.ts";
import type { SourceAttempt } from "./collect-status.ts";

/** 목록에 담기는 문서 하나 */
export interface DocIndexEntry {
  /** 문서 제목 */
  title: string;
  /** 사람이 볼 웹 주소. 모르면 원문을 받을 때 채웁니다. */
  url?: string;
  /** 마크다운 원문 주소. 이게 있어야 요약을 만들 수 있습니다. */
  markdownUrl?: string;
  /** llms.txt 안에서 어느 묶음에 속했는지 */
  section?: string;
  /** 한국어 문서인지 영어 문서인지 */
  language: "ko" | "en";
  /**
   * 주 주소가 없을 때 대신 짚어 볼 자리. (17단계)
   *
   * MDN 한국어 저장소에는 **폴더는 있는데 `index.md` 는 없는** 경우가 있습니다.
   * (`web/html/reference/elements/input` 이 그렇습니다 — 하위 문서만 있고 본문이 없습니다)
   * 목록에는 잡히지만 원문을 받으려 하면 404 가 납니다.
   *
   * 그런데 **영어 원문은 멀쩡히 있습니다.** 그래서 영어 주소를 함께 들고 다니다가,
   * 한국어가 없으면 영어로 받습니다. 이것이 없을 때는 문서를 통째로 잃었습니다.
   */
  fallbackMarkdownUrl?: string;
}

export interface FetchIndexResult {
  ok: boolean;
  entries: DocIndexEntry[];
  /** 한국어로 받은 문서 수 (MDN 처럼 번역이 부분적인 곳을 확인하려고 셉니다) */
  koreanCount: number;
  reason?: string;
  /**
   * 출처마다 무슨 일이 있었는지. (16단계)
   *
   * 예전에는 못 받아온 것을 **빈 목록**으로 바꿔 돌려줬습니다.
   * 그래서 "문서 0개" 가 되고 화면에는 성공이라고 찍혔습니다.
   * 이제는 시도한 결과를 그대로 들고 나갑니다 — 부르는 쪽이 판단하도록.
   */
  attempts: SourceAttempt[];
}

/**
 * llms.txt 를 읽어 문서 목록을 뽑습니다.
 *
 * 파일은 이런 모양입니다.
 *
 *   # React Documentation
 *   ## Learn React
 *   - [Quick Start](https://react.dev/learn): 설명
 */
function parseLlmsTxt(text: string): DocIndexEntry[] {
  const entries: DocIndexEntry[] = [];
  let currentSection: string | undefined;

  for (const line of text.split("\n")) {
    const heading = line.match(/^#{2,3}\s+(.+)$/);
    if (heading?.[1]) {
      currentSection = heading[1].trim();
      continue;
    }

    // - [제목](주소) 또는 - [제목](주소): 설명
    const link = line.match(/^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)/);
    if (!link?.[1] || !link[2]) continue;

    const url = link[2].trim();
    entries.push({
      title: link[1].trim(),
      url,
      markdownUrl: markdownUrlFor(url) ?? undefined,
      section: currentSection,
      language: "en",
    });
  }

  return entries;
}

/**
 * GitHub 디렉터리 목록에서 문서 폴더/파일을 골라냅니다.
 *
 * **못 받았을 때 빈 목록으로 뭉개지 않습니다.** 왜 못 받았는지 함께 돌려줍니다.
 * 이것을 구분하지 못해서, 요청 한도를 넘긴 실행이 "문서 0개 · 완료" 로 보였습니다.
 */
async function fetchGithubDir(
  source: Extract<IndexSource, { type: "github-dir" }>,
  language: "ko" | "en",
  deps: RetryDeps = {},
): Promise<{ entries: DocIndexEntry[]; attempt: SourceAttempt }> {
  const where = `${source.repo}/${source.path}`;

  // 목록도 원문과 같은 대접을 받습니다. (17단계)
  // 잠깐 흔들린 것 때문에 과목 하나가 통째로 날아가면,
  // 그 과목의 원문은 시도조차 못 해 봅니다 — 목록이 없으니까요.
  const outcome = await fetchWithRetry(
    githubDirApiUrl(source.repo, source.path),
    { accept: "application/vnd.github+json" },
    deps,
  );

  if (!outcome.ok) {
    const failure = outcome.failure;
    return {
      entries: [],
      attempt: {
        where,
        ok: false,
        count: 0,
        rateLimited: failure.type === "RATE_LIMIT",
        resetAt: failure.resetAt,
        reason: failure.type === "NOT_FOUND" ? "그 자리에 없습니다 (404)" : failure.reason,
      },
    };
  }

  let items: Array<{ name: string; type: string }>;
  try {
    items = (await outcome.response.json()) as Array<{ name: string; type: string }>;
  } catch (error) {
    return {
      entries: [],
      attempt: {
        where,
        ok: false,
        count: 0,
        reason: `응답을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  if (!Array.isArray(items)) {
    return { entries: [], attempt: { where, ok: false, count: 0, reason: "목록이 아닌 응답이 왔습니다" } };
  }

  const entries: DocIndexEntry[] = [];

  for (const item of items) {
    // MDN 은 문서마다 폴더를 만들고 그 안에 index.md 를 둡니다.
    if (item.type === "dir") {
      entries.push({
        title: item.name,
        markdownUrl: rawGithubUrl(source.repo, source.branch, `${source.path}/${item.name}/index.md`),
        language,
      });
      continue;
    }

    // TypeScript·MUI 는 문서가 곧 하나의 .md 파일입니다.
    if (item.type === "file" && item.name.endsWith(".md") && item.name !== "index.md") {
      entries.push({
        title: item.name.replace(/\.md$/, ""),
        markdownUrl: rawGithubUrl(source.repo, source.branch, `${source.path}/${item.name}`),
        language,
      });
    }
  }

  return { entries, attempt: { where, ok: true, count: entries.length } };
}

/**
 * 한 과목의 문서 목록을 가져옵니다.
 *
 * MDN 처럼 한국어 번역이 부분적인 곳은 **한국어 목록과 영어 목록을 합칩니다.**
 * 같은 문서가 양쪽에 있으면 한국어를 씁니다.
 * (실제로 `flex` 는 한국어가 있지만 `grid` 는 없습니다)
 */
export async function fetchIndex(
  source: DocSource,
  deps: RetryDeps = {},
): Promise<FetchIndexResult> {
  try {
    // ── llms.txt ──
    if (source.index.type === "llms-txt") {
      const where = source.index.url;

      // llms.txt 도 같은 길로 보냅니다. GitHub 이 아니므로 토큰은 붙지 않고,
      // 요청 한도라고 단정하지도 않습니다 — HTTP 상태만 보고 정직하게 판단합니다.
      const outcome = await fetchWithRetry(where, {}, deps);

      if (!outcome.ok) {
        const reason = outcome.failure.reason;
        return {
          ok: false,
          entries: [],
          koreanCount: 0,
          reason,
          attempts: [{ where, ok: false, count: 0, reason }],
        };
      }
      const entries = parseLlmsTxt(await outcome.response.text());
      return {
        ok: true,
        entries,
        koreanCount: 0,
        attempts: [{ where, ok: true, count: entries.length }],
      };
    }

    // ── GitHub 디렉터리 ──
    // 대체 출처(영어)가 있다는 것은 주 출처가 한국어 번역본이라는 뜻입니다. (MDN)
    // 대체 출처가 없으면 그 저장소가 곧 원본이므로 영어입니다. (TypeScript·MUI)
    const primaryLanguage: "ko" | "en" = source.fallback ? "ko" : "en";
    const primary = await fetchGithubDir(source.index, primaryLanguage, deps);

    const attempts: SourceAttempt[] = [primary.attempt];

    // 대체 출처(영어)가 있으면 합칩니다.
    let merged = primary.entries;
    if (source.fallback?.type === "github-dir") {
      const english = await fetchGithubDir(source.fallback, "en", deps);
      attempts.push(english.attempt);

      const byTitle = new Map<string, DocIndexEntry>();
      // 영어를 먼저 넣고, 한국어로 덮어씁니다. → 한국어가 있으면 한국어가 남습니다.
      for (const entry of english.entries) byTitle.set(entry.title, entry);

      for (const entry of primary.entries) {
        // 덮어쓰기 전에 영어 주소를 **대체 자리로 챙겨 둡니다.**
        // 한국어 쪽에 본문이 없을 때 이것으로 받습니다.
        const englishEntry = byTitle.get(entry.title);
        byTitle.set(entry.title, {
          ...entry,
          fallbackMarkdownUrl: englishEntry?.markdownUrl,
        });
      }

      merged = [...byTitle.values()];
    }

    merged.sort((a, b) => a.title.localeCompare(b.title));

    // 하나라도 받아왔으면 목록은 쓸 수 있습니다.
    // 전부 실패했으면 **빈 목록을 성공이라고 하지 않습니다.**
    const anySucceeded = attempts.some((attempt) => attempt.ok);

    return {
      ok: anySucceeded,
      entries: merged,
      koreanCount: merged.filter((e) => e.language === "ko").length,
      reason: anySucceeded ? undefined : attempts.find((attempt) => !attempt.ok)?.reason,
      attempts,
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      entries: [],
      koreanCount: 0,
      reason,
      attempts: [{ where: source.name, ok: false, count: 0, reason }],
    };
  }
}
