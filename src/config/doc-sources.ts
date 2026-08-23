/**
 * 공식 문서 출처 — 어느 과목을 어느 문서로 보충할지 정합니다.
 *
 * ■ 우선순위
 *
 *   HTML · CSS · JavaScript → MDN
 *   React                   → React 공식 문서
 *   TypeScript              → TypeScript 공식 문서
 *   Next.js                 → Next.js 공식 문서
 *   Supabase                → Supabase 공식 문서
 *   MUI                     → MUI 공식 문서
 *   W3Schools               → 초보자용 예제가 필요할 때만 (여기서는 다루지 않습니다)
 *
 * ■ 실제로 확인한 접근 방법
 *
 *   · react.dev / nextjs.org 는 페이지 주소 뒤에 `.md` 를 붙이면 마크다운 원문을 줍니다.
 *   · supabase.com 은 llms.txt 로 문서 목록을 줍니다.
 *   · MDN 은 GitHub 저장소에 원문이 있고, **한국어 번역본도 있습니다.**
 *     다만 완전하지 않아서(flex 는 있고 grid 는 없음) 한국어를 먼저 찾고 없으면 영어를 씁니다.
 *   · TypeScript · MUI 는 웹사이트가 자바스크립트로 그려져 파싱이 어렵지만,
 *     GitHub 저장소에 마크다운 원문이 있습니다.
 */

/** 문서 목록(색인)을 얻는 방법 */
export type IndexSource =
  /** llms.txt — 사이트가 AI 도구용으로 제공하는 문서 목록 */
  | { type: "llms-txt"; url: string }
  /** GitHub 저장소의 디렉터리 목록 */
  | { type: "github-dir"; repo: string; branch: string; path: string };

/** 과목 하나에 대한 공식 문서 출처 */
export interface DocSource {
  /** 어느 과목 폴더에 저장할지 */
  subject: string;
  /** 사람이 읽을 이름 */
  name: string;
  /** 문서 목록을 얻는 방법 */
  index: IndexSource;
  /**
   * 한국어 번역이 없을 때 쓸 대체 출처.
   * MDN 처럼 번역이 부분적인 곳에 필요합니다.
   */
  fallback?: IndexSource;
  /** 사람이 볼 문서 홈 주소 */
  homeUrl: string;
}

/** GitHub 원문 주소를 만듭니다. */
export function rawGithubUrl(repo: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
}

/** GitHub 디렉터리 목록 API 주소를 만듭니다. */
export function githubDirApiUrl(repo: string, path: string): string {
  return `https://api.github.com/repos/${repo}/contents/${path}`;
}

/**
 * 과목별 공식 문서 출처.
 *
 * MDN 경로에 `reference` 가 들어가는 이유는, 최근 저장소 구조가 바뀌어
 * `web/css/` 아래에 guides · reference 같은 하위 폴더가 생겼기 때문입니다.
 * (예전 경로 `web/css/grid/index.md` 는 이제 404 가 납니다)
 */
export const DOC_SOURCES: readonly DocSource[] = [
  {
    subject: "css",
    name: "MDN CSS 속성",
    homeUrl: "https://developer.mozilla.org/ko/docs/Web/CSS",
    index: {
      type: "github-dir",
      repo: "mdn/translated-content",
      branch: "main",
      path: "files/ko/web/css/reference/properties",
    },
    fallback: {
      type: "github-dir",
      repo: "mdn/content",
      branch: "main",
      path: "files/en-us/web/css/reference/properties",
    },
  },
  {
    subject: "html",
    name: "MDN HTML 요소",
    homeUrl: "https://developer.mozilla.org/ko/docs/Web/HTML",
    index: {
      type: "github-dir",
      repo: "mdn/translated-content",
      branch: "main",
      path: "files/ko/web/html/reference/elements",
    },
    fallback: {
      type: "github-dir",
      repo: "mdn/content",
      branch: "main",
      path: "files/en-us/web/html/reference/elements",
    },
  },
  {
    subject: "javascript",
    name: "MDN JavaScript 내장 객체",
    homeUrl: "https://developer.mozilla.org/ko/docs/Web/JavaScript",
    index: {
      type: "github-dir",
      repo: "mdn/translated-content",
      branch: "main",
      path: "files/ko/web/javascript/reference/global_objects",
    },
    fallback: {
      type: "github-dir",
      repo: "mdn/content",
      branch: "main",
      path: "files/en-us/web/javascript/reference/global_objects",
    },
  },
  {
    subject: "react",
    name: "React 공식 문서",
    homeUrl: "https://react.dev",
    index: { type: "llms-txt", url: "https://react.dev/llms.txt" },
  },
  {
    subject: "nextjs",
    name: "Next.js 공식 문서",
    homeUrl: "https://nextjs.org/docs",
    index: { type: "llms-txt", url: "https://nextjs.org/docs/llms.txt" },
  },
  {
    subject: "supabase",
    name: "Supabase 공식 문서",
    homeUrl: "https://supabase.com/docs",
    index: { type: "llms-txt", url: "https://supabase.com/llms.txt" },
  },
  {
    subject: "typescript",
    name: "TypeScript 핸드북",
    homeUrl: "https://www.typescriptlang.org/docs/handbook/intro.html",
    index: {
      type: "github-dir",
      repo: "microsoft/TypeScript-Website",
      branch: "v2",
      path: "packages/documentation/copy/en/handbook-v2",
    },
  },
  {
    subject: "mui",
    name: "MUI 공식 문서",
    homeUrl: "https://mui.com/material-ui/getting-started/",
    index: {
      type: "github-dir",
      repo: "mui/material-ui",
      branch: "master",
      path: "docs/data/material/getting-started",
    },
  },
];

/**
 * 사이트별로 개별 문서의 마크다운 주소를 만드는 방법.
 *
 * react.dev 와 nextjs.org 는 페이지 주소 뒤에 `.md` 를 붙이면 원문이 옵니다.
 * (실제로 확인했습니다: https://react.dev/reference/react/useState.md)
 */
export function markdownUrlFor(pageUrl: string): string | null {
  // ★ 주의: react.dev 의 llms.txt 는 주소에 **이미 .md 가 붙어 있습니다.**
  //   `- [Quick Start](https://react.dev/learn.md)`
  // 여기서 한 번 더 붙이면 `learn.md.md` 가 되어 전부 404 가 납니다.
  // (실제로 React 요약이 0건 나왔던 원인입니다)
  if (pageUrl.endsWith(".md")) return pageUrl;

  if (/^https:\/\/react\.dev\//.test(pageUrl)) return `${pageUrl.replace(/\/$/, "")}.md`;
  if (/^https:\/\/nextjs\.org\/docs\//.test(pageUrl)) return `${pageUrl.replace(/\/$/, "")}.md`;

  // Supabase 는 페이지별 마크다운을 제공하지 않아 색인만 씁니다.
  return null;
}

/** 한 과목당 요약본을 만들 문서의 최대 개수. 너무 많이 받지 않기 위한 상한입니다. */
export const MAX_SUMMARIES_PER_SUBJECT = 40;

/** 요청 사이에 쉬는 시간(밀리초). 공식 문서 서버에 대한 예의입니다. */
export const FETCH_DELAY_MS = 200;
