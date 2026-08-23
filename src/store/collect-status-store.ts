/**
 * 공식 문서를 **마지막으로 언제, 어떻게** 가져왔는지 적어 두는 곳.
 *
 * ■ 왜 따로 두는가
 *
 * 공식 문서 요약본(`data/references/*.md`) 자체는 건드리지 않습니다.
 * 그것은 자료이고, 여기 적는 것은 **그 자료가 얼마나 최신인가**에 대한 기록입니다.
 * 섞어 두면 자료를 읽을 때마다 상태가 딸려 오고, 상태를 고칠 때마다 자료가 다시 쓰입니다.
 *
 * ■ 무엇을 적지 않는가
 *
 * **토큰을 적지 않습니다.** 토큰을 썼는지 여부(`usedToken`)만 적습니다.
 * 이 파일은 사람이 열어 볼 수 있어야 하고, 열어도 위험한 것이 없어야 합니다.
 */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../config/paths.ts";
import type { CollectStatus } from "../enrich/collect-status.ts";
import { writeJsonAtomic } from "./atomic-write.ts";

/** 상태 파일 자리 */
export const COLLECT_STATUS_FILE = join(DATA_DIR, "collect-status.json");

/**
 * 못 받은 문서 하나.
 *
 * **최소한만 적습니다.** 응답 본문도, 토큰도, 요청 머리말도 담지 않습니다.
 * 여기 적는 목적은 "무엇이 왜 안 됐는지 사람이 알아보게" 하는 것 하나입니다.
 */
export interface FailedDocumentRecord {
  /** 어느 출처에서 */
  source: string;
  /** 어떤 문서 (제목 또는 경로) */
  id: string;
  /** 왜 (RATE_LIMIT · TIMEOUT · NETWORK · HTTP_ERROR · NOT_FOUND · PARSE_ERROR · UNKNOWN) */
  failureType: string;
  /** HTTP 상태 (있을 때만) */
  statusCode?: number;
  /** 몇 번 해 봤는지 */
  attempts: number;
  lastAttemptAt: string;
  /** 이 문서 자리에 예전 요약본이 남아 있는지 */
  usingPreviousData: boolean;
}

/** 과목 하나의 마지막 결과 */
export interface SubjectCollectRecord {
  subject: string;
  status: CollectStatus;
  /** 이번에 받아온 공식 문서 목록 개수 */
  indexCount: number;
  /** 지금 가지고 있는 요약본 수 */
  summaries: number;
  /** 요청 한도에 걸렸는지 */
  rateLimited: boolean;
  reason?: string;

  // ── 17단계: 원문을 얼마나 받았는가 ──
  /** 원문을 요청해 본 문서 수 */
  contentAttempted?: number;
  /** 받아 온 문서 수 */
  contentSucceeded?: number;
  /** 못 받은 문서 수 */
  contentFailed?: number;
  /** 요청 한도 때문에 손도 못 댄 문서 수 */
  contentSkipped?: number;
}

/** 마지막 갱신 기록 */
export interface CollectStatusData {
  version: 1;
  /** 마지막으로 시도한 때 */
  checkedAt: string;
  /** 마지막으로 **정상 갱신에 성공한** 때. 실패해도 이 값은 그대로 둡니다 */
  lastSuccessAt?: string;
  status: CollectStatus;
  rateLimited: boolean;
  /** 언제 다시 할 수 있는지 */
  rateLimitResetAt?: string;
  /** 토큰을 썼는지 — 값은 담지 않습니다 */
  usedToken: boolean;
  subjects: SubjectCollectRecord[];
  /**
   * 못 받은 문서들. (17단계)
   *
   * 개수에 상한을 둡니다 — 전체 목록이 아니라 **무슨 일이 있었는지 알아볼 단서**입니다.
   */
  failedDocuments?: FailedDocumentRecord[];
}

/** 마지막 갱신 기록을 읽습니다. 아직 없으면 null 입니다. */
export async function loadCollectStatus(): Promise<CollectStatusData | null> {
  try {
    const parsed = JSON.parse(await readFile(COLLECT_STATUS_FILE, "utf8")) as CollectStatusData;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 갱신 기록을 저장합니다.
 *
 * `lastSuccessAt` 은 **성공했을 때만** 새로 씁니다.
 * 실패한 실행이 "마지막 성공" 을 지워 버리면, 우리가 가진 자료가
 * 얼마나 오래된 것인지 알 길이 없어집니다.
 */
export async function saveCollectStatus(
  data: Omit<CollectStatusData, "version" | "lastSuccessAt">,
): Promise<void> {
  const previous = await loadCollectStatus();

  const succeeded = data.status === "SUCCESS" || data.status === "PARTIAL";
  const lastSuccessAt = succeeded ? data.checkedAt : previous?.lastSuccessAt;

  await mkdir(DATA_DIR, { recursive: true });
  await writeJsonAtomic(COLLECT_STATUS_FILE, { version: 1, ...data, lastSuccessAt });
}
