/**
 * Viewer 의 **실제 사용 흐름**을 브라우저로 따라가 봅니다.
 *
 * ■ 무엇을 확인하는가
 *
 *   화면이 뜨는가 · 눌러서 옮겨 가는가 · 브라우저에서 오류가 나지 않는가
 *
 * 서버가 그려 준 HTML 만 봐서는 알 수 없는 것들입니다.
 *
 * ■ 무엇을 확인하지 않는가
 *
 * **자료의 내용은 확인하지 않습니다.** 수업자료는 사람마다 다르고,
 * 강사님 저작물을 시험 코드에 옮겨 적을 일도 아닙니다.
 * 그래서 "몇 건이 있다" 가 아니라 "화면이 제 일을 한다" 만 봅니다.
 */
import { expect, test, type Page } from "@playwright/test";

/** 브라우저 콘솔에 난 오류를 모읍니다 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  return errors;
}

/**
 * 화면이 자리를 잡을 때까지 기다립니다.
 *
 * 넓은 화면에서 사이드바가 붙는 것은 브라우저에서 화면 너비를 재고 나서입니다.
 * 그 전에는 본문이 사이드바가 놓일 자리에 잠깐 겹쳐 있습니다.
 * 사람은 눈 깜짝할 사이라 모르지만, 시험은 그 순간을 붙잡을 수 있습니다.
 * 그래서 자리가 잡힌 뒤에 누릅니다.
 */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    if (!main) return false;
    // 좁은 화면이면 본문이 맨 왼쪽에 오는 것이 정상입니다.
    if (window.innerWidth < 900) return true;
    // 넓은 화면이면 사이드바만큼 밀려 있어야 자리가 잡힌 것입니다.
    return main.getBoundingClientRect().x > 0;
  }, undefined, { timeout: 10_000 });
}

/** 자료가 아직 없는 상태인지 — 그것도 정상입니다 */
async function isEmptyState(page: Page): Promise<boolean> {
  return (await page.getByText("아직 자료가 없습니다").count()) > 0;
}

test.describe("화면이 뜬다", () => {
  test("홈에 들어가면 제목이 보인다", async ({ page }) => {
    const errors = watchErrors(page);

    await page.goto("/");

    // 페이지마다 <h1> 은 정확히 하나여야 합니다. (18단계에서 바로잡은 것)
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("수업자료 아카이브");

    expect(errors, `브라우저 오류: ${errors.join(" | ")}`).toEqual([]);
  });

  for (const [name, path] of [
    ["통합 학습자료", "/learn"],
    ["수업 방식 점검", "/compare"],
    ["다시 공부하기", "/study"],
  ] as const) {
    test(`${name} 화면이 뜬다`, async ({ page }) => {
      const errors = watchErrors(page);

      const response = await page.goto(path);

      expect(response?.status(), `${path} 가 오류를 냈습니다`).toBeLessThan(400);
      await expect(page.locator("h1")).toHaveCount(1);

      expect(errors, `브라우저 오류: ${errors.join(" | ")}`).toEqual([]);
    });
  }
});

test.describe("눌러서 옮겨 간다", () => {
  test("사이드바로 복습 화면까지 간다", async ({ page }) => {
    await page.goto("/");
    await settled(page);

    // 좁은 화면에서는 서랍이 접혀 있습니다. 열어야 보입니다.
    const menu = page.getByLabel(/메뉴|menu/i);
    if (await menu.isVisible().catch(() => false)) await menu.click();

    const link = page.getByRole("link", { name: /다시 공부하기/ }).first();
    await link.click();

    await expect(page).toHaveURL(/\/study/);
    await expect(page.locator("h1")).toContainText("다시 공부하기");
  });

  test("과목을 눌러 그 과목 화면으로 간다", async ({ page }) => {
    await page.goto("/");
    await settled(page);

    if (await isEmptyState(page)) test.skip(true, "아직 자료가 없어 건너뜁니다");

    const subject = page.locator('a[href^="/s/"]').first();
    await expect(subject).toBeVisible();
    await subject.click();

    await expect(page).toHaveURL(/\/s\//);
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("자료 하나를 열어 본다", async ({ page }) => {
    await page.goto("/learn");
    await settled(page);

    const material = page.locator('a[href^="/m/"]').first();
    if ((await material.count()) === 0) test.skip(true, "아직 학습자료가 없어 건너뜁니다");

    await material.click();

    await expect(page).toHaveURL(/\/m\//);
    await expect(page.locator("h1")).toHaveCount(1);
  });
});

test.describe("걸러 보기가 된다", () => {
  test("복습 우선순위로 좁혀 볼 수 있다", async ({ page }) => {
    await page.goto("/study");
    await settled(page);

    const filter = page.locator('a[href*="priority="]').first();
    if ((await filter.count()) === 0) test.skip(true, "아직 학습 설명이 없어 건너뜁니다");

    await filter.click();
    await expect(page).toHaveURL(/priority=/);
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("점검 화면을 상태로 좁혀 볼 수 있다", async ({ page }) => {
    await page.goto("/compare");
    await settled(page);

    const filter = page.locator('a[href*="status="]').first();
    if ((await filter.count()) === 0) test.skip(true, "아직 비교 결과가 없어 건너뜁니다");

    await filter.click();
    await expect(page).toHaveURL(/status=/);
  });
});

test.describe("좁은 화면에서도 볼 수 있다", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("휴대폰 크기에서 옆으로 넘치지 않는다", async ({ page }) => {
    await page.goto("/study");

    // 가로 스크롤이 생기면 글이 잘려 읽을 수 없습니다.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow, "가로로 넘칩니다").toBeLessThanOrEqual(2);
  });

  test("휴대폰에서도 제목이 보인다", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
  });
});

test.describe("없는 자료를 찾아도 죽지 않는다", () => {
  test("없는 자료 주소는 404 를 보여준다", async ({ page }) => {
    const response = await page.goto("/m/이런-자료는-없습니다");

    // 500 이 아니라 404 여야 합니다. 없는 것과 고장난 것은 다릅니다.
    expect(response?.status()).toBe(404);
  });

  test("없는 과목 주소도 404 를 보여준다", async ({ page }) => {
    const response = await page.goto("/s/이런-과목은-없습니다");
    expect(response?.status()).toBe(404);
  });
});
