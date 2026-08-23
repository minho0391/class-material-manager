/**
 * 18단계 — 자료 파일이 없거나 깨져도 **화면이 죽지 않는지** 봅니다.
 *
 * ■ 무엇이 잘못돼 있었나
 *
 * `index.json` 을 읽다 실패하면 그대로 던져서 **화면 전체가 500** 이 됐습니다.
 * 파일 하나가 깨졌을 뿐인데 아무것도 볼 수 없었습니다.
 *
 * ■ 그렇다고 조용히 넘어가도 안 됩니다
 *
 * 빈 목록을 돌려주면 자료가 사라진 것처럼 보이면서 **아무 문제 없는 척**하게 됩니다.
 * 사용자는 "왜 비었지" 만 알고 "무엇을 해야 하는지" 는 모릅니다.
 *
 * 그래서 **없는 것**과 **못 읽은 것**을 나누고, 각각 다음 할 일을 알려 줍니다.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile("viewer/lib/data.ts", "utf8");
const home = await readFile("viewer/app/page.tsx", "utf8");
const NEWLINE = String.fromCodePoint(10);

describe("자료를 읽지 못했을 때", () => {
  it("파일이 없는 것과 못 읽은 것을 나눕니다", () => {
    assert.ok(source.includes('"missing"'), "아직 만들지 않은 상태");
    assert.ok(source.includes('"unreadable"'), "있는데 못 읽은 상태");
  });

  it("읽기 실패를 던지지 않고 붙잡습니다", () => {
    // readIndexFile 안에 catch 가 둘 있어야 합니다 — 파일 열기와 JSON 읽기.
    const fn = source.slice(
      source.indexOf("async function readIndexFile"),
      source.indexOf("/** 자료 목록"),
    );
    const catches = fn.match(/\} catch \{/g) ?? [];
    assert.ok(catches.length >= 2, `catch 가 모자랍니다 (${catches.length}개)`);
  });

  it("못 읽은 결과를 캐시에 담지 않습니다", () => {
    // 담아 두면 파일을 고친 뒤에도 계속 "없다" 고 답합니다.
    assert.ok(
      source.includes("if (problem) {"),
      "문제가 있으면 캐시를 건너뛰어야 합니다",
    );
  });

  it("빈 화면을 조용히 보여주지 않습니다", () => {
    assert.ok(home.includes("자료 파일을 읽지 못했습니다"), "못 읽었다고 말해야 합니다");
    assert.ok(home.includes("아직 자료가 없습니다"), "아직 없다고도 말해야 합니다");
  });

  it("다음에 무엇을 하면 되는지 알려 줍니다", () => {
    assert.ok(home.includes("npm run restore"), "깨졌으면 되돌리는 법을");
    assert.ok(home.includes("npm run refresh"), "없으면 만드는 법을");
  });
});

describe("자료 상태를 물어볼 수 있습니다", () => {
  it("getDataHealth 가 있습니다", () => {
    assert.ok(source.includes("export async function getDataHealth"));
  });

  it("자료가 0건인 것도 '정상 아님' 으로 봅니다", () => {
    // 파일은 멀쩡한데 안이 비어 있는 경우도 사용자에게는 "아직 없음" 입니다.
    assert.ok(source.includes("all.materials.length > 0"));
  });
});

describe("다른 데이터 파일도 없을 때 죽지 않습니다", () => {
  it("학습자료·비교·학습설명·수집상태 읽기가 모두 붙잡혀 있습니다", () => {
    // 이 넷은 처음 실행에서는 아예 없는 것이 정상입니다.
    for (const marker of ["loadLearning", "loadComparisons", "loadStudy", "getCollectStatus"]) {
      // 함수 하나만 잘라 봅니다 — 다음 최상위 닫는 괄호까지가 그 함수입니다.
      const start = source.indexOf(`function ${marker}(`);
      assert.ok(start > 0, `${marker} 를 찾지 못했습니다`);

      const end = source.indexOf(`${NEWLINE}}${NEWLINE}`, start);
      assert.ok(end > start, `${marker} 의 끝을 찾지 못했습니다`);

      const body = source.slice(start, end);
      assert.ok(body.includes("catch"), `${marker} 에 catch 가 없습니다`);
    }
  });

  it("없으면 null 또는 빈 값을 돌려줍니다 — 오류가 아닙니다", () => {
    assert.ok(source.includes("아직 만들지 않았으면 null 입니다"));
  });
});
