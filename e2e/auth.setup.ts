/**
 * 다른 시험이 시작하기 전에 딱 한 번, 로그인해서 세션을 파일로 저장해 둡니다.
 *
 * 로그인 기능이 생기면서 모든 화면이 로그인을 요구하게 되었습니다.
 * 시험마다 매번 로그인하면 느리고, 로그인 자체를 시험할 것도 아니므로
 * 여기서 한 번 로그인해 두고 나머지 시험은 그 세션을 그대로 재사용합니다.
 *
 * E2E_SUPABASE_EMAIL / E2E_SUPABASE_PASSWORD 가 없으면 (처음 받은 사람은 없는 게 정상입니다)
 * 로그인 없이 빈 세션을 저장합니다 — 로그인이 필요한 시험은 그때 알아서 건너뜁니다.
 * (playwright.config.ts 의 "setup" 프로젝트 · e2e/viewer.spec.ts 의 beforeEach 참고)
 */
import { test as setup } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

export const STORAGE_STATE = "e2e/.auth/user.json";

setup("로그인 상태를 저장해 둔다", async ({ page }) => {
  await mkdir("e2e/.auth", { recursive: true });

  const email = process.env.E2E_SUPABASE_EMAIL;
  const password = process.env.E2E_SUPABASE_PASSWORD;

  if (!email || !password) {
    await writeFile(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, "E2E_SUPABASE_EMAIL / E2E_SUPABASE_PASSWORD 가 없어 로그인 없이 건너뜁니다.");
  }

  await page.goto("/login");
  await page.getByLabel("이메일").fill(email!);
  await page.getByLabel("비밀번호").fill(password!);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL("/");

  await page.context().storageState({ path: STORAGE_STATE });
});
