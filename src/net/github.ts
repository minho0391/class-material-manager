/**
 * GitHub 에 요청을 보내는 자리 — **한곳에만 둡니다.**
 *
 * ■ 왜 만들었는가
 *
 * 15단계 회귀 검증 중에 이런 일이 있었습니다.
 *
 *   요청 한도(60회/시간)를 다 써서 GitHub 이 403 을 돌려줬는데,
 *   목록을 받아오는 코드가 그것을 **빈 목록**으로 바꿔 돌려줬습니다.
 *   그래서 "공식 문서 0개" 가 되었고, 화면에는 `✓ 완료` 라고 찍혔습니다.
 *
 * 받지 못한 것과 없는 것은 다릅니다. 그 둘을 구분하지 못하면
 * **실패가 성공처럼 보입니다.** 이 파일은 그것을 막으려고 있습니다.
 *
 * ■ 어떻게 알아채는가
 *
 * 문구 하나에 기대지 않습니다. GitHub 은 한도를 넘겼을 때 여러 신호를 함께 줍니다.
 *
 *   x-ratelimit-remaining: 0     ← 가장 분명한 신호
 *   x-ratelimit-reset: <초>       ← 언제 다시 쓸 수 있는지
 *   retry-after: <초>             ← 2차 한도(secondary limit)일 때
 *   403 또는 429                  ← 상태 코드
 *   본문의 "rate limit" 문구       ← 마지막 보루
 *
 * 앞의 것부터 봅니다. 문구는 GitHub 이 언제든 바꿀 수 있으므로 맨 뒤에 둡니다.
 *
 * ■ 토큰은 있어도 되고 없어도 됩니다
 *
 * `GITHUB_TOKEN` 이 있으면 붙이고, 없으면 그냥 보냅니다.
 * **없다고 프로그램을 멈추지 않습니다.** 토큰은 한도를 늘려 줄 뿐입니다.
 * 값은 어디에도 적지 않습니다 — 로그에도, 저장 파일에도.
 */

import { looksLikeTimeout } from "./failure.ts";

/** 요청 하나의 결과 */
export type FetchOutcome =
  | { kind: "ok"; response: Response }
  /** 요청 한도를 넘겼습니다. 기다렸다 다시 하면 됩니다 */
  | { kind: "rate-limited"; resetAt?: string; retryAfterSeconds?: number; reason: string }
  /** 그 자리에 없습니다 (404). 실패가 아니라 "없음" 입니다 */
  | { kind: "not-found" }
  /** 그밖의 HTTP 오류 */
  | { kind: "http-error"; status: number; reason: string; retryAfterSeconds?: number }
  /**
   * 정해진 시간 안에 응답이 오지 않았습니다.
   *
   * 17단계에서 네트워크 오류와 따로 뗐습니다. 둘 다 다시 해 볼 만하지만
   * **왜 못 받았는지**를 사람이 알아야 하기 때문입니다 —
   * 느린 것과 아예 닿지 못한 것은 다른 이야기입니다.
   */
  | { kind: "timeout"; reason: string }
  /** 아예 닿지 못했습니다 (DNS·연결 끊김) */
  | { kind: "network-error"; reason: string };

/** 예전 이름. 쓰던 곳이 있으므로 남겨 둡니다. */
export type GithubOutcome = FetchOutcome;

/**
 * 토큰이 설정되어 있는지.
 *
 * **값은 돌려주지 않습니다.** 있는지 없는지만 알려 줍니다.
 * 이 함수의 결과는 화면에 찍혀도 안전합니다.
 */
export function hasGithubToken(): boolean {
  return Boolean(readToken());
}

/** 토큰을 읽습니다. 이 값은 이 파일 밖으로 나가지 않습니다. */
function readToken(): string | undefined {
  // GITHUB_TOKEN 이 흔하고, gh CLI 는 GH_TOKEN 을 씁니다. 둘 다 받아 줍니다.
  const raw = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * 이 주소가 GitHub 인가.
 *
 * **토큰을 붙일지 정하는 기준입니다.** 이 판단이 틀리면 남의 서버에 내 토큰을 보냅니다.
 * 그래서 "github 이라는 글자가 들어 있나" 로 보지 않고 **호스트 이름을 정확히** 봅니다.
 * (`https://evil.test/?x=github.com` 같은 주소에 속지 않기 위해서입니다)
 */
export function isGithubHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  return (
    host === "github.com" ||
    host === "api.github.com" ||
    host === "raw.githubusercontent.com" ||
    host.endsWith(".github.com") ||
    host.endsWith(".githubusercontent.com")
  );
}

/**
 * 요청에 붙일 머리말을 만듭니다.
 *
 * 토큰이 없으면 인증 머리말 없이 그대로 보냅니다. 지금까지와 똑같이 동작합니다.
 *
 * ■ 토큰은 GitHub 에만 붙입니다 (17단계)
 *
 * 17단계에서 `react.dev`·`nextjs.org` 의 목록도 이 길로 지나가게 되었습니다.
 * 그때 토큰을 그대로 붙이면 **남의 서버에 내 GitHub 토큰을 보내는 셈**입니다.
 * 그래서 주소를 보고 GitHub 일 때만 붙입니다.
 */
export function githubHeaders(
  extra: Record<string, string> = {},
  url?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    // 이름을 밝히지 않는 요청을 거절하는 곳이 있습니다.
    "User-Agent": "class-material-manager",
    ...extra,
  };

  // 주소를 주지 않으면 예전처럼 붙입니다 (GitHub 전용으로 쓰던 자리들).
  if (url !== undefined && !isGithubHost(url)) return headers;

  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

/** 초 단위 시각을 사람이 읽을 수 있게 */
function toIso(epochSeconds: number): string | undefined {
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return undefined;
  return new Date(epochSeconds * 1000).toISOString();
}

/**
 * 응답을 보고 요청 한도를 넘긴 것인지 판단합니다.
 *
 * 응답 본문을 읽어야 할 수도 있으므로, **부르는 쪽이 본문을 아직 읽지 않았을 때만** 부릅니다.
 */
export async function detectRateLimit(
  response: Response,
  options: { url?: string } = {},
): Promise<
  { limited: true; resetAt?: string; retryAfterSeconds?: number; reason: string } | { limited: false }
> {
  // 200 대 응답은 한도와 상관없습니다.
  if (response.ok) return { limited: false };

  // 한도와 관련된 상태 코드가 아니면 볼 것도 없습니다.
  if (response.status !== 403 && response.status !== 429) return { limited: false };

  const remaining = response.headers.get("x-ratelimit-remaining");
  const resetHeader = response.headers.get("x-ratelimit-reset");
  const retryAfter = response.headers.get("retry-after");

  const resetAt = resetHeader ? toIso(Number(resetHeader)) : undefined;
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : undefined;

  // ── 1순위: 남은 요청 수가 0 ──
  // 기계가 읽으라고 만든 칸이라 가장 믿을 만합니다.
  if (remaining === "0") {
    return {
      limited: true,
      resetAt,
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      reason: "요청 한도를 모두 썼습니다 (x-ratelimit-remaining: 0)",
    };
  }

  // ── 여기서부터는 GitHub 일 때만 봅니다 ── (17단계)
  //
  // `retry-after` 와 "rate limit" 문구는 어느 서버나 쓸 수 있는 말입니다.
  // 그것만 보고 **"GitHub 요청 한도"** 라고 부르면, `react.dev` 가 429 를 줬을 때
  // 있지도 않은 GitHub 한도를 이야기하게 됩니다.
  // 근거가 없으면 그냥 HTTP 오류로 두는 편이 정직합니다.
  const isGithub = options.url === undefined || isGithubHost(options.url);
  if (!isGithub) return { limited: false };

  // ── 2순위: retry-after 가 붙은 429/403 ──
  // 짧은 시간에 너무 많이 보냈을 때(secondary limit) 이렇게 옵니다.
  if (Number.isFinite(retryAfterSeconds) && (retryAfterSeconds ?? 0) > 0) {
    return {
      limited: true,
      resetAt,
      retryAfterSeconds,
      reason: `잠시 요청이 막혔습니다 (retry-after: ${retryAfterSeconds}초)`,
    };
  }

  // ── 3순위: 본문 문구 ──
  // 여기까지 왔다는 것은 위의 칸들이 없었다는 뜻입니다. 마지막으로 문구를 봅니다.
  // 문구는 GitHub 이 언제든 바꿀 수 있으므로 이것 하나에만 기대지 않습니다.
  try {
    const text = await response.clone().text();
    if (/rate limit|abuse detection|secondary rate/i.test(text)) {
      return { limited: true, resetAt, reason: "GitHub 이 요청 한도를 넘겼다고 알렸습니다" };
    }
  } catch {
    // 본문을 읽지 못해도 넘어갑니다. 없는 근거를 만들지 않습니다.
  }

  return { limited: false };
}

/**
 * GitHub 에 요청을 보내고, **무슨 일이 있었는지 구분해서** 돌려줍니다.
 *
 * 여기서는 절대 빈 결과로 뭉개지 않습니다. 못 받았으면 못 받았다고 말합니다.
 */
export async function fetchGithub(
  url: string,
  options: { accept?: string; timeoutMs?: number } = {},
): Promise<FetchOutcome> {
  const { accept, timeoutMs = 30_000 } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: githubHeaders(accept ? { Accept: accept } : {}, url),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // 느린 것과 닿지 못한 것을 나눕니다. 둘 다 다시 해 볼 만하지만 뜻이 다릅니다.
    if (looksLikeTimeout(error)) return { kind: "timeout", reason };
    return { kind: "network-error", reason };
  }

  if (response.ok) return { kind: "ok", response };

  const limit = await detectRateLimit(response, { url });
  if (limit.limited) {
    return {
      kind: "rate-limited",
      resetAt: limit.resetAt,
      retryAfterSeconds: limit.retryAfterSeconds,
      reason: limit.reason,
    };
  }

  // 404 는 실패가 아니라 "그 자리에 없다" 입니다.
  // 14단계 문서 찾기는 있을 법한 자리를 여러 군데 짚어 보므로 404 가 정상입니다.
  if (response.status === 404) return { kind: "not-found" };

  const retryAfter = Number(response.headers.get("retry-after"));

  return {
    kind: "http-error",
    status: response.status,
    reason: `HTTP ${response.status}`,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  };
}

/** 이 이름으로도 부를 수 있게 둡니다 — GitHub 이 아닌 곳에도 씁니다. */
export const fetchWithOutcome = fetchGithub;

/**
 * 한도 초과를 사람이 읽을 한 줄로.
 *
 * 언제 다시 할 수 있는지 알 수 있으면 함께 적습니다. 모르면 적지 않습니다.
 */
export function describeRateLimit(outcome: {
  resetAt?: string;
  retryAfterSeconds?: number;
}): string {
  const base = "GitHub API 요청 한도를 넘겨 새로 가져오지 못했습니다";

  if (outcome.resetAt) {
    const minutes = Math.max(0, Math.ceil((Date.parse(outcome.resetAt) - Date.now()) / 60_000));
    const clock = outcome.resetAt.slice(11, 16);
    return `${base}. 약 ${minutes}분 뒤(${clock} UTC)에 다시 실행할 수 있습니다`;
  }

  if (outcome.retryAfterSeconds) {
    return `${base}. ${outcome.retryAfterSeconds}초 뒤에 다시 실행할 수 있습니다`;
  }

  return `${base}. 잠시 뒤에 다시 실행해 보세요`;
}
