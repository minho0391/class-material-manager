/**
 * 공식 문서를 **가져왔는가**를 말하는 상태.
 *
 * ■ 왜 필요한가
 *
 * 지금까지는 "요약 몇 건" 만 셌습니다. 그런데 그 숫자는 두 가지를 구분하지 못합니다.
 *
 *   · 정말 문서가 없어서 0건    ← 정상입니다
 *   · 못 받아와서 0건            ← 실패입니다
 *
 * 15단계 회귀 검증에서 뒤엣것이 앞엣것처럼 보였습니다.
 * 그래서 "몇 건" 과 별개로 **"어떻게 됐는가"** 를 따로 들고 다닙니다.
 *
 * ■ 상태를 지어내지 않습니다
 *
 * 상태는 실제로 일어난 일에서 나옵니다 —
 * 요청이 성공했는가, 한도에 걸렸는가, 이미 가진 자료가 있는가.
 * "0건이면 실패" 같은 규칙은 쓰지 않습니다. 문서가 0개인 과목이 실제로 있기 때문입니다.
 */

/** 공식 문서 갱신이 어떻게 됐는가 */
export const COLLECT_STATUS = {
  /** 새 공식 문서를 정상으로 가져왔습니다 */
  SUCCESS: "SUCCESS",
  /** 일부 출처는 가져왔고 일부는 실패했습니다 */
  PARTIAL: "PARTIAL",
  /** 새로 가져오지 못해 **이미 가진 자료를 그대로 씁니다** */
  STALE: "STALE",
  /** 가져오지도 못했고 쓸 수 있는 예전 자료도 없습니다 */
  FAILED: "FAILED",
} as const;

export type CollectStatus = (typeof COLLECT_STATUS)[keyof typeof COLLECT_STATUS];

/** 상태를 사람이 읽을 말로. CLI·화면·README 가 같은 말을 씁니다. */
export const COLLECT_LABEL: Record<CollectStatus, string> = {
  SUCCESS: "최신",
  PARTIAL: "일부만 갱신",
  STALE: "예전 자료 사용",
  FAILED: "실패",
};

/** 상태의 뜻 */
export const COLLECT_MEANING: Record<CollectStatus, string> = {
  SUCCESS: "공식 문서를 정상으로 받아왔습니다.",
  PARTIAL: "일부 출처는 받아왔고 일부는 받지 못했습니다. 받지 못한 쪽은 예전 자료를 그대로 씁니다.",
  STALE: "새로 받지 못해 이미 가진 공식 문서를 그대로 씁니다. 자료를 잃지는 않았습니다.",
  FAILED: "받지도 못했고 쓸 수 있는 예전 자료도 없습니다.",
};

/** 화면에 붙일 기호 */
export const COLLECT_MARK: Record<CollectStatus, string> = {
  SUCCESS: "✓",
  PARTIAL: "⚠",
  STALE: "⚠",
  FAILED: "✗",
};

/**
 * 출처 하나가 어떻게 됐는가.
 *
 * 과목 하나가 여러 출처(한국어 MDN + 영어 MDN)를 볼 수 있어서 따로 셉니다.
 */
export interface SourceAttempt {
  /** 어디에 요청했는지 — 토큰이나 개인 정보는 들어가지 않습니다 */
  where: string;
  ok: boolean;
  /** 받아온 항목 수 */
  count: number;
  /** 요청 한도에 걸렸는지 */
  rateLimited?: boolean;
  /** 언제 다시 할 수 있는지 (알 수 있을 때만) */
  resetAt?: string;
  /** 왜 못 받았는지 */
  reason?: string;
}

/**
 * 여러 출처의 결과를 하나의 상태로 모읍니다.
 *
 * @param attempts   출처별 결과
 * @param hasExisting 이미 가진 자료가 있는지 — 이것이 STALE 과 FAILED 를 가릅니다
 */
export function summarizeAttempts(
  attempts: SourceAttempt[],
  hasExisting: boolean,
): { status: CollectStatus; rateLimited: boolean; resetAt?: string; reason?: string } {
  // 시도한 적이 없으면 상태를 말할 수 없습니다.
  // (수업자료가 없어 아예 건너뛴 과목이 여기 옵니다)
  if (attempts.length === 0) {
    return { status: hasExisting ? COLLECT_STATUS.STALE : COLLECT_STATUS.FAILED, rateLimited: false };
  }

  const failed = attempts.filter((attempt) => !attempt.ok);
  const rateLimited = failed.some((attempt) => attempt.rateLimited);

  // 다시 할 수 있는 시각은 가장 늦은 것을 씁니다. 그때는 전부 풀려 있습니다.
  const resetAt = failed
    .map((attempt) => attempt.resetAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const reason = failed[0]?.reason;

  if (failed.length === 0) {
    return { status: COLLECT_STATUS.SUCCESS, rateLimited: false };
  }

  if (failed.length < attempts.length) {
    return { status: COLLECT_STATUS.PARTIAL, rateLimited, resetAt, reason };
  }

  // 전부 실패했습니다. 예전 자료가 있으면 그것을 쓰고, 없으면 실패입니다.
  return {
    status: hasExisting ? COLLECT_STATUS.STALE : COLLECT_STATUS.FAILED,
    rateLimited,
    resetAt,
    reason,
  };
}

/**
 * 문서 **원문**을 받아 온 결과. (17단계)
 *
 * 16단계는 목록(index)까지만 상태로 봤습니다.
 * 그런데 목록을 정상으로 받고도 원문 50건 중 5건을 못 받을 수 있습니다.
 * 그것을 `SUCCESS` 라고 하면 실제보다 좋아 보입니다.
 */
export interface ContentAttempt {
  /** 요청해 본 문서 수 */
  attempted: number;
  /** 받아 온 문서 수 */
  succeeded: number;
  /** 못 받은 문서 수 (아래 `notFound` 는 여기 넣지 않습니다) */
  failed: number;
  /**
   * 그 자리에 **없던** 문서 수. (17단계)
   *
   * 실패와 따로 셉니다. 16단계에서 정한 것과 같은 이유입니다 —
   * **404 는 실패가 아니라 "없음" 입니다.** 다시 해도 없고, 예전 자료가 낡은 것도 아닙니다.
   * 이것 때문에 상태를 `PARTIAL` 로 내리면, 고칠 수 없는 경고를 영원히 띄우게 됩니다.
   * 세어서 알리기는 하되, 상태는 건드리지 않습니다.
   */
  notFound?: number;
  /** 요청 한도 때문에 아예 손도 못 댄 문서 수 */
  skipped: number;
  rateLimited?: boolean;
  resetAt?: string;
}

/**
 * 목록 상태와 원문 상태를 **하나로 합칩니다.**
 *
 * 규칙은 하나뿐입니다 — **실제보다 좋아 보이게 만들지 않는다.**
 *
 *   목록 실패                     → 목록 상태를 그대로 따릅니다 (원문은 볼 것도 없습니다)
 *   목록 성공 + 원문 전부 성공      → SUCCESS
 *   목록 성공 + 원문 일부 실패      → PARTIAL
 *   목록 성공 + 원문 전부 실패      → 받아 둔 것이 있으면 STALE, 없으면 FAILED
 */
export function combineWithContent(
  indexStatus: CollectStatus,
  content: ContentAttempt,
  hasExisting: boolean,
): CollectStatus {
  // 목록부터 못 받았으면 원문은 시도조차 못 했습니다. 목록 쪽 판단이 그대로 답입니다.
  if (indexStatus !== COLLECT_STATUS.SUCCESS) return indexStatus;

  // 받아 올 것이 아예 없었으면 (수업자료가 없는 과목 등) 목록 상태 그대로입니다.
  if (content.attempted === 0 && content.skipped === 0) return indexStatus;

  const missed = content.failed + content.skipped;
  if (missed === 0) return COLLECT_STATUS.SUCCESS;

  // 하나라도 받아 왔으면 섞여 있는 것입니다.
  if (content.succeeded > 0) return COLLECT_STATUS.PARTIAL;

  // 하나도 못 받았습니다. 예전에 받아 둔 것이 있으면 그것을 씁니다.
  return hasExisting ? COLLECT_STATUS.STALE : COLLECT_STATUS.FAILED;
}

/**
 * 과목별 상태를 전체 상태 하나로 모읍니다.
 *
 * **가장 나쁜 것을 따르지 않습니다.** 과목 하나가 실패했다고 전체가 실패는 아닙니다.
 * 대신 이렇게 봅니다 —
 *
 *   전부 성공            → SUCCESS
 *   하나라도 성공했으면    → PARTIAL   (섞여 있다는 것을 알려야 합니다)
 *   성공이 없고 자료는 있음 → STALE
 *   성공도 자료도 없음     → FAILED
 */
export function overallStatus(statuses: CollectStatus[]): CollectStatus {
  if (statuses.length === 0) return COLLECT_STATUS.FAILED;

  const succeeded = statuses.filter((status) => status === COLLECT_STATUS.SUCCESS).length;

  if (succeeded === statuses.length) return COLLECT_STATUS.SUCCESS;
  if (succeeded > 0) return COLLECT_STATUS.PARTIAL;
  if (statuses.some((status) => status === COLLECT_STATUS.PARTIAL)) return COLLECT_STATUS.PARTIAL;
  if (statuses.some((status) => status === COLLECT_STATUS.STALE)) return COLLECT_STATUS.STALE;

  return COLLECT_STATUS.FAILED;
}
