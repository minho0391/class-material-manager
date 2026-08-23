/**
 * 바깥에서 무언가를 못 받아 왔을 때, **왜 못 받았는지** 를 나누는 자리.
 *
 * ■ 왜 나누는가
 *
 * 16단계에서 "받지 못한 것과 없는 것은 다르다"를 배웠습니다.
 * 17단계는 거기서 한 걸음 더 갑니다 — **못 받은 것들끼리도 다릅니다.**
 *
 *   404 는 다시 물어봐야 소용없습니다. 그 자리에 없는 것이니까요.
 *   timeout 은 다시 해 보면 될 수도 있습니다. 잠깐 느렸을 뿐일 수 있으니까요.
 *
 * 이 둘을 같은 `failed` 로 세면 둘 다 잘못 다루게 됩니다 —
 * 없는 것을 세 번 더 물어보고, 될 뻔한 것을 한 번 만에 포기합니다.
 *
 * ■ 추측하지 않습니다
 *
 * `RATE_LIMIT` 은 **서버가 그렇다고 말했을 때만** 붙입니다.
 * 429 가 왔다는 것만으로 GitHub 의 요청 한도라고 부르지 않습니다.
 * 근거가 없으면 `HTTP_ERROR` 로 두고 상태 코드만 적습니다.
 */
import type { FetchOutcome } from "./github.ts";

/** 왜 못 받았는가 */
export const FAILURE_TYPE = {
  /** 서버가 요청 한도를 넘겼다고 **직접 밝혔습니다** */
  RATE_LIMIT: "RATE_LIMIT",
  /** 정해진 시간 안에 응답이 오지 않았습니다 */
  TIMEOUT: "TIMEOUT",
  /** 아예 닿지 못했습니다 (DNS·연결 끊김) */
  NETWORK: "NETWORK",
  /** 응답은 왔는데 오류였습니다 */
  HTTP_ERROR: "HTTP_ERROR",
  /** 그 자리에 없습니다 (404). **실패가 아니라 "없음" 입니다** */
  NOT_FOUND: "NOT_FOUND",
  /** 받긴 받았는데 읽어내지 못했습니다 */
  PARSE_ERROR: "PARSE_ERROR",
  /** 위 어디에도 들어맞지 않습니다 */
  UNKNOWN: "UNKNOWN",
} as const;

export type FailureType = (typeof FAILURE_TYPE)[keyof typeof FAILURE_TYPE];

/** 사람이 읽을 말로 */
export const FAILURE_LABEL: Record<FailureType, string> = {
  RATE_LIMIT: "요청 한도",
  TIMEOUT: "응답 없음",
  NETWORK: "연결 실패",
  HTTP_ERROR: "서버 오류",
  NOT_FOUND: "문서 없음",
  PARSE_ERROR: "읽지 못함",
  UNKNOWN: "알 수 없음",
};

/**
 * 다시 해 볼 만한 실패인가.
 *
 * ■ 다시 해 볼 것
 *   TIMEOUT·NETWORK   잠깐 흔들린 것일 수 있습니다
 *   HTTP_ERROR 5xx    서버 쪽 문제라 곧 나을 수 있습니다
 *   HTTP_ERROR 429    너무 빨리 보냈다는 뜻이니 쉬었다 하면 됩니다
 *   RATE_LIMIT        기다릴 만하면 기다립니다 (판단은 부르는 쪽에서)
 *
 * ■ 다시 해도 소용없는 것
 *   NOT_FOUND         그 자리에 없습니다. 백 번 물어도 없습니다
 *   PARSE_ERROR       같은 응답이 또 옵니다
 *   HTTP_ERROR 4xx    우리 요청이 잘못된 것이라 그대로 보내면 또 틀립니다
 */
export function isRetryable(type: FailureType, statusCode?: number): boolean {
  switch (type) {
    case FAILURE_TYPE.TIMEOUT:
    case FAILURE_TYPE.NETWORK:
    case FAILURE_TYPE.RATE_LIMIT:
      return true;

    case FAILURE_TYPE.HTTP_ERROR:
      // 429(너무 빠름)와 5xx(서버 탈) 만 다시 해 봅니다.
      return statusCode === 429 || (statusCode !== undefined && statusCode >= 500);

    default:
      return false;
  }
}

/** 실패 하나를 적어 둘 만한 최소 정보 */
export interface FailureInfo {
  type: FailureType;
  /** HTTP 상태 (있을 때만) */
  statusCode?: number;
  /** 한 줄 설명. **응답 본문 전체를 담지 않습니다** */
  reason: string;
  /** 요청 한도일 때, 언제 풀리는지 */
  resetAt?: string;
  /** 서버가 "이만큼 쉬었다 오라"고 알려 준 시간 (있을 때만) */
  retryAfterSeconds?: number;
}

/** 응답 결과를 실패 정보로 바꿉니다. */
export function classifyOutcome(outcome: Exclude<FetchOutcome, { kind: "ok" }>): FailureInfo {
  switch (outcome.kind) {
    case "rate-limited":
      return {
        type: FAILURE_TYPE.RATE_LIMIT,
        reason: outcome.reason,
        resetAt: outcome.resetAt,
      };

    case "timeout":
      return { type: FAILURE_TYPE.TIMEOUT, reason: outcome.reason };

    case "not-found":
      return { type: FAILURE_TYPE.NOT_FOUND, statusCode: 404, reason: "그 자리에 없습니다" };

    case "http-error":
      return {
        type: FAILURE_TYPE.HTTP_ERROR,
        statusCode: outcome.status,
        reason: outcome.reason,
        retryAfterSeconds: outcome.retryAfterSeconds,
      };

    case "network-error":
      return { type: FAILURE_TYPE.NETWORK, reason: outcome.reason };

    default:
      return { type: FAILURE_TYPE.UNKNOWN, reason: "알 수 없는 까닭" };
  }
}

/**
 * 오류 메시지를 보고 시간 초과인지 가려냅니다.
 *
 * `AbortSignal.timeout` 은 `TimeoutError` 라는 이름으로 던집니다.
 * 이름을 먼저 보고, 없으면 메시지를 봅니다 — 이름 쪽이 더 믿을 만합니다.
 */
export function looksLikeTimeout(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return true;
    return /timed?\s?out|aborted/i.test(error.message);
  }
  return false;
}
