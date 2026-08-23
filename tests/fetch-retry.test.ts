/**
 * 17단계 — **흔들려도 스스로 회복하는지**, 그리고 **회복 못 했을 때 숨기지 않는지** 봅니다.
 *
 * ■ 여기서 지키려는 것 둘
 *
 *   1. 다시 해 볼 만한 실패는 다시 해 본다. 그러나 끝없이 하지 않는다.
 *   2. 끝내 못 받았으면 그 사실을 그대로 말한다.
 *
 * ■ 실제 GitHub 을 부르지 않습니다. 실제로 기다리지도 않습니다
 *
 * `fetch` 와 `sleep` 을 시험 안에서 갈아 끼웁니다.
 * 요청 한도를 소모하지도, 몇 분씩 멈춰 있지도 않습니다 —
 * 대신 **얼마나 기다리려 했는지**를 기록해 두고 그 값을 확인합니다.
 */
import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  BACKOFF_MS,
  MAX_ATTEMPTS,
  MAX_RECORDED_FAILURES,
  collectDocuments,
  fetchWithRetry,
  humanizeMs,
  waitUntilReset,
} from "../src/net/fetch-retry.ts";
import { FAILURE_TYPE, classifyOutcome, isRetryable } from "../src/net/failure.ts";
import { detectRateLimit, githubHeaders, isGithubHost } from "../src/net/github.ts";
import { COLLECT_STATUS, combineWithContent } from "../src/enrich/collect-status.ts";

// ── 시험용 도구 ──

const realFetch = globalThis.fetch;
const realToken = process.env.GITHUB_TOKEN;
const realGhToken = process.env.GH_TOKEN;

const NOW = Date.parse("2026-08-23T12:00:00.000Z");

/** 기다린 척만 하고 실제로는 멈추지 않습니다. 얼마나 기다리려 했는지 남깁니다. */
function fakeClock(): {
  slept: number[];
  notes: string[];
  deps: { sleep: (ms: number) => Promise<void>; now: () => number; notify: (m: string) => void };
} {
  const slept: number[] = [];
  const notes: string[] = [];
  return {
    slept,
    notes,
    deps: {
      sleep: async (ms: number) => {
        slept.push(ms);
      },
      now: () => NOW,
      notify: (message: string) => {
        notes.push(message);
      },
    },
  };
}

/** 정해 둔 응답을 차례로 돌려주는 가짜 서버. 요청받은 주소를 모두 기록합니다. */
function scriptedFetch(script: Record<string, Array<Response | Error>>): { calls: string[] } {
  const calls: string[] = [];
  const cursor = new Map<string, number>();

  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    const queue = script[url] ?? script["*"] ?? [];
    const index = cursor.get(url) ?? 0;
    cursor.set(url, index + 1);

    // 대본이 짧으면 마지막 것을 되풀이합니다.
    const item = queue[Math.min(index, queue.length - 1)];

    if (item instanceof Error) return Promise.reject(item);
    if (item) return Promise.resolve(item.clone());
    return Promise.resolve(new Response("", { status: 500 }));
  }) as typeof fetch;

  return { calls };
}

const ok = (body = "# 문서"): Response => new Response(body, { status: 200 });

const rateLimited = (resetEpochMs: number): Response =>
  new Response(JSON.stringify({ message: "API rate limit exceeded." }), {
    status: 403,
    headers: {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.floor(resetEpochMs / 1000)),
    },
  });

const timeoutError = (): Error => {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
};

const GH = "https://raw.githubusercontent.com/mdn/content/main/a/index.md";
const GH2 = "https://raw.githubusercontent.com/mdn/content/main/b/index.md";

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
  if (realGhToken === undefined) delete process.env.GH_TOKEN;
  else process.env.GH_TOKEN = realGhToken;
});

describe("다시 해 볼 만한 실패인가 가리기", () => {
  it("404 는 다시 하지 않습니다 — 백 번 물어도 없습니다", () => {
    assert.equal(isRetryable(FAILURE_TYPE.NOT_FOUND, 404), false);
  });

  it("읽지 못한 것은 다시 해도 같습니다", () => {
    assert.equal(isRetryable(FAILURE_TYPE.PARSE_ERROR), false);
  });

  it("timeout·network 는 다시 해 봅니다", () => {
    assert.equal(isRetryable(FAILURE_TYPE.TIMEOUT), true);
    assert.equal(isRetryable(FAILURE_TYPE.NETWORK), true);
  });

  it("5xx 와 429 만 다시 해 봅니다 — 400·401·403 은 아닙니다", () => {
    assert.equal(isRetryable(FAILURE_TYPE.HTTP_ERROR, 500), true);
    assert.equal(isRetryable(FAILURE_TYPE.HTTP_ERROR, 503), true);
    assert.equal(isRetryable(FAILURE_TYPE.HTTP_ERROR, 429), true);
    assert.equal(isRetryable(FAILURE_TYPE.HTTP_ERROR, 400), false);
    assert.equal(isRetryable(FAILURE_TYPE.HTTP_ERROR, 401), false);
  });
});

describe("일시적인 실패는 다시 해 봅니다", () => {
  it("timeout 뒤에 성공하면 성공입니다", async () => {
    const { calls } = scriptedFetch({ [GH]: [timeoutError(), ok()] });
    const clock = fakeClock();

    const result = await fetchWithRetry(GH, {}, clock.deps);

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
    assert.equal(calls.length, 2);
    assert.deepEqual(clock.slept, [BACKOFF_MS[0]], "쉬었다 다시 해야 합니다");
  });

  it("HTTP 500 도 다시 해 봅니다", async () => {
    const { calls } = scriptedFetch({ [GH]: [new Response("boom", { status: 500 }), ok()] });
    const result = await fetchWithRetry(GH, {}, fakeClock().deps);

    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
  });

  it("네트워크 오류도 다시 해 봅니다", async () => {
    const { calls } = scriptedFetch({ [GH]: [new Error("ENOTFOUND"), ok()] });
    const result = await fetchWithRetry(GH, {}, fakeClock().deps);

    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
  });

  it("404 는 한 번만 물어봅니다", async () => {
    const { calls } = scriptedFetch({ [GH]: [new Response("", { status: 404 })] });
    const result = await fetchWithRetry(GH, {}, fakeClock().deps);

    assert.equal(result.ok, false);
    assert.equal(calls.length, 1, "없는 것을 세 번 물어보지 않습니다");
    assert.equal(result.ok === false && result.failure.type, FAILURE_TYPE.NOT_FOUND);
  });

  it("끝까지 안 되면 정해진 횟수에서 멈춥니다", async () => {
    const { calls } = scriptedFetch({ [GH]: [timeoutError()] });
    const clock = fakeClock();

    const result = await fetchWithRetry(GH, {}, clock.deps);

    assert.equal(result.ok, false);
    assert.equal(result.attempts, MAX_ATTEMPTS);
    assert.equal(calls.length, MAX_ATTEMPTS, `${MAX_ATTEMPTS}번을 넘기지 않습니다`);
    assert.equal(clock.slept.length, MAX_ATTEMPTS - 1);
  });

  it("쉬는 시간이 점점 길어집니다 (backoff)", async () => {
    scriptedFetch({ [GH]: [timeoutError()] });
    const clock = fakeClock();

    await fetchWithRetry(GH, {}, clock.deps);

    assert.deepEqual(clock.slept, [BACKOFF_MS[0], BACKOFF_MS[1]]);
    assert.ok((BACKOFF_MS[1] ?? 0) > (BACKOFF_MS[0] ?? 0), "두 번째가 더 길어야 합니다");
  });
});

describe("요청 한도 — 짧으면 기다리고 길면 물러납니다", () => {
  it("곧 풀리면 기다렸다 이어갑니다", async () => {
    const resetIn = 2 * 60_000 + 18_000; // 2분 18초
    const { calls } = scriptedFetch({ [GH]: [rateLimited(NOW + resetIn), ok()] });
    const clock = fakeClock();

    const result = await fetchWithRetry(GH, {}, { ...clock.deps, maxWaitMs: 5 * 60_000 });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(clock.slept.length, 1);
    assert.ok((clock.slept[0] ?? 0) >= resetIn, "풀릴 때까지는 기다려야 합니다");

    // 사용자가 멈춘 줄 알면 안 됩니다. 왜 기다리는지 말해 줘야 합니다.
    assert.ok(clock.notes.some((note) => note.includes("2분 18초")), clock.notes.join(" | "));
    assert.ok(clock.notes.some((note) => note.includes("기존 자료는 그대로")));
    assert.ok(clock.notes.some((note) => note.includes("이어갑니다")));
  });

  it("너무 오래 남았으면 기다리지 않습니다", async () => {
    const { calls } = scriptedFetch({ [GH]: [rateLimited(NOW + 45 * 60_000)] });
    const clock = fakeClock();

    const result = await fetchWithRetry(GH, {}, { ...clock.deps, maxWaitMs: 5 * 60_000 });

    assert.equal(result.ok, false);
    assert.equal(calls.length, 1, "다시 두드려 봐야 같은 답만 옵니다");
    assert.deepEqual(clock.slept, [], "사용자를 45분씩 붙잡아 두지 않습니다");
    assert.ok(clock.notes.some((note) => note.includes("상한")), clock.notes.join(" | "));
    assert.equal(result.ok === false && result.failure.type, FAILURE_TYPE.RATE_LIMIT);
  });

  it("언제 풀리는지 모르면 기다리지 않습니다", async () => {
    // reset 머리말이 없습니다. 얼마나 걸릴지 말해 줄 수 없으니 기다리지 않습니다.
    const noReset = new Response(JSON.stringify({ message: "API rate limit exceeded." }), {
      status: 403,
      headers: { "x-ratelimit-remaining": "0" },
    });
    scriptedFetch({ [GH]: [noReset] });
    const clock = fakeClock();

    const result = await fetchWithRetry(GH, {}, clock.deps);

    assert.equal(result.ok, false);
    assert.deepEqual(clock.slept, []);
  });

  it("남은 시간을 사람 말로 적습니다", () => {
    assert.equal(humanizeMs(138_000), "2분 18초");
    assert.equal(humanizeMs(45_000), "45초");
    assert.equal(humanizeMs(120_000), "2분");
  });

  it("풀리는 시각을 모르면 null 입니다 — 지어내지 않습니다", () => {
    assert.equal(waitUntilReset({ type: FAILURE_TYPE.RATE_LIMIT, reason: "x" }, NOW), null);
    assert.equal(
      waitUntilReset(
        { type: FAILURE_TYPE.RATE_LIMIT, reason: "x", resetAt: "2026-08-23T12:05:00.000Z" },
        NOW,
      ),
      5 * 60_000,
    );
  });
});

describe("여러 문서를 받을 때", () => {
  it("이미 받은 문서를 다시 받지 않습니다", async () => {
    // 두 번째 문서에서 한도에 걸렸다 풀립니다.
    const { calls } = scriptedFetch({
      [GH]: [ok("첫째")],
      [GH2]: [rateLimited(NOW + 60_000), ok("둘째")],
    });
    const clock = fakeClock();

    const got: string[] = [];
    const result = await collectDocuments(
      [
        { id: "a", url: GH },
        { id: "b", url: GH2 },
      ],
      async (document, response) => {
        got.push(`${document.id}:${await response.text()}`);
      },
      {},
      { ...clock.deps, maxWaitMs: 5 * 60_000 },
    );

    assert.equal(result.succeeded, 2);
    assert.deepEqual(got, ["a:첫째", "b:둘째"]);

    // 첫 번째 문서는 **딱 한 번만** 요청해야 합니다. 처음부터 되돌리지 않으니까요.
    assert.equal(calls.filter((url) => url === GH).length, 1, "이미 받은 것을 또 받지 않습니다");
    assert.equal(calls.filter((url) => url === GH2).length, 2);
  });

  it("기다릴 수 없는 한도를 만나면 남은 것은 손대지 않습니다", async () => {
    const { calls } = scriptedFetch({
      [GH]: [ok()],
      "*": [rateLimited(NOW + 60 * 60_000)],
    });
    const clock = fakeClock();

    const result = await collectDocuments(
      [
        { id: "a", url: GH },
        { id: "b", url: GH2 },
        { id: "c", url: "https://raw.githubusercontent.com/x/y/main/c.md" },
      ],
      async () => {},
      {},
      { ...clock.deps, maxWaitMs: 5 * 60_000 },
    );

    assert.equal(result.succeeded, 1);
    assert.equal(result.attempted, 2, "한도를 만난 뒤로는 요청하지 않습니다");
    assert.equal(result.skipped, 1, "해 보지도 못한 것은 따로 셉니다");
    assert.equal(result.rateLimited, true);
    assert.ok(result.rateLimitResetAt, "언제 다시 할 수 있는지 들고 나와야 합니다");
    assert.equal(calls.filter((url) => url.endsWith("c.md")).length, 0);
  });

  it("실패한 문서를 적어 둡니다", async () => {
    scriptedFetch({
      [GH]: [new Response("", { status: 404 })],
      [GH2]: [timeoutError()],
    });

    const result = await collectDocuments(
      [
        { id: "없는 문서", url: GH },
        { id: "느린 문서", url: GH2 },
      ],
      async () => {},
      {},
      fakeClock().deps,
    );

    assert.equal(result.failures.length, 2);

    const missing = result.failures.find((failure) => failure.id === "없는 문서");
    assert.equal(missing?.type, FAILURE_TYPE.NOT_FOUND);
    assert.equal(missing?.statusCode, 404);
    assert.equal(missing?.attempts, 1);

    const slow = result.failures.find((failure) => failure.id === "느린 문서");
    assert.equal(slow?.type, FAILURE_TYPE.TIMEOUT);
    assert.equal(slow?.attempts, MAX_ATTEMPTS);

    // 응답 본문을 통째로 담지 않습니다.
    for (const failure of result.failures) {
      assert.ok(failure.reason.length < 200, `설명이 너무 깁니다: ${failure.reason}`);
    }
  });

  it("실패 기록이 끝없이 쌓이지 않습니다", async () => {
    scriptedFetch({ "*": [new Response("", { status: 404 })] });

    const many = Array.from({ length: MAX_RECORDED_FAILURES + 10 }, (_, index) => ({
      id: `문서${index}`,
      url: `https://raw.githubusercontent.com/x/y/main/${index}.md`,
    }));

    const result = await collectDocuments(many, async () => {}, {}, fakeClock().deps);

    assert.equal(result.attempted, many.length);
    assert.ok(result.failures.length <= MAX_RECORDED_FAILURES + 1);
  });

  it("받아 놓고 읽지 못한 것은 PARSE_ERROR 입니다", async () => {
    scriptedFetch({ [GH]: [ok()] });

    const result = await collectDocuments(
      [{ id: "깨진 문서", url: GH }],
      async () => {
        throw new Error("읽을 수 없는 모양입니다");
      },
      {},
      fakeClock().deps,
    );

    assert.equal(result.succeeded, 0);
    assert.equal(result.failures[0]?.type, FAILURE_TYPE.PARSE_ERROR);
  });
});

describe("llms.txt 출처 — 없는 근거를 만들지 않습니다", () => {
  const LLMS = "https://react.dev/llms.txt";

  it("GitHub 이 아닌 429 를 GitHub 요청 한도라고 부르지 않습니다", async () => {
    const response = new Response("too many", {
      status: 429,
      headers: { "retry-after": "30" },
    });

    const found = await detectRateLimit(response, { url: LLMS });
    assert.equal(found.limited, false, "GitHub 머리말이 없으면 한도라고 단정하지 않습니다");
  });

  it("그래도 다시 해 볼 만한 실패로는 봅니다", async () => {
    const { calls } = scriptedFetch({
      [LLMS]: [new Response("too many", { status: 429 }), ok("# 목록")],
    });

    const result = await fetchWithRetry(LLMS, {}, fakeClock().deps);

    assert.equal(result.ok, true);
    assert.equal(calls.length, 2, "429 는 쉬었다 다시 해 봅니다");
  });

  it("HTTP 오류로 정직하게 적습니다", async () => {
    scriptedFetch({ [LLMS]: [new Response("nope", { status: 503 })] });

    const result = await fetchWithRetry(LLMS, {}, fakeClock().deps);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.failure.type, FAILURE_TYPE.HTTP_ERROR);
    assert.equal(result.ok === false && result.failure.statusCode, 503);
  });

  it("GitHub 문구가 든 429 라도 다른 서버 것이면 한도로 보지 않습니다", async () => {
    const response = new Response(JSON.stringify({ message: "API rate limit exceeded." }), {
      status: 429,
    });
    assert.equal((await detectRateLimit(response, { url: LLMS })).limited, false);
  });
});

describe("목록 수집도 같은 대접을 받습니다", () => {
  it("목록이 잠깐 흔들려도 다시 해 봅니다", async () => {
    // 목록을 못 받으면 그 과목의 원문은 **시도조차 못 합니다.**
    // 그래서 목록 쪽이 오히려 더 중요합니다.
    const { fetchIndex } = await import("../src/enrich/index-fetcher.ts");

    const api = "https://api.github.com/repos/mdn/content/contents/files/en-us/x";
    const { calls } = scriptedFetch({
      [api]: [new Response("boom", { status: 503 }), new Response(JSON.stringify([{ name: "grid", type: "dir" }]), { status: 200 })],
    });

    const result = await fetchIndex(
      {
        subject: "x",
        name: "시험용",
        homeUrl: "https://example.test",
        index: { type: "github-dir", repo: "mdn/content", branch: "main", path: "files/en-us/x" },
      },
      fakeClock().deps,
    );

    assert.equal(result.ok, true, "다시 해서 받아냈어야 합니다");
    assert.equal(result.entries.length, 1);
    assert.equal(calls.length, 2);
  });

  it("목록에서 요청 한도를 만나도 곧 풀리면 기다립니다", async () => {
    const { fetchIndex } = await import("../src/enrich/index-fetcher.ts");

    const api = "https://api.github.com/repos/mdn/content/contents/files/en-us/y";
    scriptedFetch({
      [api]: [rateLimited(NOW + 60_000), new Response(JSON.stringify([{ name: "flex", type: "dir" }]), { status: 200 })],
    });
    const clock = fakeClock();

    const result = await fetchIndex(
      {
        subject: "y",
        name: "시험용",
        homeUrl: "https://example.test",
        index: { type: "github-dir", repo: "mdn/content", branch: "main", path: "files/en-us/y" },
      },
      { ...clock.deps, maxWaitMs: 5 * 60_000 },
    );

    assert.equal(result.ok, true);
    assert.equal(clock.slept.length, 1, "한 번 기다렸다 이어가야 합니다");
    assert.ok(clock.notes.some((note) => note.includes("이어갑니다")));
  });

  it("오래 걸리는 한도면 목록도 포기하고, 못 받았다고 말합니다", async () => {
    const { fetchIndex } = await import("../src/enrich/index-fetcher.ts");

    const api = "https://api.github.com/repos/mdn/content/contents/files/en-us/z";
    scriptedFetch({ [api]: [rateLimited(NOW + 45 * 60_000)] });
    const clock = fakeClock();

    const result = await fetchIndex(
      {
        subject: "z",
        name: "시험용",
        homeUrl: "https://example.test",
        index: { type: "github-dir", repo: "mdn/content", branch: "main", path: "files/en-us/z" },
      },
      { ...clock.deps, maxWaitMs: 5 * 60_000 },
    );

    assert.equal(result.ok, false, "빈 목록을 성공이라고 하지 않습니다");
    assert.equal(result.attempts[0]?.rateLimited, true);
    assert.ok(result.attempts[0]?.resetAt, "언제 다시 할 수 있는지 들고 나와야 합니다");
    assert.deepEqual(clock.slept, []);
  });
});

describe("토큰은 GitHub 에만 붙습니다", () => {
  it("주소로 GitHub 인지 가립니다 — 글자만 보고 속지 않습니다", () => {
    assert.equal(isGithubHost("https://api.github.com/repos/x/y"), true);
    assert.equal(isGithubHost("https://raw.githubusercontent.com/x/y"), true);
    assert.equal(isGithubHost("https://react.dev/llms.txt"), false);
    assert.equal(isGithubHost("https://evil.test/?x=github.com"), false);
    assert.equal(isGithubHost("https://github.com.evil.test/x"), false);
  });

  it("남의 서버에는 토큰을 보내지 않습니다", () => {
    process.env.GITHUB_TOKEN = "ghp_example_not_a_real_token";

    assert.equal(githubHeaders({}, "https://react.dev/llms.txt").Authorization, undefined);
    assert.ok(githubHeaders({}, "https://raw.githubusercontent.com/a/b").Authorization);
  });

  it("실제 요청에서도 남의 서버에는 붙지 않습니다", async () => {
    process.env.GITHUB_TOKEN = "ghp_secret_value_here";

    const seen: Array<string | undefined> = [];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seen.push(headers.Authorization);
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as typeof fetch;

    await fetchWithRetry("https://react.dev/llms.txt", {}, fakeClock().deps);
    await fetchWithRetry(GH, {}, fakeClock().deps);

    assert.equal(seen[0], undefined, "react.dev 에 토큰을 보내면 안 됩니다");
    assert.ok(seen[1]?.includes("Bearer"), "GitHub 에는 붙어야 합니다");
  });

  it("실패 기록에 토큰이 남지 않습니다", async () => {
    process.env.GITHUB_TOKEN = "ghp_secret_value_here";
    scriptedFetch({ [GH]: [new Response("", { status: 404 })] });

    const result = await collectDocuments(
      [{ id: "x", url: GH }],
      async () => {},
      {},
      fakeClock().deps,
    );

    assert.equal(JSON.stringify(result).includes("ghp_secret"), false);
  });
});

describe("NOT_FOUND 와 요청 실패를 구분합니다", () => {
  it("종류가 서로 다릅니다", () => {
    assert.notEqual(FAILURE_TYPE.NOT_FOUND, FAILURE_TYPE.NETWORK);
    assert.notEqual(FAILURE_TYPE.NOT_FOUND, FAILURE_TYPE.RATE_LIMIT);
    assert.notEqual(FAILURE_TYPE.NOT_FOUND, FAILURE_TYPE.TIMEOUT);
  });

  it("결과에서도 갈라집니다", () => {
    assert.equal(classifyOutcome({ kind: "not-found" }).type, FAILURE_TYPE.NOT_FOUND);
    assert.equal(
      classifyOutcome({ kind: "network-error", reason: "ENOTFOUND" }).type,
      FAILURE_TYPE.NETWORK,
    );
    assert.equal(classifyOutcome({ kind: "timeout", reason: "timed out" }).type, FAILURE_TYPE.TIMEOUT);
    assert.equal(
      classifyOutcome({ kind: "rate-limited", reason: "한도" }).type,
      FAILURE_TYPE.RATE_LIMIT,
    );
  });

  it("404 만 다시 하지 않고 나머지는 다시 해 봅니다", () => {
    assert.equal(isRetryable(FAILURE_TYPE.NOT_FOUND), false);
    assert.equal(isRetryable(FAILURE_TYPE.NETWORK), true);
    assert.equal(isRetryable(FAILURE_TYPE.RATE_LIMIT), true);
  });
});

describe("원문 결과까지 넣어 상태를 냅니다", () => {
  const none = { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };

  it("1. 원문 전부 성공 → SUCCESS", () => {
    const status = combineWithContent(
      COLLECT_STATUS.SUCCESS,
      { attempted: 50, succeeded: 50, failed: 0, skipped: 0 },
      true,
    );
    assert.equal(status, COLLECT_STATUS.SUCCESS);
  });

  it("3. 원문 일부 실패 → PARTIAL (SUCCESS 라고 하지 않습니다)", () => {
    const status = combineWithContent(
      COLLECT_STATUS.SUCCESS,
      { attempted: 50, succeeded: 45, failed: 5, skipped: 0 },
      true,
    );
    assert.equal(status, COLLECT_STATUS.PARTIAL);
    assert.notEqual(status, COLLECT_STATUS.SUCCESS);
  });

  it("손도 못 댄 문서가 있어도 SUCCESS 가 아닙니다", () => {
    const status = combineWithContent(
      COLLECT_STATUS.SUCCESS,
      { attempted: 20, succeeded: 20, failed: 0, skipped: 30 },
      true,
    );
    assert.equal(status, COLLECT_STATUS.PARTIAL);
  });

  it("원문 전부 실패 + 예전 자료 있음 → STALE", () => {
    const status = combineWithContent(
      COLLECT_STATUS.SUCCESS,
      { attempted: 10, succeeded: 0, failed: 10, skipped: 0 },
      true,
    );
    assert.equal(status, COLLECT_STATUS.STALE);
  });

  it("4. 원문 전부 실패 + 예전 자료 없음 → FAILED", () => {
    const status = combineWithContent(
      COLLECT_STATUS.SUCCESS,
      { attempted: 10, succeeded: 0, failed: 10, skipped: 0 },
      false,
    );
    assert.equal(status, COLLECT_STATUS.FAILED);
  });

  it("목록부터 못 받았으면 목록 쪽 판단을 따릅니다", () => {
    assert.equal(combineWithContent(COLLECT_STATUS.STALE, none, true), COLLECT_STATUS.STALE);
    assert.equal(combineWithContent(COLLECT_STATUS.FAILED, none, false), COLLECT_STATUS.FAILED);
  });

  it("받아 올 것이 없었으면 상태를 나쁘게 만들지 않습니다", () => {
    // 수업자료가 없어 아무 문서도 고르지 않은 과목이 여기 옵니다.
    assert.equal(combineWithContent(COLLECT_STATUS.SUCCESS, none, false), COLLECT_STATUS.SUCCESS);
  });
});
