/**
 * 한 번 실패했다고 곧바로 포기하지 않는 자리.
 *
 * ■ 왜 필요한가
 *
 * 16단계까지는 문서 원문을 받다 실패하면 그대로 `failed++` 였습니다.
 * 그런데 실패에는 두 종류가 있습니다.
 *
 *   · 다시 해도 똑같은 것   404 · 잘못된 주소
 *   · 다시 하면 될 수도 있는 것  timeout · 서버 탈 · 요청 한도
 *
 * 뒤엣것까지 한 번에 포기하면, 잠깐 흔들린 것 때문에 사용자가
 * `refresh` 를 처음부터 다시 돌려야 합니다. 그럴 이유가 없습니다.
 *
 * ■ 그러나 끈질기게 굴지도 않습니다
 *
 * 무한 재시도는 하지 않습니다. **처음 1번 + 다시 2번, 모두 3번**이 끝입니다.
 * 그 사이에 조금씩 더 기다립니다(backoff) — 곧바로 다시 두드리면
 * 서버 쪽 사정이 나아질 틈을 주지 않기 때문입니다.
 *
 * ■ 요청 한도는 다르게 다룹니다
 *
 * 요청 한도는 "언제 풀리는지" 를 서버가 알려 줍니다.
 * 그게 **짧으면 기다렸다 이어서** 합니다. 길면 기다리지 않고 물러납니다 —
 * 사용자를 30분씩 붙잡아 두는 것은 실패를 숨기는 것만큼이나 나쁩니다.
 */
import { fetchWithOutcome, type FetchOutcome } from "./github.ts";
import { classifyOutcome, isRetryable, type FailureInfo } from "./failure.ts";

/** 처음 1번 + 다시 2번 = 모두 3번. 이 값을 넘겨 시도하는 일은 없습니다. */
export const MAX_ATTEMPTS = 3;

/** 다시 하기 전에 쉬는 시간 — 두 번째는 조금 더 깁니다 */
export const BACKOFF_MS = [500, 1_500];

/**
 * 요청 한도가 풀릴 때까지 **자동으로 기다려 줄** 최대 시간.
 *
 * 기본 5분입니다. 이보다 오래 남았으면 기다리지 않고 물러납니다.
 * 사용자를 아무 설명 없이 30분씩 붙잡아 두지 않기 위한 상한입니다.
 *
 * `CMM_MAX_RATE_LIMIT_WAIT_SECONDS` 로 바꿀 수 있습니다. 설정 화면은 만들지 않았습니다 —
 * 이 값을 만질 사람은 터미널을 쓰는 사람뿐입니다.
 */
export function maxAutoWaitMs(): number {
  const raw = Number(process.env.CMM_MAX_RATE_LIMIT_WAIT_SECONDS);
  if (Number.isFinite(raw) && raw >= 0) return raw * 1_000;
  return 5 * 60_000;
}

/** 밖에서 갈아 끼울 수 있는 것들 — 시험이 실제로 몇 분씩 기다리지 않게 하려는 것입니다 */
export interface RetryDeps {
  /** 쉬기 */
  sleep?: (ms: number) => Promise<void>;
  /** 지금 몇 시인지 (요청 한도가 언제 풀리는지 재려고) */
  now?: () => number;
  /** 사람에게 알리기 */
  notify?: (message: string) => void;
  /** 자동으로 기다려 줄 최대 시간 */
  maxWaitMs?: number;
  /** 모두 몇 번 시도할지 */
  maxAttempts?: number;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 요청 하나의 최종 결과 */
export type RetryResult =
  | { ok: true; response: Response; attempts: number }
  | { ok: false; failure: FailureInfo; attempts: number };

/** 밀리초를 사람이 읽을 말로 — "2분 18초" */
export function humanizeMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  if (minutes === 0) return `${seconds}초`;
  if (seconds === 0) return `${minutes}분`;
  return `${minutes}분 ${seconds}초`;
}

/**
 * 요청 한도가 풀릴 때까지 얼마나 남았는지.
 *
 * 서버가 알려 준 값이 없으면 `null` 입니다 — **모르면 지어내지 않습니다.**
 * 모를 때는 기다리지 않고 물러나는 편이 낫습니다.
 */
export function waitUntilReset(
  failure: FailureInfo,
  now: number,
): number | null {
  if (failure.resetAt) {
    const parsed = Date.parse(failure.resetAt);
    if (Number.isFinite(parsed)) return Math.max(0, parsed - now);
  }
  return null;
}

/**
 * 한 주소를 받아 옵니다. 다시 해 볼 만한 실패면 정해진 횟수만큼 다시 합니다.
 */
export async function fetchWithRetry(
  url: string,
  options: { accept?: string; timeoutMs?: number } = {},
  deps: RetryDeps = {},
): Promise<RetryResult> {
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;
  const notify = deps.notify ?? ((): void => {});
  const maxWaitMs = deps.maxWaitMs ?? maxAutoWaitMs();
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;

  let attempts = 0;
  let lastFailure: FailureInfo = { type: "UNKNOWN", reason: "시도하지 않았습니다" };

  while (attempts < maxAttempts) {
    attempts++;

    const outcome: FetchOutcome = await fetchWithOutcome(url, options);
    if (outcome.kind === "ok") return { ok: true, response: outcome.response, attempts };

    lastFailure = classifyOutcome(outcome);

    // 마지막 시도였으면 더 볼 것 없습니다.
    if (attempts >= maxAttempts) break;

    // 다시 해도 소용없는 실패면 여기서 끝냅니다. (404 를 세 번 물어보지 않습니다)
    if (!isRetryable(lastFailure.type, lastFailure.statusCode)) break;

    // ── 요청 한도 ──
    if (lastFailure.type === "RATE_LIMIT") {
      const remaining = waitUntilReset(lastFailure, now());

      // 언제 풀리는지 모르면 기다리지 않습니다. 얼마나 걸릴지 말해 줄 수 없으니까요.
      if (remaining === null) break;

      // 너무 오래 남았으면 기다리지 않습니다. 사용자를 붙잡아 두지 않습니다.
      if (remaining > maxWaitMs) {
        notify(
          `요청 한도가 풀리기까지 ${humanizeMs(remaining)} 남았습니다. ` +
            `자동으로 기다리는 상한(${humanizeMs(maxWaitMs)})을 넘어 여기서 멈춥니다.`,
        );
        break;
      }

      notify(
        `요청 한도에 닿았습니다. 약 ${humanizeMs(remaining)} 뒤에 다시 시도합니다. ` +
          `기존 자료는 그대로 있습니다.`,
      );
      // 풀리는 순간을 살짝 넘겨 기다립니다. 딱 맞춰 두드리면 또 막힐 수 있습니다.
      await sleep(remaining + 1_000);
      notify("요청 한도가 풀렸습니다. 멈췄던 자리에서 이어갑니다.");
      continue;
    }

    // ── 그밖의 일시적인 실패 ──
    //
    // 서버가 `retry-after` 로 "이만큼 쉬었다 오라"고 했으면 그 말을 따릅니다.
    // 다만 그 말도 상한을 넘으면 듣지 않습니다 — 사용자를 붙잡아 두지 않기 위해서입니다.
    const backoff = BACKOFF_MS[attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 1_500;

    const told = lastFailure.retryAfterSeconds ? lastFailure.retryAfterSeconds * 1_000 : undefined;
    if (told !== undefined && told > maxWaitMs) {
      notify(`서버가 ${humanizeMs(told)} 뒤에 오라고 했습니다. 상한을 넘어 여기서 멈춥니다.`);
      break;
    }

    await sleep(told ?? backoff);
  }

  return { ok: false, failure: lastFailure, attempts };
}

/** 받아 올 것 하나 */
export interface Document {
  /** 사람이 알아볼 이름 (제목·경로). 어디서 실패했는지 적을 때 씁니다 */
  id: string;
  url: string;
  /**
   * 주 주소에 **없을 때만** 짚어 볼 다른 자리. (17단계)
   *
   * "없음(404)" 일 때만 씁니다. 요청 한도나 서버 탈일 때는 쓰지 않습니다 —
   * 그때는 주 주소가 없는 것이 아니라 우리가 못 받은 것이라, 다른 자리를 봐도 소용없습니다.
   */
  fallbackUrl?: string;
}

/** 문서 하나를 못 받은 기록 */
export interface DocumentFailure {
  id: string;
  type: FailureInfo["type"];
  statusCode?: number;
  reason: string;
  attempts: number;
}

/** 여러 문서를 받아 온 결과 */
export interface CollectResult {
  /** 실제로 요청해 본 문서 수 */
  attempted: number;
  /** 받아 온 문서 수 */
  succeeded: number;
  /** 못 받은 문서들 */
  failures: DocumentFailure[];
  /**
   * 요청 한도 때문에 **아예 손도 못 댄** 문서 수.
   *
   * 실패와 따로 셉니다 — 해 보고 안 된 것과 해 보지도 못한 것은 다릅니다.
   */
  skipped: number;
  /**
   * 그 자리에 **없던** 문서 수 (404).
   *
   * 실패와 따로 셉니다 — 다시 해도 없고, 우리가 못 받은 것도 아닙니다.
   */
  notFound: number;
  /** 요청 한도에 걸렸는지 */
  rateLimited: boolean;
  /** 언제 다시 할 수 있는지 */
  rateLimitResetAt?: string;
}

/** 실패 기록을 무한정 쌓지 않습니다. 앞의 것 몇 개면 무슨 일인지 알 수 있습니다. */
export const MAX_RECORDED_FAILURES = 20;

/**
 * 여러 문서를 차례로 받아 옵니다.
 *
 * ■ 이미 받은 것을 다시 받지 않습니다
 *
 * 다시 하기는 **문서 하나 안에서만** 일어납니다.
 * 30번째 문서에서 요청 한도에 걸려 기다렸다 이어가더라도,
 * 1~29번째를 다시 받지 않습니다. 처음부터 되돌리지 않기 때문입니다.
 *
 * ■ 기다릴 수 없는 한도를 만나면 멈춥니다
 *
 * 남은 문서를 계속 두드려 봐야 같은 답만 옵니다.
 * 그러면 남의 서버만 괴롭히고 우리 한도만 더 씁니다. 그래서 멈추고,
 * **남은 것은 "못 해 봄" 으로 세어** 사실대로 알립니다.
 */
export async function collectDocuments(
  documents: Document[],
  handle: (document: Document, response: Response) => Promise<void>,
  options: { accept?: string; timeoutMs?: number; betweenMs?: number } = {},
  deps: RetryDeps = {},
): Promise<CollectResult> {
  const sleep = deps.sleep ?? realSleep;

  const result: CollectResult = {
    attempted: 0,
    succeeded: 0,
    failures: [],
    skipped: 0,
    notFound: 0,
    rateLimited: false,
  };

  let stop = false;

  for (const document of documents) {
    if (stop) {
      result.skipped++;
      continue;
    }

    result.attempted++;

    let outcome = await fetchWithRetry(
      document.url,
      { accept: options.accept, timeoutMs: options.timeoutMs },
      deps,
    );

    // 주 주소에 없으면(404) 대체 자리를 한 번 짚어 봅니다.
    // **없을 때만** 입니다 — 못 받은 것과 없는 것은 다르니까요.
    if (!outcome.ok && outcome.failure.type === "NOT_FOUND" && document.fallbackUrl) {
      const viaFallback = await fetchWithRetry(
        document.fallbackUrl,
        { accept: options.accept, timeoutMs: options.timeoutMs },
        deps,
      );
      if (viaFallback.ok) outcome = viaFallback;
    }

    if (outcome.ok) {
      try {
        await handle(document, outcome.response);
        result.succeeded++;
      } catch (error) {
        // 받아 오기는 했는데 읽어내지 못했습니다. 이것은 다시 해도 같습니다.
        record(result, {
          id: document.id,
          type: "PARSE_ERROR",
          reason: error instanceof Error ? error.message : String(error),
          attempts: outcome.attempts,
        });
      }
    } else {
      record(result, {
        id: document.id,
        type: outcome.failure.type,
        statusCode: outcome.failure.statusCode,
        reason: outcome.failure.reason,
        attempts: outcome.attempts,
      });

      if (outcome.failure.type === "NOT_FOUND") result.notFound++;

      if (outcome.failure.type === "RATE_LIMIT") {
        result.rateLimited = true;
        result.rateLimitResetAt = outcome.failure.resetAt;
        // 여기까지 왔다는 것은 기다릴 수 없는 한도라는 뜻입니다. (기다릴 수 있었으면 위에서 이어갔습니다)
        stop = true;
      }
    }

    if (options.betweenMs) await sleep(options.betweenMs);
  }

  return result;
}

/** 실패를 적어 둡니다. 개수에 상한을 둡니다 — 목록이 아니라 단서면 충분합니다. */
function record(result: CollectResult, failure: DocumentFailure): void {
  if (result.failures.length < MAX_RECORDED_FAILURES) result.failures.push(failure);
  else if (result.failures.length === MAX_RECORDED_FAILURES) {
    // 자리가 찼다는 것만 남깁니다. 몇 건이 더 있는지는 attempted - succeeded 로 알 수 있습니다.
    result.failures.push({
      id: "…",
      type: "UNKNOWN",
      reason: `실패가 더 있습니다 (앞의 ${MAX_RECORDED_FAILURES}건만 적었습니다)`,
      attempts: 0,
    });
  }
}
