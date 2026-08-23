/**
 * 18단계 — 민감정보 검사가 **제 일을 하는지**, 그리고 **제 일을 넘지 않는지** 봅니다.
 *
 * ■ 두 방향을 다 봅니다
 *
 *   찾아야 할 것을 찾는가          — 토큰·키·개인 키 블록
 *   찾지 말아야 할 것을 안 찾는가   — 빈 값, 예시 문자열, 그냥 낱말
 *
 * 과한 경고는 경고가 아닙니다. 자료가 온통 빨간 줄이 되면 아무도 보지 않게 됩니다.
 * (14·15단계에서 배운 것과 같습니다)
 *
 * ■ 여기 쓰인 값은 전부 **지어낸 것**입니다
 *
 * 실제 자료에서 발견된 문자열은 **하나도 옮겨 오지 않았습니다.**
 * 모양만 흉내 낸 가짜입니다.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mask, scanText, summarize } from "../src/security/secret-scanner.ts";

const NEWLINE = String.fromCodePoint(10);
const lines = (...parts: string[]): string => parts.join(NEWLINE);

/** 모양만 흉내 낸 가짜 값들 — 실제 자료에서 가져온 것이 아닙니다 */
const FAKE = {
  github: `ghp_${"A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"}`, // ghp_ + 36자
  aws: "AKIAABCDEFGHIJKLMNOP",
  openai: `sk-${"abcdefghijklmnopqrstuvwxyz012345"}`,
  google: `AIza${"SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q"}`,
  slack: "xoxb-1234567890-abcdefghij",
};

describe("찾아야 할 것", () => {
  it("GitHub 토큰 모양을 찾습니다", () => {
    const found = scanText(`const token = "${FAKE.github}";`, "a.ts");

    assert.equal(found.length, 1);
    assert.equal(found[0]?.patternId, "github-token");
    assert.equal(found[0]?.confidence, "high");
  });

  it("AWS·OpenAI·Google·Slack 키도 찾습니다", () => {
    for (const [name, value] of Object.entries(FAKE)) {
      if (name === "github") continue;
      const found = scanText(`key = "${value}"`, "a.ts");
      assert.ok(found.length >= 1, `${name} 을 찾지 못했습니다`);
    }
  });

  it("개인 키 블록을 찾습니다", () => {
    const found = scanText(
      lines("-----BEGIN RSA PRIVATE KEY-----", "MIIEow...", "-----END RSA PRIVATE KEY-----"),
      "key.pem",
    );
    assert.equal(found.length, 1);
    assert.equal(found[0]?.patternId, "private-key");
  });

  it("값이 채워진 자격증명 대입문을 찾습니다", () => {
    const found = scanText('const apiKey = "a1b2c3d4e5f6g7h8";', "config.ts");
    assert.equal(found[0]?.patternId, "credential-assignment");
    assert.equal(found[0]?.confidence, "medium", "이쪽은 오탐이 있을 수 있어 '보통' 입니다");
  });

  it("몇 번째 줄인지 알려 줍니다", () => {
    const found = scanText(lines("첫 줄", "둘째 줄", `token = "${FAKE.github}"`), "a.ts");
    assert.equal(found[0]?.line, 3);
  });
});

describe("찾지 말아야 할 것", () => {
  it("빈 값은 잡지 않습니다 — .env.example 의 정상 모습입니다", () => {
    assert.deepEqual(scanText("GITHUB_TOKEN=", ".env.example"), []);
    assert.deepEqual(scanText('const apiKey = "";', "a.ts"), []);
  });

  it("밑줄이 든 예시 문자열은 GitHub 토큰이 아닙니다", () => {
    // 실제 토큰은 ghp_ + 영숫자 36자입니다. 밑줄이 들어가면 모양이 다릅니다.
    const found = scanText('process.env.GITHUB_TOKEN = "ghp_example_not_a_real_token";', "t.ts");
    assert.equal(
      found.filter((entry) => entry.patternId === "github-token").length,
      0,
      "우리 테스트 파일의 예시 값이 잡히면 안 됩니다",
    );
  });

  it("낱말만 나온 것은 잡지 않습니다", () => {
    assert.deepEqual(scanText("이 문서는 password 정책을 설명합니다.", "doc.md"), []);
    assert.deepEqual(scanText("// TODO: api key 를 환경변수로 옮기기", "a.ts"), []);
  });

  it("짧은 값은 잡지 않습니다 — 자리표시자일 가능성이 큽니다", () => {
    assert.deepEqual(scanText('const password = "1234";', "a.ts"), []);
  });

  it("아무것도 없으면 빈 목록입니다", () => {
    assert.deepEqual(scanText("const total = items.length;", "a.ts"), []);
  });
});

describe("값을 내보내지 않습니다", () => {
  it("가린 형태에는 앞 네 글자만 남습니다", () => {
    const masked = mask(FAKE.github);

    assert.ok(masked.startsWith("ghp_"), "종류는 알아볼 수 있어야 합니다");
    assert.equal(masked.includes(FAKE.github.slice(4, 12)), false, "본문이 새어 나가면 안 됩니다");
    assert.ok(masked.includes("*"));
  });

  it("검사 결과 어디에도 원래 값이 없습니다", () => {
    const found = scanText(`token = "${FAKE.github}"`, "a.ts");
    const serialized = JSON.stringify(found);

    assert.equal(
      serialized.includes(FAKE.github),
      false,
      "결과를 그대로 로그에 찍어도 안전해야 합니다",
    );
    assert.equal(serialized.includes(FAKE.github.slice(4)), false);
  });

  it("요약에도 값이 담기지 않습니다", () => {
    const found = scanText(
      lines(`a = "${FAKE.github}"`, `b = "${FAKE.aws}"`, `c = "${FAKE.aws}"`),
      "a.ts",
    );
    const found2 = summarize(found);

    assert.equal(JSON.stringify(found2).includes(FAKE.aws), false);
    assert.equal(found2.total, 3);
    assert.equal(found2.high, 3);
    assert.equal(found2.byLabel[0]?.count, 2, "많은 것부터 보여 줍니다");
  });

  it("짧은 값도 통째로 드러내지 않습니다", () => {
    assert.equal(mask("abcdefgh"), "abcd****");
  });
});
