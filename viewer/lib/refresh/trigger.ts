/**
 * 첫 접속 트리거 24시간 자동 갱신 — Vercel 쪽 절반.
 *
 * 여기서는 "지금이 갱신할 때인가"를 Supabase에서 원자적으로 확인(claim)만 하고,
 * 실제 재수집·재가공은 하지 않습니다. claim에 성공하면 GitHub Actions 워크플로우를
 * 원격으로 트리거해 그쪽에서 실행하게 합니다.
 *
 * ■ 왜 Vercel이 직접 갱신하지 않는가
 *
 * Vercel에 배포된 이 뷰어는 로컬 data/ 폴더도 Google Drive 인증 정보도 갖고 있지
 * 않습니다. 강사 원본 자료를 클라우드로 옮기지 않는다는 프로젝트 원칙 때문에 둘 다
 * 의도적으로 로컬 전용입니다. 실제 실행은 `.github/workflows/material-refresh.yml`
 * 이 맡습니다 — 자세한 설명은 그 파일 상단 주석을 참고하세요.
 *
 * ■ 서버 전용
 *
 * service_role 키(SUPABASE_SERVICE_ROLE_KEY)를 쓰므로, 이 파일은 서버 컴포넌트나
 * 서버 전용 코드에서만 import 해야 합니다. 클라이언트 컴포넌트에서 import 하면
 * 이 키가 브라우저 번들에 노출됩니다.
 */

const GITHUB_OWNER = "minho0391";
const GITHUB_REPO = "class-material-manager";
const GITHUB_DISPATCH_EVENT = "material-refresh";
const JOB_NAME = "material_sync";

interface SupabaseAdminEnv {
  url: string;
  serviceRoleKey: string;
}

function loadEnv(): SupabaseAdminEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

/**
 * 원자적으로 claim을 시도합니다.
 *
 * 대부분의 요청은 "마지막 성공 + 24시간"이 아직 안 지났거나 이미 다른 요청이 진행
 * 중이라 빈 결과를 받고 즉시 끝납니다 — 이게 정상 동작입니다.
 */
async function tryClaim(env: SupabaseAdminEnv): Promise<string | null> {
  const res = await fetch(`${env.url}/rest/v1/rpc/try_claim_refresh`, {
    method: "POST",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_job_name: JOB_NAME }),
    cache: "no-store",
  });

  if (!res.ok) {
    console.warn(`[refresh-trigger] claim 확인 실패 (HTTP ${res.status})`);
    return null;
  }

  const rows = (await res.json()) as Array<{ claim_token: string }>;
  return rows[0]?.claim_token ?? null;
}

/**
 * claim은 얻었지만 GitHub Actions를 트리거하지 못했을 때 실패로 되돌립니다.
 *
 * 이마저 실패해도 claim은 stale lock 만료(DB 함수 기본값 90분)로 결국 풀리므로
 * 영구히 막히지 않습니다.
 */
async function releaseAsFailed(env: SupabaseAdminEnv, claimToken: string, reason: string): Promise<void> {
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/release_refresh`, {
      method: "POST",
      headers: {
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_job_name: JOB_NAME,
        p_claim_token: claimToken,
        p_success: false,
        p_error: reason.slice(0, 2000),
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(
        `[refresh-trigger] claim 실패 보고 자체가 거부됐습니다 (HTTP ${res.status}, stale lock 만료로 결국 풀립니다): ${body.slice(0, 300)}`,
      );
    }
  } catch (e) {
    console.warn("[refresh-trigger] claim 실패 처리 중 오류 (stale lock 만료로 결국 풀립니다):", e);
  }
}

/**
 * GitHub Actions를 원격 트리거합니다.
 *
 * 네트워크 오류로 fetch 자체가 던지는 경우까지 포함해, 트리거에 실패하는 모든 경로에서
 * 반드시 releaseAsFailed 를 부릅니다 — 그래야 claim이 90분 stale lock 만료를 기다리지
 * 않고 즉시 풀려, 바로 다음 요청에서 재시도할 수 있습니다.
 */
async function dispatchWorkflow(env: SupabaseAdminEnv, claimToken: string): Promise<void> {
  const dispatchToken = process.env.GH_DISPATCH_TOKEN;
  if (!dispatchToken) {
    console.warn("[refresh-trigger] GH_DISPATCH_TOKEN이 설정되지 않아 GitHub Actions를 트리거하지 못했습니다");
    await releaseAsFailed(env, claimToken, "GH_DISPATCH_TOKEN 환경변수가 없어 GitHub Actions를 트리거하지 못했습니다");
    return;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dispatchToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: GITHUB_DISPATCH_EVENT,
        client_payload: { claim_token: claimToken },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[refresh-trigger] GitHub Actions 트리거 실패 (HTTP ${res.status}): ${body.slice(0, 300)}`);
      await releaseAsFailed(env, claimToken, `GitHub Actions 트리거 실패 (HTTP ${res.status}): ${body.slice(0, 500)}`);
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn("[refresh-trigger] GitHub Actions 트리거 중 네트워크 오류:", e);
    await releaseAsFailed(env, claimToken, `GitHub Actions 트리거 중 네트워크 오류: ${reason.slice(0, 500)}`);
  }
}

/**
 * 요청마다 부릅니다 (viewer/proxy.ts 의 미들웨어에서 `after()` 로 감싸 호출).
 *
 * 화면 응답을 절대 기다리게 하면 안 되므로, 반드시 응답을 보낸 뒤 실행되는
 * `after()` 안에서만 호출하세요. 이 함수 자체도 내부에서 예외를 전부 삼켜
 * 호출부에 영향을 주지 않습니다.
 */
export async function checkAndTriggerRefresh(): Promise<void> {
  const env = loadEnv();
  if (!env) return; // 로컬 개발 등 service_role 키가 없는 환경에서는 조용히 건너뜁니다

  try {
    const claimToken = await tryClaim(env);
    if (!claimToken) return;
    await dispatchWorkflow(env, claimToken);
  } catch (e) {
    console.warn("[refresh-trigger] 자동 갱신 감지 중 오류:", e);
  }
}
