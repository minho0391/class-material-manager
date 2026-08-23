/**
 * 18단계 — Google 문서 지문이 **일회용 토큰 때문에 흔들리지 않는지** 봅니다.
 *
 * ■ 두 방향이 다 맞아야 합니다
 *
 *   토큰만 바뀜   → 같은 지문   (헛되이 "바뀌었다" 고 하지 않기)
 *   본문이 바뀜   → 다른 지문   (진짜 변화를 놓치지 않기)
 *
 * 앞엣것만 맞추면 변화를 못 보게 되고, 뒤엣것만 맞추면 지금 문제가 그대로입니다.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { normalizeForHash, stripVolatileTokens } from "../src/detect/normalize.ts";
import { contentHash } from "../src/detect/hash.ts";

const NEWLINE = String.fromCodePoint(10);
const lines = (...parts: string[]): string => parts.join(NEWLINE);

/** 같은 문서를 두 번 받았을 때 Google 이 돌려주는 모양 — 토큰만 다릅니다 */
const 받은적1 = lines(
  "# github desktop 사용법",
  "",
  "[https://github.com/new](https://www.google.com/url?q=https://github.com/new&sa=D&source=editors&ust=1787481650142548&usg=AOvVaw2KoDLLOaKjvpcjkxIM4ew4)",
  "",
  "![](https://docs.google.com/docs-images-rt/ALKuzta6a001q2KDBSHtoB2mXl74XdaOdd=s2048)",
  "",
  "브랜치를 만들고 작업합니다.",
);

const 받은적2 = lines(
  "# github desktop 사용법",
  "",
  "[https://github.com/new](https://www.google.com/url?q=https://github.com/new&sa=D&source=editors&ust=1787481690303266&usg=AOvVaw0cM9I9WcUwx8tDPiWbp6-E)",
  "",
  "![](https://docs.google.com/docs-images-rt/ALKuztZI2k2CUZBvOsIVw0CBIQcGrWzY=s2048)",
  "",
  "브랜치를 만들고 작업합니다.",
);

const fingerprint = (text: string): string => contentHash(normalizeForHash(text));

describe("토큰만 바뀌면 같은 문서로 봅니다", () => {
  it("두 번 받아도 지문이 같습니다", () => {
    // 17단계까지는 이것이 매번 달라져서, refresh 를 돌릴 때마다
    // 이 문서 하나가 "바뀌었다" 로 잡히고 다시 저장·분류되었습니다.
    assert.equal(fingerprint(받은적1), fingerprint(받은적2));
  });

  it("감싼 주소는 속에 든 진짜 주소로 바뀝니다", () => {
    const stripped = stripVolatileTokens(받은적1);

    assert.ok(stripped.includes("https://github.com/new"), "진짜 주소는 남아야 합니다");
    assert.equal(stripped.includes("ust="), false);
    assert.equal(stripped.includes("usg="), false);
    assert.equal(stripped.includes("google.com/url?q="), false);
  });

  it("그림 주소는 자리표시자로 바뀝니다", () => {
    const stripped = stripVolatileTokens(받은적1);

    assert.ok(stripped.includes("[일회용-토큰]"));
    assert.equal(stripped.includes("ALKuzta6a001q2KDBSHt"), false);
  });
});

describe("본문이 바뀌면 반드시 다른 문서로 봅니다", () => {
  it("글이 바뀌면 지문이 달라집니다", () => {
    const 바뀐본문 = 받은적1.replace("브랜치를 만들고 작업합니다.", "브랜치를 만들고 pull request 를 올립니다.");
    assert.notEqual(fingerprint(받은적1), fingerprint(바뀐본문));
  });

  it("**링크가 가리키는 곳**이 바뀌면 지문이 달라집니다", () => {
    // 여기가 핵심입니다. 껍데기만 버리고 뜻은 지켰다는 증거입니다.
    const 링크바뀜 = 받은적1.replace(
      "q=https://github.com/new&",
      "q=https://github.com/settings&",
    );
    assert.notEqual(fingerprint(받은적1), fingerprint(링크바뀜));
  });

  it("문단이 늘어나면 지문이 달라집니다", () => {
    const 문단추가 = lines(받은적1, "", "충돌이 나면 이렇게 해결합니다.");
    assert.notEqual(fingerprint(받은적1), fingerprint(문단추가));
  });

  it("제목이 바뀌면 지문이 달라집니다", () => {
    const 제목바뀜 = 받은적1.replace("# github desktop 사용법", "# GitHub Desktop 사용법 v3");
    assert.notEqual(fingerprint(받은적1), fingerprint(제목바뀜));
  });
});

describe("토큰이 없는 문서는 건드리지 않습니다", () => {
  it("평범한 글은 그대로입니다", () => {
    const 보통 = lines("# CSS Grid", "", "`grid-template-columns` 로 열을 나눕니다.");
    assert.equal(stripVolatileTokens(보통), 보통);
  });

  it("일반 주소는 그대로 둡니다", () => {
    const 문서 = "자세히는 [MDN](https://developer.mozilla.org/ko/docs/Web/CSS/grid) 을 보세요.";
    assert.equal(stripVolatileTokens(문서), 문서);
  });

  it("예전 정규화 동작은 그대로입니다", () => {
    // 줄 끝 공백·CRLF·빈 줄 정리는 이전과 같아야 합니다.
    const 지저분 = "첫 줄   \r\n\r\n\r\n\r\n둘째 줄\t\r\n";
    assert.equal(normalizeForHash(지저분), lines("첫 줄", "", "둘째 줄"));
  });
});
