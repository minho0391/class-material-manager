/**
 * 실패 기록(failed.json) 관리.
 *
 * ■ 왜 합쳐서 저장하는가
 *
 * 3단계(문서)와 4단계(파일)는 각각 다른 자료를 다룹니다.
 * 그런데 실패 목록을 그냥 덮어쓰면, 4단계를 돌릴 때
 * 3단계에서 기록한 "권한 없음 16건"이 사라집니다.
 *
 * 그래서 자료 ID 를 열쇠로 삼아 **기존 기록은 유지하고, 같은 자료만 갱신**합니다.
 * 어떤 자료를 왜 수집하지 못했는지가 계속 남아 있어야
 * 나중에 "이건 왜 없지?" 하고 헤매지 않습니다.
 */
import { readFile } from "node:fs/promises";
import { FAILED_FILE } from "../config/paths.ts";
import { writeJsonAtomic } from "./atomic-write.ts";

/** 실패 기록 하나 */
export interface FailureRecord {
  docId: string;
  title?: string;
  /** 실패 이유의 종류 (notFound, unsupportedType 등) */
  code: string;
  /** 사람이 읽을 수 있는 설명 */
  reason: string;
  /** 어느 단계에서 실패했는지 */
  stage?: string;
  /** 마지막으로 시도한 시각 */
  attemptedAt?: string;
}

/**
 * 새 실패 기록을 기존 파일과 합쳐 저장합니다.
 *
 * @param newFailures 이번 실행에서 실패한 것들
 * @param stage 어느 단계인지 (예: "3단계 문서 수집")
 */
export async function mergeFailures(
  newFailures: Array<Omit<FailureRecord, "stage" | "attemptedAt">>,
  stage: string,
): Promise<number> {
  let previous: FailureRecord[] = [];

  try {
    const raw = await readFile(FAILED_FILE, "utf8");
    previous = (JSON.parse(raw) as { failures?: FailureRecord[] }).failures ?? [];
  } catch {
    // 파일이 없으면 (= 처음 실행) 빈 목록에서 시작합니다.
  }

  const merged = new Map(previous.map((f) => [f.docId, f]));
  const attemptedAt = new Date().toISOString();

  for (const failure of newFailures) {
    merged.set(failure.docId, { ...failure, stage, attemptedAt });
  }

  const failures = [...merged.values()];

  await writeJsonAtomic(FAILED_FILE, {
    updatedAt: attemptedAt,
    count: failures.length,
    failures,
  });

  return failures.length;
}
