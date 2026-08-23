/**
 * 15단계 설명이 **없는 사실을 말하지 않는지** 봅니다.
 *
 * ■ 여기서 지키려는 것
 *
 *   설명은 판정이 아닙니다. 판정을 옮긴 것입니다.
 *   옮기는 과정에서 말이 세지거나 약해지면, 그것이 곧 틀린 설명이 됩니다.
 *
 * 그래서 이 파일은 주로 **말이 세지지 않았는지**를 봅니다 —
 * 버전만 다른 것을 "못 쓴다" 고 하지 않았는지, 못 찾은 것을 "없어졌다" 고 하지 않았는지.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildGuide, buildStudyGuides, priorityOf } from "../src/study/study-builder.ts";
import type { ComparisonData, ComparisonItem } from "../src/store/comparison-store.ts";

const NOW = "2026-08-23T00:00:00.000Z";

/** 비교 항목 하나를 손쉽게 만듭니다. 필요한 칸만 채워 넣습니다. */
function item(overrides: Partial<ComparisonItem>): ComparisonItem {
  return {
    id: "api:test/thing",
    subject: "javascript",
    topic: "thing",
    kind: "api",
    status: "CURRENT",
    reason: "테스트",
    lessons: [],
    taughtIn: [],
    usedIn: [],
    evidence: [],
    lastComparedAt: NOW,
    ...overrides,
  };
}

/** 설명에 쓰인 글 전체를 한 덩어리로 — 어느 칸에 들어갔든 잡아냅니다 */
function allText(guide: ReturnType<typeof buildGuide>): string {
  return [
    guide.explanation,
    guide.lessonSummary ?? "",
    guide.statusSummary,
    guide.changeSummary,
    guide.studyPoint,
  ].join(" ");
}

describe("복습 우선순위 — 판정 기준", () => {
  it("changeType 마다 정해진 자리로 갑니다", () => {
    assert.equal(priorityOf("NONE"), "KEEP");
    assert.equal(priorityOf("VERSION_ONLY"), "CHECK");
    assert.equal(priorityOf("REVIEW_REQUIRED"), "CHECK");
    assert.equal(priorityOf("RECOMMENDED_CHANGED"), "RELEARN");
    assert.equal(priorityOf("API_CHANGED"), "RELEARN");
    assert.equal(priorityOf("DEPRECATED"), "REPLACE");
    assert.equal(priorityOf("REMOVED"), "REPLACE");
  });

  it("모르는 값이 와도 함부로 급하다고 하지 않습니다", () => {
    // 나중에 새 changeType 이 생겨도, 그것 때문에 멀쩡한 자료가
    // "다시 공부" 로 올라가면 안 됩니다.
    assert.equal(priorityOf("SOMETHING_NEW"), "KEEP");
  });
});

describe("VERSION_ONLY — 버전이 다르다고 못 쓰는 것이 아닙니다", () => {
  const guide = buildGuide(
    item({
      id: "pkg:zip1:react",
      subject: "react",
      topic: "react",
      kind: "package",
      status: "VERSION_GAP",
      changeType: "VERSION_ONLY",
      severity: "LOW",
      versions: { atLesson: "^18.2.0", latestInCourse: "^19.2.8", inThisProject: "^19.2.8" },
      evidence: [{ source: "버전 숫자", text: "수업 때 ^18.2.0 · 견준 대상 ^19.2.8" }],
    }),
    NOW,
  );

  it("확인하면서 복습 — 다시 공부까지 올리지 않습니다", () => {
    assert.equal(guide.learningPriority, "CHECK");
  });

  it("'못 쓴다'·'낡았다'·'잘못됐다' 고 말하지 않습니다", () => {
    const text = allText(guide);
    for (const forbidden of ["못 씁니다", "쓸 수 없", "낡았", "폐기", "더 이상 쓰지"]) {
      assert.ok(!text.includes(forbidden), `"${forbidden}" 가 들어갔습니다 — ${text}`);
    }
  });

  it("개념 학습에는 그대로 써도 된다고 알려 줍니다", () => {
    assert.ok(guide.studyPoint.includes("개념"));
    assert.ok(guide.studyPoint.includes("새 프로젝트"), "새로 만들 때는 확인하라고 알려야 합니다");
  });

  it("근거가 없으므로 권장 방식을 지어내지 않습니다", () => {
    assert.equal(guide.recommendedAlternative, undefined);
    assert.equal(guide.currentPattern, undefined);
    assert.equal(guide.oldPattern, undefined);
  });
});

describe("NOT_FOUND — 못 찾은 것이지 없어진 것이 아닙니다", () => {
  const guide = buildGuide(
    item({
      id: "gap:useNavigate",
      topic: "useNavigate",
      status: "NOT_FOUND",
      changeType: "REVIEW_REQUIRED",
      severity: "LOW",
      usedIn: [{ zipId: "z1", zipTitle: "router.zip", files: ["src/App.jsx"] }],
      evidence: [{ source: "확인하지 못한 까닭", text: "공식 문서를 찾지 못했습니다." }],
    }),
    NOW,
  );

  it("'삭제됨'·'제거됨'·'없어졌다' 고 말하지 않습니다", () => {
    const text = allText(guide);
    for (const forbidden of ["삭제되", "제거되었", "폐기", "사라졌습니다"]) {
      assert.ok(!text.includes(forbidden), `"${forbidden}" 가 들어갔습니다 — ${text}`);
    }
  });

  it("확인하지 못했다는 사실 자체를 알려 줍니다", () => {
    assert.ok(guide.explanation.includes("확인하지 못했다"));
    assert.ok(guide.changeSummary.includes("판단하기 어렵습니다"));
  });

  it("공식 문서를 직접 찾아보라고 안내합니다", () => {
    assert.ok(guide.studyPoint.includes("공식 문서를 직접"));
  });
});

describe("DEPRECATED — 이때는 분명히 알려야 합니다", () => {
  const note = "Do not use this element. Use the CSS Fonts properties to style text.";
  const guide = buildGuide(
    item({
      id: "api:html/font",
      subject: "html",
      topic: "<font>",
      status: "DEPRECATED",
      changeType: "DEPRECATED",
      severity: "HIGH",
      recommendedAlternative: note,
      taughtIn: [
        {
          materialId: "m1",
          title: "WSP_01_HTML.pdf",
          path: "materials/html/WSP_01_HTML.md",
          line: '<font face="verdana" size="2">',
        },
      ],
      official: {
        subject: "html",
        slug: "font",
        title: "<font>",
        sourceUrl: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/font",
        fetchedAt: "2026-08-23",
        contentHash: "sha256:x",
        docStatus: ["deprecated"],
      },
      evidence: [{ source: "공식 문서 상태", text: "status: deprecated" }],
    }),
    NOW,
  );

  it("새 방식으로 교체 — 가장 급한 자리로 갑니다", () => {
    assert.equal(guide.learningPriority, "REPLACE");
  });

  it("쓰지 말라고 밝혔다는 것을 분명히 적습니다", () => {
    assert.ok(guide.explanation.includes("더 이상 쓰지 말라고 밝혔습니다"));
    assert.ok(guide.changeSummary.includes("사용 중단"));
  });

  it("공식 문서가 적어 준 대안을 그대로 옮깁니다", () => {
    assert.equal(guide.recommendedAlternative, note, "문서 문장을 우리가 고쳐 쓰지 않습니다");
    assert.ok(guide.studyPoint.includes("Do not use this element."));
  });

  it("수업자료의 실제 줄을 '수업 당시' 코드로 씁니다", () => {
    assert.equal(guide.oldCode, '<font face="verdana" size="2">');
  });
});

describe("DEPRECATED 인데 대안이 없을 때 — 없는 대안을 만들지 않습니다", () => {
  const guide = buildGuide(
    item({
      topic: "somethingOld",
      status: "DEPRECATED",
      changeType: "DEPRECATED",
      severity: "HIGH",
      // recommendedAlternative 가 없습니다
    }),
    NOW,
  );

  it("권장 방식 칸을 비워 둡니다", () => {
    assert.equal(guide.recommendedAlternative, undefined);
    assert.equal(guide.currentPattern, undefined);
  });

  it("대안이 없다는 사실을 말합니다", () => {
    assert.ok(guide.studyPoint.includes("적어 두지는 않았습니다"));
  });
});

describe("NONE — 없는 경고를 만들지 않습니다", () => {
  const guide = buildGuide(
    item({
      topic: "align-items",
      subject: "css",
      status: "CURRENT",
      changeType: "NONE",
      severity: "NONE",
      official: {
        subject: "css",
        slug: "align-items",
        title: "align-items",
        sourceUrl: "https://developer.mozilla.org/en-US/docs/Web/CSS/align-items",
        fetchedAt: "2026-08-23",
        contentHash: "sha256:y",
        docStatus: [],
      },
    }),
    NOW,
  );

  it("그대로 복습", () => {
    assert.equal(guide.learningPriority, "KEEP");
  });

  it("경고하는 말이 들어가지 않습니다", () => {
    const text = allText(guide);
    for (const forbidden of ["주의", "위험", "사용 중단", "고쳐야", "바꿔야"]) {
      assert.ok(!text.includes(forbidden), `"${forbidden}" 가 들어갔습니다 — ${text}`);
    }
  });

  it("그렇다고 '영원히 안전하다' 고도 하지 않습니다", () => {
    // 우리가 본 것은 오늘 받아 온 문서 한 벌뿐입니다.
    assert.ok(guide.studyPoint.includes("앞으로도 바뀌지 않는다는 뜻은 아닙니다"));
  });

  it("코드 비교 칸을 만들지 않습니다", () => {
    assert.equal(guide.oldPattern, undefined);
    assert.equal(guide.currentPattern, undefined);
  });
});

describe("근거가 없으면 그 칸을 비웁니다", () => {
  it("수업자료에도 실습 코드에도 없으면 '수업에서 배운 내용' 을 쓰지 않습니다", () => {
    const guide = buildGuide(item({ topic: "orphan" }), NOW);
    assert.equal(guide.lessonSummary, undefined, "근거가 없는데 배웠다고 말하면 안 됩니다");
    assert.equal(guide.oldCode, undefined);
  });

  it("목차 링크 같은 줄은 '수업 당시 코드' 로 내밀지 않습니다", () => {
    const guide = buildGuide(
      item({
        topic: "align-items",
        taughtIn: [
          {
            materialId: "m1",
            title: "01_CSS GRID 핵심",
            path: "p",
            line: "| [Names lines](#bookmark=id.oniuae4dfdni) | [align-items](#bookmark=id.d70mxacz3lya) |",
          },
        ],
      }),
      NOW,
    );
    assert.equal(guide.oldCode, undefined, "읽어도 아무 내용이 없는 줄입니다");
  });

  it("데이터 파일에 든 낱말은 '수업 당시 코드' 로 내밀지 않습니다", () => {
    const guide = buildGuide(
      item({
        topic: "useNavigate",
        usedIn: [{ zipId: "z", zipTitle: "router.zip", files: ["public/data/blog.json"] }],
        evidence: [{ source: "실습 코드", text: '"title": "useNavigate로 페이지 이동하기",' }],
      }),
      NOW,
    );
    assert.equal(guide.oldCode, undefined);
    // 근거 목록에는 그대로 남아 있어야 합니다 — 지우지는 않습니다.
    assert.ok(guide.evidence.some((entry) => entry.text.includes("useNavigate")));
  });
});

describe("근거는 14단계 것을 그대로 씁니다", () => {
  it("설명이 근거를 새로 만들지 않습니다", () => {
    const evidence = [
      { source: "공식 문서 상태", text: "status: deprecated", where: "https://example.org" },
      { source: "실습 코드", text: "document.write(str1);" },
    ];
    const guide = buildGuide(
      item({ topic: "document.write", changeType: "DEPRECATED", status: "DEPRECATED", evidence }),
      NOW,
    );
    assert.deepEqual(guide.evidence, evidence);
  });
});

describe("전체를 옮길 때", () => {
  const comparisons: ComparisonData = {
    version: 1,
    generatedAt: NOW,
    summary: { total: 3, byStatus: {}, officialDocs: 0, practiceZips: 0, needsReview: 0 },
    items: [
      item({
        id: "a",
        topic: "keep-me",
        changeType: "NONE",
        lessons: [{ materialId: "m1", title: "자료1", path: "p1" }],
      }),
      item({
        id: "b",
        topic: "drop-me",
        changeType: "DEPRECATED",
        status: "DEPRECATED",
        lessons: [{ materialId: "m1", title: "자료1", path: "p1" }],
      }),
      item({
        id: "c",
        topic: "check-me",
        changeType: "VERSION_ONLY",
        kind: "package",
        versions: { atLesson: "^1.0.0", latestInCourse: "^2.0.0", inThisProject: null },
        lessons: [{ materialId: "m2", title: "자료2", path: "p2" }],
      }),
    ],
  };

  const data = buildStudyGuides(comparisons, NOW);

  it("비교 항목 하나에 설명 하나", () => {
    assert.equal(data.guides.length, 3);
    assert.equal(data.summary.total, 3);
  });

  it("자료의 우선순위는 그 안에서 가장 급한 것을 따릅니다", () => {
    const material = data.materials.find((entry) => entry.materialId === "m1");
    assert.ok(material);
    // 자료1 에는 KEEP 하나와 REPLACE 하나가 있습니다.
    assert.equal(material.priority, "REPLACE", "하나라도 손볼 것이 있으면 알려야 합니다");
    assert.equal(material.counts.KEEP, 1);
    assert.equal(material.counts.REPLACE, 1);
  });

  it("어느 비교에서 왔는지 되짚을 수 있습니다", () => {
    for (const guide of data.guides) {
      assert.ok(comparisons.items.some((entry) => entry.id === guide.comparisonId));
    }
  });

  it("어느 비교 결과를 보고 만들었는지 적어 둡니다", () => {
    assert.equal(data.comparisonsGeneratedAt, NOW);
  });

  it("AI 설명 칸은 기본 생성에서 비어 있습니다", () => {
    // 외부 AI 없이 돌아가야 하므로, 기본 경로가 이 칸을 채우면 안 됩니다.
    for (const guide of data.guides) assert.equal(guide.aiExplanation, undefined);
  });
});
