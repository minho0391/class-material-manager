/**
 * 14단계 판정이 **틀리게 확정하지 않는지** 봅니다.
 *
 * ■ 여기서 지키려는 것 하나
 *
 *   "모르겠다"는 결과가 "틀린 확정"보다 낫습니다.
 *
 * 그래서 이 파일의 시험 대부분은 "무엇을 찾아냈는가" 가 아니라
 * **"무엇을 함부로 단정하지 않았는가"** 를 봅니다.
 *
 * 여기 적힌 글은 모두 실제로 겪은 오탐에서 왔습니다.
 * 13단계에서 `justify-content` 가 "더 이상 사용할 수 있는 공간" 이라는 문장 때문에
 * 사용 중단으로 잡혔고, `<table>` 은 문서 안 "Deprecated attributes" 라는 소제목 때문에
 * 통째로 사용 중단이 되었습니다.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { analyze } from "../src/compare/change-analyzer.ts";
import { readDocStatus } from "../src/enrich/doc-status.ts";
import { isVendorPath, looksMinified } from "../src/relate/relator.ts";

const NEWLINE = String.fromCodePoint(10);
const lines = (...parts: string[]): string => parts.join(NEWLINE);

describe("공식 문서 상태 읽기 — 낱말에 속지 않기", () => {
  it("front matter 의 status 만 사용 중단으로 봅니다", () => {
    const markdown = lines(
      "---",
      "title: <font>",
      "status:",
      "  - deprecated",
      "---",
      "",
      "본문",
    );
    assert.deepEqual(readDocStatus(markdown).flags, ["deprecated"]);
  });

  it("본문에 'removed' 가 그냥 쓰였다고 제거로 보지 않습니다", () => {
    // 실제 문장입니다. 요소가 사라졌다는 말이 전혀 아닙니다.
    const markdown = lines(
      "---",
      "title: Element.remove()",
      "---",
      "",
      "The element is removed from the DOM when this method is called.",
      "Once removed, it can be inserted again elsewhere.",
    );
    assert.deepEqual(readDocStatus(markdown).flags, []);
  });

  it("'no longer' 가 다른 뜻으로 쓰인 문장에 넘어가지 않습니다", () => {
    const markdown = lines(
      "---",
      "title: justify-content",
      "---",
      "",
      "The items are placed so that there is no longer any free space between them.",
    );
    assert.deepEqual(readDocStatus(markdown).flags, []);
  });

  it("'Deprecated attributes' 소제목이 있다고 요소 자체를 사용 중단으로 보지 않습니다", () => {
    // `<table>` 이 이것 때문에 통째로 사용 중단이 되었습니다.
    // 속성 몇 개가 사용 중단인 것과 요소가 사용 중단인 것은 다른 이야기입니다.
    const markdown = lines(
      "---",
      "title: <table>",
      "---",
      "",
      "## Attributes",
      "",
      "### Deprecated attributes",
      "",
      "The following attributes are deprecated. Do not use them.",
      "",
      "- `align`",
      "- `bgcolor`",
    );
    assert.deepEqual(readDocStatus(markdown).flags, []);
  });

  it("소제목 아래의 <Deprecated> 는 그 절의 사정으로 둡니다", () => {
    // react.dev 의 `Component` 페이지가 그렇습니다.
    // 페이지 아래쪽 `componentWillMount` 절 하나가 옛것인데,
    // 이것 때문에 `Component` 자체가 사용 중단으로 잡히고,
    // 클래스형 컴포넌트를 가르친 수업자료가 "당장 고쳐야 함" 이 되었습니다.
    const markdown = lines(
      "---",
      "title: Component",
      "---",
      "",
      "# Component",
      "",
      "We recommend defining components as functions instead of classes.",
      "",
      "## Reference",
      "",
      "### componentWillMount",
      "",
      "<Deprecated>",
      "",
      "This API has been renamed from componentWillMount to UNSAFE_componentWillMount.",
      "",
      "</Deprecated>",
    );

    assert.deepEqual(readDocStatus(markdown).flags, []);
  });

  it("머리말의 <Deprecated> 는 문서 자신에 대한 말이므로 인정합니다", () => {
    const markdown = lines(
      "---",
      "title: findDOMNode",
      "---",
      "",
      "# findDOMNode",
      "",
      "<Deprecated>",
      "",
      "This API will be removed in a future major version of React.",
      "",
      "</Deprecated>",
      "",
      "## Reference",
    );

    const status = readDocStatus(markdown);
    assert.deepEqual(status.flags, ["deprecated"]);
    assert.ok(status.note?.includes("removed in a future major version"));
  });

  it("NOTE 상자는 경고로 세지 않습니다 (WARNING·CAUTION 만 봅니다)", () => {
    const markdown = lines(
      "---",
      "title: <script>",
      "---",
      "",
      "> [!NOTE]",
      "> This element was deprecated in an earlier draft, but is standard today.",
    );
    assert.equal(readDocStatus(markdown).flags.length, 0);
  });
});

describe("변화 판정 — 근거가 있을 때만 확정", () => {
  it("버전 메이저가 달라도 API_CHANGED 로 올리지 않습니다", () => {
    // 이 프로젝트가 늘 부딪히는 자리입니다. React 18 → 19 는 숫자만으로는 아무것도 뜻하지 않습니다.
    const result = analyze({
      docStatus: [],
      docMissing: false,
      subject: "react",
      code: "const root = createRoot(document.getElementById('root'));",
      versionGap: { atLesson: "^18.2.0", comparedTo: "^19.2.8", majorDiffers: true },
    });

    assert.equal(result.changeType, "VERSION_ONLY");
    assert.equal(result.severity, "LOW");
    assert.equal(result.oldPattern, undefined, "근거가 없으면 예전 방식을 지어내지 않습니다");
    assert.equal(result.recommendedAlternative, undefined);
    assert.ok(
      result.evidence.some((item) => item.text.includes("버전 숫자만으로는")),
      "왜 확정하지 않았는지 근거에 남아야 합니다",
    );
  });

  it("대응표에 있어도 코드에 그 방식이 없으면 잡지 않습니다", () => {
    const result = analyze({
      docStatus: [],
      docMissing: false,
      subject: "react",
      code: "createRoot(container).render(<App />);",
      versionGap: { atLesson: "^17.0.0", comparedTo: "^19.2.8", majorDiffers: true },
    });

    assert.equal(result.changeType, "VERSION_ONLY");
  });

  it("코드에 예전 방식이 실제로 있으면 그때 잡습니다", () => {
    const result = analyze({
      docStatus: [],
      docMissing: false,
      subject: "react",
      code: "ReactDOM.render(<App />, document.getElementById('root'));",
    });

    assert.equal(result.changeType, "REMOVED");
    assert.equal(result.severity, "HIGH");
    assert.ok(result.oldPattern, "무엇이 예전 방식인지 적혀 있어야 합니다");
    assert.ok(
      result.evidence.some((item) => item.where?.startsWith("https://")),
      "공식 문서 주소가 근거로 붙어 있어야 합니다",
    );
  });

  it("예전 방식과 현재 방식이 함께 있으면 사람에게 넘깁니다", () => {
    const result = analyze({
      docStatus: [],
      docMissing: false,
      subject: "react",
      code: lines(
        "// 옮기는 중",
        "ReactDOM.render(<Old />, a);",
        "createRoot(b).render(<New />);",
      ),
    });

    assert.equal(result.changeType, "REVIEW_REQUIRED");
    assert.ok(result.evidence.some((item) => item.source === "근거 충돌"));
  });

  it("공식 문서를 못 찾으면 '없어졌다' 가 아니라 '확인 못 했다' 입니다", () => {
    const result = analyze({ docStatus: [], docMissing: true, subject: "javascript" });

    assert.equal(result.changeType, "REVIEW_REQUIRED");
    assert.notEqual(result.changeType, "REMOVED");
    assert.ok(result.evidence.some((item) => item.text.includes("없어졌다는 뜻이 아니라")));
  });

  it("아무 표시도 없는 문서는 그대로 쓸 수 있다고 봅니다", () => {
    const result = analyze({ docStatus: [], docMissing: false, subject: "css" });

    assert.equal(result.changeType, "NONE");
    assert.equal(result.severity, "NONE");
  });

  it("front matter 가 deprecated 면 문서가 적어 준 대안만 옮깁니다", () => {
    const note = "Authors are encouraged to use the clip-path property instead.";
    const result = analyze({
      docStatus: ["deprecated"],
      docStatusNote: note,
      docMissing: false,
      subject: "css",
    });

    assert.equal(result.changeType, "DEPRECATED");
    assert.equal(result.recommendedAlternative, note, "우리가 지어내지 않고 문서 문장을 그대로 씁니다");
  });

  it("experimental·non-standard 는 사용 중단이 아니라 '봐야 함' 입니다", () => {
    const result = analyze({
      docStatus: ["experimental"],
      docMissing: false,
      subject: "css",
    });

    assert.equal(result.changeType, "REVIEW_REQUIRED");
    assert.notEqual(result.changeType, "DEPRECATED");
  });
});

describe("남의 라이브러리 코드는 수업에서 배운 방식이 아닙니다", () => {
  it("이름과 자리로 알아봅니다", () => {
    for (const path of [
      "js/lib/iscroll-probe.js",
      "js/highlight.pack.js",
      "assets/vendor/swiper.js",
      "js/jquery-3.6.0.js",
      "css/aos.css",
      "dist/app.bundle.js",
      "js/slick.min.js",
    ]) {
      assert.equal(isVendorPath(path), true, path);
    }
  });

  it("수업에서 쓴 코드는 그대로 둡니다", () => {
    for (const path of [
      "A/01_variant1.html",
      "css/main.css",
      "src/App.jsx",
      "08-module/namespace.ts",
      "js/demo.js",
    ]) {
      assert.equal(isVendorPath(path), false, path);
    }
  });

  it("이름이 멀쩡해도 압축된 코드는 생김새로 알아봅니다", () => {
    const minified = `!function(e,t){${"a=1;".repeat(200)}}(this);`;
    assert.equal(looksMinified(minified), true);
    assert.equal(looksMinified(lines("const a = 1;", "console.log(a);")), false);
  });
});
