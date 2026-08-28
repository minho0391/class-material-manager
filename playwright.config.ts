/**
 * Viewer 를 **진짜 브라우저로** 열어 보는 시험.
 *
 * ■ 왜 따로 두는가
 *
 * `npm test` 는 서버 없이 도는 빠른 시험입니다 (1초). 여기는 다릅니다 —
 * Viewer 를 실제로 띄우고 브라우저로 눌러 봅니다.
 *
 * 서버가 그려 준 HTML 만 봐서는 알 수 없는 것이 있습니다.
 * 링크를 눌렀을 때 정말 그 화면으로 가는지, 브라우저에서 오류가 나지 않는지 같은 것들입니다.
 *
 * ■ 자료가 없어도 도는가
 *
 * 돕니다. 자료가 없으면 Viewer 가 "아직 자료가 없습니다" 를 보여주게 해 두었고(18단계),
 * 시험도 그 경우를 정상으로 봅니다. 그래서 **처음 받은 사람도 그대로 돌려볼 수 있습니다.**
 */
import { defineConfig, devices } from "@playwright/test";

/**
 * Viewer 를 띄울 자리.
 *
 * Next 의 개발 서버는 같은 폴더에서 두 번째를 띄우지 않습니다.
 * 그래서 평소 쓰는 자리(3000)를 그대로 쓰고, 이미 떠 있으면 그것을 그대로 씁니다.
 */
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // 개인 도구라 한 번에 하나씩이면 충분합니다. 결과가 뒤섞이지 않습니다.
  workers: 1,
  fullyParallel: false,
  // 화면이 느리게 뜰 수 있으므로 넉넉히 기다립니다.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],

  use: {
    baseURL: BASE_URL,
    // 실패했을 때만 흔적을 남깁니다. 평소에는 아무것도 쌓이지 않습니다.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  // 시험이 알아서 Viewer 를 띄웁니다. 사람이 미리 켜 둘 필요가 없습니다.
  webServer: {
    command: "npm run dev",
    cwd: "./viewer",
    // url 대신 port 를 씁니다 — 로그인 기능이 생긴 뒤로 "/" 는 상황에 따라
    // 307(로그인으로 리다이렉트)이나 500(Supabase 환경변수 없음)을 돌려줄 수 있는데,
    // Playwright 는 url 로 확인할 때 5xx 를 "아직 안 떴다" 로 보고 계속 기다립니다.
    // 응답 상태와 상관없이 포트가 열렸는지만 보는 쪽이 더 안정적입니다.
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },

  projects: [
    // 다른 시험보다 먼저 돌아 로그인 세션을 e2e/.auth/user.json 에 저장합니다. (e2e/auth.setup.ts)
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
