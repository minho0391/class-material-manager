/**
 * 24시간 주기 백그라운드 자동 갱신의 실제 작업.
 *
 * ■ 누가 부르는가
 *
 * 사람이 직접 실행하는 명령이 아닙니다. 뷰어(Vercel)가 "마지막 성공 + 24시간"이 지난 것을
 * 감지하면 GitHub Actions 워크플로우를 원격으로 트리거하고, 그 워크플로우가 CI 환경에서
 * `node src/index.ts ci-refresh` 로 이 파일의 {@link runAutoRefresh} 를 부릅니다.
 *
 * ■ 무엇을 새로 하지 않는가
 *
 * 자료를 다시 모으고 다시 엮는 일은 전부 기존 `refresh()`(12단계 파이프라인)와
 * `syncSupabase()`/`verifySupabase()`(Supabase 이관)가 그대로 합니다. 이 파일은 그 셋을
 * 정해진 순서로 부르고, claim_token으로 Supabase에 결과를 보고하는 얇은 오케스트레이션만
 * 담당합니다.
 *
 * ■ 성공/실패를 가르는 기준
 *
 * "성공"은 다음 세 가지를 모두 만족할 때만입니다 — 그래야 실패를 성공으로 기록하지 않는다는
 * 원칙을 지킬 수 있습니다. 사람이 직접 `npm run refresh` 를 실행했을 때와 같은 기준입니다
 * (`runRefresh` 가 `summary.steps`에 "실패" 상태가 하나라도 있으면 exitCode를 1로 두는
 * 것과 같습니다 — `summary.stopped` 는 "뒷 단계를 아예 건너뛸 정도로 치명적이었는가"만
 * 나타내고, 개별 단계 실패 여부와는 다릅니다. 예를 들어 Google 인증이 실패해도 `stopped`
 * 는 false지만 그 단계는 "실패"로 기록됩니다).
 *   1. refresh() 파이프라인의 모든 단계가 "실패"가 아니었다 (건너뜀·이전 데이터 사용은 허용)
 *   2. Supabase upsert가 예외 없이 끝났다
 *   3. 이관 후 검증(verifySupabase)에서 누락·중복·FK 고아행이 하나도 없었다
 *
 * 셋 중 하나라도 어긋나면 실패로 보고합니다. 이 경우 Supabase의 5개 테이블은
 * (사용된 적이 있다면) 이전 성공 때의 정상 데이터를 그대로 유지합니다 — 이 파일이
 * 부분적으로 upsert된 상태를 되돌리지는 않지만, upsert 자체가 항상 merge라 기존 행을
 * 지우지 않으므로 "정상 데이터가 훼손"되는 일은 없습니다.
 */
import { refresh } from "./refresh-runner.ts";
import { syncSupabase } from "../sync/sync-runner.ts";
import { hasVerifyProblems, verifySupabase, type VerifyReport } from "../sync/verify.ts";
import { loadSupabaseEnv } from "../sync/env.ts";
import { callRpc } from "../sync/postgrest-client.ts";
import * as log from "../utils/logger.ts";

export interface AutoRefreshResult {
  success: boolean;
  /** 사람이 읽을 한 줄 요약 — 실패 사유 또는 성공 결과 */
  message: string;
  verify?: VerifyReport;
}

/**
 * claim_token으로 갱신 결과를 Supabase에 보고합니다.
 *
 * 이 호출 자체가 실패해도(네트워크 오류 등) 예외를 밖으로 던지지 않고 경고만 남깁니다 —
 * 결과 보고에 실패했다고 이미 끝난 갱신 작업 자체를 실패로 되돌릴 이유는 없고,
 * claim은 stale lock 회수(90분)로 결국 풀리기 때문입니다.
 */
async function reportResult(
  claimToken: string,
  success: boolean,
  errorMessage: string | null,
): Promise<void> {
  try {
    const env = loadSupabaseEnv();
    await callRpc(env, "release_refresh", {
      p_job_name: "material_sync",
      p_claim_token: claimToken,
      p_success: success,
      p_error: errorMessage,
    });
    log.detail(`Supabase에 결과를 보고했습니다 (${success ? "성공" : "실패"})`);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    log.warn(`결과 보고에 실패했습니다 (claim은 stale lock 만료로 풀립니다): ${reason.slice(0, 200)}`);
  }
}

/**
 * 자동 갱신을 실행하고 결과를 Supabase에 보고합니다.
 *
 * @param claimToken try_claim_refresh 로 이미 획득한 claim. release_refresh 가 이 토큰과
 *   일치하는 행만 갱신하므로, 이 함수가 무엇을 하든 다른 claim을 건드릴 수 없습니다.
 */
export async function runAutoRefresh(claimToken: string): Promise<AutoRefreshResult> {
  try {
    log.step("자동 갱신을 시작합니다 (claim 보유 확인됨)");
    const summary = await refresh();

    // `npm run refresh` 와 같은 기준: 단계 하나라도 "실패" 면 전체 실패입니다.
    // summary.stopped 는 "뒷 단계까지 건너뛸 만큼 치명적이었는가"만 가리키므로,
    // 이것만 보면 stopped 로 이어지지 않는 개별 실패(예: Google 인증 실패, 공식 문서
    // 수집 실패)를 성공으로 잘못 보고하게 됩니다.
    const failedSteps = summary.steps.filter((step) => step.status === "실패");
    if (failedSteps.length > 0) {
      const message =
        `${failedSteps.length}개 단계가 실패했습니다 — ` +
        failedSteps.map((step) => `[${step.order}] ${step.name}: ${step.detail}`).join(" / ");
      log.error(message);
      await reportResult(claimToken, false, message.slice(0, 2000));
      return { success: false, message };
    }

    log.step("Supabase로 이관합니다");
    await syncSupabase();

    log.step("이관 결과를 검증합니다");
    const verify = await verifySupabase();

    if (hasVerifyProblems(verify)) {
      const message = "이관 검증에서 누락·중복·FK 고아행을 찾았습니다 — 상세는 위 로그를 참고하세요";
      log.error(message);
      await reportResult(claimToken, false, message);
      return { success: false, message, verify };
    }

    const message = "갱신·이관·검증이 모두 성공했습니다";
    log.success(message);
    await reportResult(claimToken, true, null);
    return { success: true, message, verify };
  } catch (e) {
    const reason = e instanceof Error ? (e.stack ?? e.message) : String(e);
    const message = `예상하지 못한 오류로 갱신이 중단되었습니다: ${reason.slice(0, 500)}`;
    log.error(message);
    await reportResult(claimToken, false, message.slice(0, 2000));
    return { success: false, message };
  }
}
