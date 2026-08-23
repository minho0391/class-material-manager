/**
 * 16단계 — **실패가 성공처럼 보이지 않는지** 봅니다.
 *
 * ■ 이 시험이 지키려는 것
 *
 *   받지 못한 것과 없는 것은 다릅니다.
 *
 * 15단계 회귀 검증에서 GitHub 요청 한도(60회/시간)를 다 쓴 실행이
 * "공식 문서 0개 · ✓ 완료" 로 보였습니다. 자료를 잃지는 않았지만,
 * 사용자는 최신인 줄 알았을 것입니다. 그 일을 여기 고정해 둡니다.
 *
 * ■ 실제 GitHub 을 부르지 않습니다
 *
 * 시험이 요청 한도를 쓰면 그 자체가 문제를 만듭니다.
 * 그래서 `fetch` 를 시험 안에서 갈아 끼웁니다. 바깥으로 나가는 요청은 하나도 없습니다.
 */
import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  COLLECT_STATUS,
  overallStatus,
  summarizeAttempts,
  type SourceAttempt,
} from "../src/enrich/collect-status.ts";
import {
  describeRateLimit,
  detectRateLimit,
  fetchGithub,
  githubHeaders,
  hasGithubToken,
} from "../src/net/github.ts";

// ── 시험용 도구 ──

const realFetch = globalThis.fetch;
const realToken = process.env.GITHUB_TOKEN;
const realGhToken = process.env.GH_TOKEN;

/** `fetch` 를 갈아 끼웁니다. 바깥으로 나가지 않습니다. */
function stubFetch(handler: (url: string, init?: RequestInit) => Response): void {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))) as typeof fetch;
}

/** GitHub 이 요청 한도를 넘겼을 때 실제로 돌려주는 모양 */
function rateLimitResponse(resetEpoch: number): Response {
  return new Response(
    JSON.stringify({ message: "API rate limit exceeded for 203.0.113.7." }),
    {
      status: 403,
      headers: {
        "x-ratelimit-limit": "60",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(resetEpoch),
      },
    },
  );
}

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
  if (realGhToken === undefined) delete process.env.GH_TOKEN;
  else process.env.GH_TOKEN = realGhToken;
});

describe("요청 한도 알아채기", () => {
  it("x-ratelimit-remaining: 0 을 알아봅니다", async () => {
    const reset = Math.floor(Date.now() / 1000) + 1800;
    const found = await detectRateLimit(rateLimitResponse(reset));

    assert.equal(found.limited, true);
    assert.ok(found.limited && found.resetAt, "언제 다시 할 수 있는지 알려 줘야 합니다");
  });

  it("retry-after 가 붙은 429 도 알아봅니다 (2차 한도)", async () => {
    const response = new Response("slow down", {
      status: 429,
      headers: { "retry-after": "120" },
    });
    const found = await detectRateLimit(response);

    assert.equal(found.limited, true);
    assert.equal(found.limited && found.retryAfterSeconds, 120);
  });

  it("머리말이 없어도 본문 문구로 알아냅니다 (마지막 보루)", async () => {
    const response = new Response(
      JSON.stringify({ message: "You have exceeded a secondary rate limit." }),
      { status: 403 },
    );
    assert.equal((await detectRateLimit(response)).limited, true);
  });

  it("문구 하나에만 기대지 않습니다 — 머리말만으로도 알아냅니다", async () => {
    // 본문이 비어 있어도 머리말이 말해 주면 그것으로 충분합니다.
    const response = new Response("", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0" },
    });
    assert.equal((await detectRateLimit(response)).limited, true);
  });

  it("404 는 한도 초과가 아닙니다", async () => {
    assert.equal((await detectRateLimit(new Response("", { status: 404 }))).limited, false);
  });

  it("500 도 한도 초과가 아닙니다", async () => {
    assert.equal((await detectRateLimit(new Response("boom", { status: 500 }))).limited, false);
  });

  it("정상 응답은 당연히 아닙니다", async () => {
    assert.equal((await detectRateLimit(new Response("[]", { status: 200 }))).limited, false);
  });
});

describe("다시 시도할 시점을 알려 줍니다", () => {
  it("reset 시각이 있으면 몇 분 뒤인지 적습니다", () => {
    const resetAt = new Date(Date.now() + 25 * 60_000).toISOString();
    const message = describeRateLimit({ resetAt });

    assert.ok(message.includes("분 뒤"), message);
    assert.ok(message.includes("다시 실행"), message);
  });

  it("retry-after 만 있으면 초로 적습니다", () => {
    assert.ok(describeRateLimit({ retryAfterSeconds: 90 }).includes("90초 뒤"));
  });

  it("아무것도 모르면 지어내지 않습니다", () => {
    const message = describeRateLimit({});
    assert.ok(!/\d+분/.test(message), `없는 시각을 만들면 안 됩니다 — ${message}`);
    assert.ok(message.includes("잠시 뒤"));
  });
});

describe("fetchGithub — 무슨 일이 있었는지 구분합니다", () => {
  it("한도 초과를 빈 결과로 뭉개지 않습니다", async () => {
    stubFetch(() => rateLimitResponse(Math.floor(Date.now() / 1000) + 600));

    const outcome = await fetchGithub("https://api.github.com/repos/x/y/contents/z");

    assert.equal(outcome.kind, "rate-limited");
    assert.notEqual(outcome.kind, "ok", "성공으로 보이면 안 됩니다");
  });

  it("404 는 '없음' 이지 실패가 아닙니다", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    assert.equal((await fetchGithub("https://example.test/x")).kind, "not-found");
  });

  it("네트워크가 끊기면 그렇다고 말합니다", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("ENOTFOUND"))) as typeof fetch;

    const outcome = await fetchGithub("https://example.test/x");
    assert.equal(outcome.kind, "network-error");
    assert.ok(outcome.kind === "network-error" && outcome.reason.includes("ENOTFOUND"));
  });

  it("정상이면 응답을 그대로 넘깁니다", async () => {
    stubFetch(() => new Response("[]", { status: 200 }));
    assert.equal((await fetchGithub("https://example.test/x")).kind, "ok");
  });
});

describe("GITHUB_TOKEN 은 있어도 되고 없어도 됩니다", () => {
  it("없으면 인증 머리말을 붙이지 않습니다", () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;

    const headers = githubHeaders();
    assert.equal(headers.Authorization, undefined);
    assert.equal(hasGithubToken(), false);
    // 토큰이 없어도 요청은 그대로 나갑니다 — 지금까지와 똑같이 동작해야 합니다.
    assert.ok(headers["User-Agent"]);
  });

  it("빈 문자열은 없는 것으로 봅니다", () => {
    process.env.GITHUB_TOKEN = "   ";
    assert.equal(hasGithubToken(), false);
    assert.equal(githubHeaders().Authorization, undefined);
  });

  it("있으면 인증 머리말을 붙입니다", () => {
    process.env.GITHUB_TOKEN = "ghp_example_not_a_real_token";

    const headers = githubHeaders();
    assert.equal(headers.Authorization, "Bearer ghp_example_not_a_real_token");
    assert.equal(hasGithubToken(), true);
  });

  it("GH_TOKEN 도 받아 줍니다", () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = "gh_example_not_a_real_token";
    assert.equal(hasGithubToken(), true);
  });

  it("토큰 값은 hasGithubToken 밖으로 새어 나가지 않습니다", () => {
    process.env.GITHUB_TOKEN = "ghp_secret_value_here";

    // 이 함수는 true/false 만 돌려줍니다. 화면에 찍어도 안전해야 합니다.
    assert.equal(typeof hasGithubToken(), "boolean");
    assert.equal(String(hasGithubToken()).includes("secret"), false);
  });

  it("실제 요청에 토큰이 붙고, 결과 어디에도 값이 남지 않습니다", async () => {
    process.env.GITHUB_TOKEN = "ghp_secret_value_here";

    let sawAuth = "";
    stubFetch((_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sawAuth = headers.Authorization ?? "";
      return new Response("[]", { status: 200 });
    });

    // 17단계부터 토큰은 **GitHub 주소에만** 붙습니다.
    // (그전에는 어느 주소든 붙였는데, 그러면 react.dev 같은 남의 서버에도 갑니다)
    const outcome = await fetchGithub("https://api.github.com/repos/x/y/contents/z");

    assert.equal(sawAuth, "Bearer ghp_secret_value_here", "요청에는 붙어야 합니다");
    // 돌려주는 값에는 토큰이 없어야 합니다.
    assert.ok(!JSON.stringify({ kind: outcome.kind }).includes("ghp_secret"));
  });

  it("GitHub 이 아닌 주소에는 붙지 않습니다 (17단계)", async () => {
    process.env.GITHUB_TOKEN = "ghp_secret_value_here";

    let sawAuth: string | undefined = "sentinel";
    stubFetch((_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sawAuth = headers.Authorization;
      return new Response("ok", { status: 200 });
    });

    await fetchGithub("https://react.dev/llms.txt");

    assert.equal(sawAuth, undefined, "남의 서버에 내 GitHub 토큰을 보내면 안 됩니다");
  });
});

describe("수집 상태 — 네 가지를 구분합니다", () => {
  const ok = (count: number): SourceAttempt => ({ where: "a", ok: true, count });
  const limited = (): SourceAttempt => ({
    where: "b",
    ok: false,
    count: 0,
    rateLimited: true,
    resetAt: "2026-08-23T12:00:00.000Z",
    reason: "요청 한도",
  });
  const broken = (): SourceAttempt => ({ where: "c", ok: false, count: 0, reason: "ENOTFOUND" });

  it("1. 정상 수집 → SUCCESS", () => {
    const result = summarizeAttempts([ok(500), ok(120)], true);
    assert.equal(result.status, COLLECT_STATUS.SUCCESS);
    assert.equal(result.rateLimited, false);
  });

  it("정상 수집 결과가 0건이어도 실패로 몰지 않습니다", () => {
    // 문서가 실제로 0개인 출처가 있습니다. "0건이면 실패" 로 못 박으면 그것이 오탐이 됩니다.
    assert.equal(summarizeAttempts([ok(0)], false).status, COLLECT_STATUS.SUCCESS);
  });

  it("2. 기존 자료 있음 + 요청 한도 → STALE", () => {
    const result = summarizeAttempts([limited()], true);
    assert.equal(result.status, COLLECT_STATUS.STALE);
    assert.equal(result.rateLimited, true);
    assert.equal(result.resetAt, "2026-08-23T12:00:00.000Z", "다시 할 시점을 들고 나와야 합니다");
  });

  it("3. 기존 자료 있음 + 네트워크 오류 → STALE", () => {
    const result = summarizeAttempts([broken()], true);
    assert.equal(result.status, COLLECT_STATUS.STALE);
    assert.equal(result.rateLimited, false);
  });

  it("4. 기존 자료 없음 + 수집 실패 → FAILED", () => {
    assert.equal(summarizeAttempts([limited()], false).status, COLLECT_STATUS.FAILED);
    assert.equal(summarizeAttempts([broken()], false).status, COLLECT_STATUS.FAILED);
  });

  it("5. 출처 일부만 실패 → PARTIAL", () => {
    const result = summarizeAttempts([ok(300), limited()], true);
    assert.equal(result.status, COLLECT_STATUS.PARTIAL);
    assert.equal(result.rateLimited, true, "왜 일부만 됐는지 알려 줘야 합니다");
  });

  it("아무것도 시도하지 않았으면 자료 유무로 가릅니다", () => {
    assert.equal(summarizeAttempts([], true).status, COLLECT_STATUS.STALE);
    assert.equal(summarizeAttempts([], false).status, COLLECT_STATUS.FAILED);
  });
});

describe("과목별 상태를 전체 하나로", () => {
  it("전부 성공해야 SUCCESS 입니다", () => {
    assert.equal(overallStatus(["SUCCESS", "SUCCESS"]), COLLECT_STATUS.SUCCESS);
  });

  it("하나라도 못 받았으면 SUCCESS 라고 하지 않습니다", () => {
    // 여기가 15단계에서 놓친 자리입니다. 섞여 있으면 섞여 있다고 말해야 합니다.
    assert.equal(overallStatus(["SUCCESS", "STALE"]), COLLECT_STATUS.PARTIAL);
    assert.equal(overallStatus(["SUCCESS", "FAILED"]), COLLECT_STATUS.PARTIAL);
  });

  it("성공이 하나도 없고 자료는 있으면 STALE", () => {
    assert.equal(overallStatus(["STALE", "STALE"]), COLLECT_STATUS.STALE);
  });

  it("성공도 자료도 없으면 FAILED", () => {
    assert.equal(overallStatus(["FAILED", "FAILED"]), COLLECT_STATUS.FAILED);
  });

  it("아무 과목도 없으면 FAILED", () => {
    assert.equal(overallStatus([]), COLLECT_STATUS.FAILED);
  });
});
