/**
 * 19단계 — VT(줄바꿈 표식) 없이 한 줄로 뭉쳐진 코드 박스 처리.
 *
 * VT 가 없으면 원래 줄 위치를 알 수 없습니다. 그래서 줄을 추측해 나누지 않고,
 * 코드라는 확신이 설 때만(`looksLikeCode`) 원문을 **한 글자도 바꾸지 않고**
 * 코드펜스로 감쌉니다. 화면에서의 줄바꿈은 뷰어 CSS(`white-space: pre-wrap`) 담당이고
 * 저장 텍스트에는 개행을 넣지 않습니다.
 *
 * 이 파일이 지키는 것:
 *   - 원문 코드 내용(문자 순서·공백)이 변형되지 않는다
 *   - 일반 산문·안내문·JSON 을 코드로 오판하지 않는다
 *   - 주석·regex·문자열·JSX·TS 타입 등 경계에서 원문을 훼손하지 않는다
 *   - 기존 VT 경로와 2칸 표 동작은 그대로다
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { convertBoxedContent, looksLikeCode } from "../src/store/markdown-cleanup.ts";

/** 1칸짜리 표(박스) 한 개를 만든다. */
const table = (cell: string): string => `| ${cell} |\n| :---- |`;

/** Markdown 이 붙인 역슬래시(`\=` `\<` `\[` …)만 걷어낸 값. src 의 unescapeMarkdown 과 같은 규칙. */
const unescape = (s: string): string => s.replace(/\\([^A-Za-z0-9\s])/g, "$1");

/** convertBoxedContent 결과에서 첫 코드펜스 안의 내용을 꺼낸다. */
function fencedBody(markdown: string): string {
  const lines = convertBoxedContent(markdown).text.split("\n");
  const open = lines.indexOf("```");
  assert.notEqual(open, -1, "코드펜스가 없습니다");
  const close = lines.indexOf("```", open + 1);
  assert.notEqual(close, -1, "코드펜스가 닫히지 않았습니다");
  return lines.slice(open + 1, close).join("\n");
}

describe("원문 코드 내용은 변형되지 않는다", () => {
  it("코드펜스 안 내용 = 원문에서 Markdown 이스케이프만 걷어낸 것 (정확히 일치)", () => {
    const code =
      "import a from './a'; import b from './b'; const x \\= build(a, b, { debug: true }); run(x); done(x);";
    assert.equal(fencedBody(table(code)), unescape(code));
  });

  it("줄바꿈을 삽입하지 않는다 — 저장 텍스트는 여전히 한 줄", () => {
    const code =
      "const s \\= 1; function f() { return s + 1; } const t \\= f(); const u \\= t * 2; log(s, t, u);";
    const body = fencedBody(table(code));
    assert.ok(!body.includes("\n"), `개행이 삽입됨: ${JSON.stringify(body)}`);
    assert.equal(body, unescape(code));
  });

  it("연속된 공백과 문자 순서를 그대로 둔다 (공백 압축·재배치 없음)", () => {
    const code =
      "const   x \\=    1;   const y \\= 2;   const z \\= 3;   doThing(x,   y,   z);   cleanup(x);";
    const body = fencedBody(table(code));
    assert.equal(body, unescape(code));
  });

  it("`//` 주석 뒤의 코드를 주석 안으로 넣지 않는다 (예전 reflow 회귀)", () => {
    const code =
      "const a \\= 1; // keep the previous value here const b \\= 2; console.log(a + b); const c \\= a + b + 1;";
    const body = fencedBody(table(code));
    assert.equal(body, unescape(code));
    // `const b = 2;` 는 여전히 실행 코드다 — 주석 본문으로 흡수되지 않았다.
    assert.ok(body.includes("const b = 2;"));
    assert.ok(!body.includes("\n"));
  });

  it("regex 리터럴을 쪼개거나 깨뜨리지 않는다", () => {
    const code =
      "const rx \\= /a;b/gi; const ok \\= rx.test(inputValue); log(ok); log(rx.source); reset(rx);";
    const body = fencedBody(table(code));
    assert.equal(body, unescape(code));
    assert.ok(body.includes("/a;b/gi"));
  });

  it("TS 타입 리터럴을 블록처럼 재배치하지 않는다", () => {
    const code =
      "const cfg: { host: string; port: number } \\= { host: 'a', port: 1 }; start(cfg); stop(cfg);";
    assert.equal(fencedBody(table(code)), unescape(code));
  });

  it("JSX 표현식과 화살표 함수를 그대로 둔다", () => {
    const code =
      "const L \\= () \\=> { return items.map(x \\=> <li key\\={x}>{x}</li>); }; render(<L />); mount(L);";
    assert.equal(fencedBody(table(code)), unescape(code));
  });

  it("문자열 안의 세미콜론·중괄호를 건드리지 않는다", () => {
    const code =
      "const msg \\= 'a; b{c}; d'; const tpl \\= `x; y {z}`; console.log(msg, tpl); send(msg);";
    assert.equal(fencedBody(table(code)), unescape(code));
  });
});

describe("일반 텍스트를 코드로 오판하지 않는다", () => {
  it("세미콜론을 문장부호로 쓰는 영어 안내문은 표 그대로 둔다", () => {
    const prose =
      "Read these notes carefully; do not rename the project folder; submit only the final document after every screenshot has been checked twice.";
    const result = convertBoxedContent(table(prose));
    assert.equal(looksLikeCode(prose), false);
    assert.equal(result.converted, 0);
    assert.equal(result.keptSingle, 1);
    assert.ok(result.text.includes("| Read these notes"));
  });

  it("세미콜론이 있는 한국어 산문도 표 그대로 둔다", () => {
    const prose =
      "이 과제에서는 다음을 확인합니다; 폴더 이름을 바꾸지 말 것; 최종 문서만 제출할 것; 스크린샷이 모두 포함되었는지 검토할 것.";
    assert.equal(looksLikeCode(prose), false);
    assert.equal(convertBoxedContent(table(prose)).converted, 0);
  });

  it("키워드가 우연히 섞인 산문도 대입·호출·화살표가 없으면 코드가 아니다", () => {
    const prose =
      "Please return the signed form to the new class monitor; note the submission deadline; bring your own pen and paper for the session.";
    assert.equal(looksLikeCode(prose), false);
  });

  it("세미콜론 없는 안내문은 그대로 둔다", () => {
    const result = convertBoxedContent(
      table("public/ favicon.ico, index.html, manifest.json, robots.txt만 남기고, 이미지 제거 src/ logo 제거"),
    );
    assert.equal(result.converted, 0);
    assert.equal(result.keptSingle, 1);
  });

  it("짧은 명령어 한 줄은 그대로 둔다 (나눌 것이 없다)", () => {
    const result = convertBoxedContent(table("npm install react-bootstrap bootstrap"));
    assert.equal(result.converted, 0);
    assert.equal(result.keptSingle, 1);
  });

  it("JSON 객체는 세미콜론이 없으므로 코드로 보지 않는다", () => {
    const json =
      '{ "name": "홍길동", "age": 20, "city": "서울", "roles": ["admin", "user"], "active": true, "score": 99 }';
    assert.equal(looksLikeCode(json), false);
    assert.equal(convertBoxedContent(table(json)).converted, 0);
  });
});

describe("코드는 원문 그대로 코드펜스로 감싼다", () => {
  it("import·문장이 세미콜론으로 이어진 긴 박스는 코드펜스가 된다", () => {
    const code =
      "import React from 'react'; import ReactDOM from 'react-dom/client'; const root \\= ReactDOM.createRoot(document.getElementById('root')); root.render(1);";
    const result = convertBoxedContent(table(code));
    assert.equal(result.converted, 1);
    assert.equal(result.keptSingle, 0);
    assert.equal(fencedBody(table(code)), unescape(code));
  });

  it("CSS 규칙 블록도 코드펜스가 된다", () => {
    const code =
      ".container { display: flex; flex-direction: row; justify-content: space-between; align-items: center; }";
    assert.equal(looksLikeCode(code), true);
    assert.equal(fencedBody(table(code)), code);
  });

  it("변환 결과를 다시 넣어도 그대로다 (idempotent)", () => {
    const code = "const a \\= 1; const b \\= 2; const c \\= a + b; render(c); flush();";
    const once = convertBoxedContent(table(code)).text;
    const twice = convertBoxedContent(once).text;
    assert.equal(twice, once);
  });
});

describe("기존 VT 경로·2칸 표는 바뀌지 않는다", () => {
  it("VT 로 나뉜 박스는 예전처럼 줄 단위로 정확히 복원된다", () => {
    const VT = String.fromCharCode(11);
    const result = convertBoxedContent(table(`var a \\= 1;${VT}var b \\= 2;${VT}var c \\= 3;`));
    assert.equal(result.converted, 1);
    assert.equal(result.keptSingle, 0);
    assert.ok(result.text.includes("var a = 1;\nvar b = 2;\nvar c = 3;"));
  });

  it("2칸 이상 표는 세미콜론이 많고 길어도 손대지 않는다", () => {
    const markdown =
      "| 이름 | 설명 |\n| --- | --- |\n| foo | a; b; c; d; 이 설명 문장은 일부러 길게 이어 붙여서 팔십 자를 넘기도록 계속 씁니다 정말로요 |";
    const result = convertBoxedContent(markdown);
    assert.equal(result.converted, 0);
    assert.equal(result.keptTable, 1);
    assert.equal(result.text, markdown);
  });

  it("VT 없고 코드도 아닌 1칸 표는 keptSingle 로 남는다", () => {
    const markdown = table("이것은 그냥 한 줄짜리 설명입니다 별다른 코드 기호가 없습니다 그래서 표로 남습니다");
    const result = convertBoxedContent(markdown);
    assert.equal(result.keptSingle, 1);
    assert.equal(result.text, markdown);
  });
});
