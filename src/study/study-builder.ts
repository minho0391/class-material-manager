/**
 * 14단계의 판정을 **공부하는 사람의 말**로 옮깁니다.
 *
 * ■ 여기서 하지 않는 일
 *
 * **판정하지 않습니다.** `changeType`·`severity`·`oldPattern`·`currentPattern` 은
 * 전부 14단계가 이미 정해 둔 것을 그대로 받아 씁니다.
 * 이 파일이 하는 일은 그것을 문장으로 바꾸는 것뿐입니다.
 *
 * ■ 지키는 규칙 하나
 *
 *   **자료에 없는 사실을 문장에 넣지 않습니다.**
 *
 * 문장에 들어가는 구체적인 값은 전부 비교 결과에서 꺼내 옵니다.
 * 우리가 아는 일반 지식을 슬쩍 얹지 않습니다. 예를 들어
 * "React 19 부터는 `use` 훅이 생겼습니다" 같은 말은 **적지 않습니다.**
 * 그 사실이 맞더라도 우리 자료에 근거가 없기 때문입니다.
 *
 * 근거가 모자라면 이렇게 적습니다 —
 * **"현재 확보된 자료만으로는 판단하기 어렵습니다."**
 *
 * ■ 왜 AI 를 쓰지 않는가
 *
 * 이 프로그램은 나중에 Claude 없이도 돌아가야 합니다.
 * 그래서 설명은 규칙 기반 template 으로 만듭니다. 값만 끼워 넣습니다.
 * 말맛은 덜하지만, **틀린 말을 지어낼 자리가 없습니다.**
 * 나중에 AI 설명을 얹고 싶으면 `StudyGuide.aiExplanation` 칸이 비어 있습니다.
 */
import type { ComparisonData, ComparisonItem } from "../store/comparison-store.ts";
import {
  LEARNING_PRIORITY,
  type LearningPriority,
  type StudyData,
  type StudyGuide,
  type StudyMaterial,
} from "../store/study-store.ts";

/**
 * `changeType` → 복습 우선순위.
 *
 * **판정 기준을 여기 한곳에만 적어 둡니다.** 화면도 README 도 이 표를 가리킵니다.
 *
 *   NONE                → KEEP     달라진 것이 확인되지 않음
 *   VERSION_ONLY        → CHECK    버전만 다름 (사용법이 달라졌다는 근거 없음)
 *   REVIEW_REQUIRED     → CHECK    확인하지 못했거나 근거가 엇갈림
 *   RECOMMENDED_CHANGED → RELEARN  공식 문서가 다른 방식을 권함
 *   API_CHANGED         → RELEARN  쓰는 방법이 달라짐
 *   DEPRECATED          → REPLACE  쓰지 말라고 밝힘
 *   REMOVED             → REPLACE  없어졌다고 밝힘
 *
 * `VERSION_ONLY` 가 `CHECK` 인 것이 이 표의 핵심입니다.
 * 버전이 다르다는 이유로 `RELEARN` 에 넣으면, 멀쩡한 수업자료 24건이
 * "다시 공부해야 할 것" 이 되어 버립니다. 그것은 사실이 아닙니다.
 */
export function priorityOf(changeType: string): LearningPriority {
  switch (changeType) {
    case "DEPRECATED":
    case "REMOVED":
      return LEARNING_PRIORITY.REPLACE;
    case "API_CHANGED":
    case "RECOMMENDED_CHANGED":
      return LEARNING_PRIORITY.RELEARN;
    case "VERSION_ONLY":
    case "REVIEW_REQUIRED":
      return LEARNING_PRIORITY.CHECK;
    default:
      return LEARNING_PRIORITY.KEEP;
  }
}

/** 우선순위를 사람이 읽을 말로 */
export const PRIORITY_LABEL: Record<LearningPriority, string> = {
  KEEP: "그대로 복습",
  CHECK: "확인하면서 복습",
  RELEARN: "다시 공부",
  REPLACE: "새 방식으로 교체",
};

/** 우선순위의 뜻 — 화면에도 그대로 씁니다 */
export const PRIORITY_MEANING: Record<LearningPriority, string> = {
  KEEP: "공식 문서가 따로 경고를 달지 않았습니다. 수업자료를 그대로 다시 봐도 됩니다.",
  CHECK: "개념은 그대로 쓸 수 있지만, 버전 차이가 있거나 우리가 확인하지 못한 것이 있습니다.",
  RELEARN: "사용법이나 공식 문서가 권하는 방식이 달라졌습니다. 그 부분만 다시 보면 됩니다.",
  REPLACE: "공식 문서가 쓰지 말라고 했거나 없어졌다고 밝혔습니다. 새 방식을 중심으로 공부하세요.",
};

/** 급한 순서 — 자료 단위로 묶을 때 무엇을 대표로 삼을지 정합니다 */
const PRIORITY_ORDER: LearningPriority[] = ["REPLACE", "RELEARN", "CHECK", "KEEP"];

function worseOf(a: LearningPriority, b: LearningPriority): LearningPriority {
  return PRIORITY_ORDER.indexOf(a) <= PRIORITY_ORDER.indexOf(b) ? a : b;
}

/**
 * 수업자료 본문에서 뽑아 온 줄이 **보여 줄 만한 것인지** 봅니다.
 *
 * 강사 자료는 Google 문서라 목차 링크와 표가 잔뜩 섞여 있습니다.
 * 그런 줄을 "수업에서 이렇게 배웠습니다" 라고 내밀면 공부에 도움이 되기는커녕
 * 무슨 말인지 알 수 없습니다. 실제로 이런 것들이 걸립니다 —
 *
 *   | [image grid](#bookmark=id.37tw…) | [Names lines](#bookmark=id.oniu…) |
 *   | align-items |   |
 *
 * 그래서 목차 링크가 든 줄과 빈 표 칸은 걸러 냅니다.
 */
function isReadableLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 200) return false;

  // 문서 안쪽으로 가는 목차 링크 — 읽어도 아무 내용이 없습니다.
  if (/\]\(#(bookmark=|id\.|h\.)/.test(trimmed)) return false;

  // 표 한 줄인데 칸이 거의 비어 있는 것 (`| align-items |   |`)
  if (trimmed.startsWith("|")) {
    const cells = trimmed.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length <= 2 && cells.join("").length < 30) return false;
  }

  return true;
}

/**
 * 공식 문서가 적어 둔 대안을 **문장 안에 넣을 만한 길이**로 줄입니다.
 *
 * `document.write` 의 대안 문구는 HTML 명세 인용까지 딸려 와 900자가 넘습니다.
 * 그것을 "공부 포인트" 한 줄에 통째로 넣으면 읽을 수가 없습니다.
 * 그래서 여기서는 **첫 문장만** 씁니다. 전문은 `recommendedAlternative` 칸과
 * 근거 목록에 그대로 남아 있으니 잘려 나가는 사실은 없습니다.
 */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  const stop = trimmed.search(/[.。](\s|$)/);
  const cut = stop === -1 ? trimmed : trimmed.slice(0, stop + 1);
  return cut.length > 220 ? `${cut.slice(0, 220)}…` : cut;
}

/** 수업자료에서 이 주제가 나온 줄 중 읽을 만한 것 하나 */
function lessonLineOf(item: ComparisonItem): { title: string; line: string } | undefined {
  for (const taught of item.taughtIn) {
    if (taught.line && isReadableLine(taught.line)) {
      return { title: taught.title, line: taught.line.trim() };
    }
  }
  return undefined;
}

/**
 * 데이터 파일인지 봅니다 — `.json`·`.md`·`.txt` 는 코드가 아니라 **내용**입니다.
 *
 * `useNavigate` 가 `public/data/blog.json` 의 `"title": "useNavigate로 페이지 이동하기"` 에서
 * 걸린 적이 있습니다. 낱말이 들어 있는 것은 맞지만, 그것을 "수업 때 이렇게 썼습니다" 라고
 * 코드 자리에 내밀면 공부하는 사람을 헷갈리게 합니다. 근거 목록에는 그대로 남겨 둡니다.
 */
function isDataFile(path: string): boolean {
  return /\.(json|md|txt|csv|xml|yml|yaml)$/i.test(path);
}

/** 실습 코드에서 이 주제가 쓰인 줄 (14단계가 근거로 남겨 둔 것) */
function practiceLineOf(item: ComparisonItem): string | undefined {
  const firstFile = item.usedIn[0]?.files[0];
  if (firstFile && isDataFile(firstFile)) return undefined;

  const found = item.evidence.find((entry) => entry.source === "실습 코드");
  return found && isReadableLine(found.text) ? found.text.trim() : undefined;
}

/** "1. 수업에서 배운 내용" — 근거가 있을 때만 씁니다 */
function buildLessonSummary(item: ComparisonItem): string | undefined {
  const taught = lessonLineOf(item);
  if (taught) {
    return `강사 설명자료 「${taught.title}」 에 나옵니다.`;
  }

  const site = item.usedIn[0];
  if (site) {
    const file = site.files[0];
    const where = file ? `${site.zipTitle} 의 ${file}` : site.zipTitle;

    // 패키지는 코드에 "쓰인" 것이 아니라 package.json 에 "적힌" 것입니다.
    if (item.kind === "package") return `실습파일 ${where} 에 적혀 있습니다.`;

    const more = item.usedIn.length > 1 ? ` (실습파일 ${item.usedIn.length}개에서 쓰였습니다)` : "";
    return `실습파일 ${where} 에서 쓰였습니다.${more}`;
  }

  // 설명자료에도 실습 코드에도 근거가 없으면 아무 말도 하지 않습니다.
  return undefined;
}

/** "2. 현재 상태" */
function buildStatusSummary(item: ComparisonItem): string {
  if (item.kind === "package" && item.versions) {
    const compared = item.versions.latestInCourse ?? item.versions.inThisProject;
    return compared
      ? `수업 때 ${item.versions.atLesson} · 견준 대상 ${compared}`
      : `수업 때 ${item.versions.atLesson} · 견줄 대상을 찾지 못했습니다`;
  }

  if (!item.official) {
    return "우리가 가진 공식 문서에서 찾지 못했습니다.";
  }

  const flags = item.official.docStatus;
  if (flags.length > 0) {
    return `공식 문서 「${item.official.title}」 가 \`status: ${flags.join(", ")}\` 라고 밝혔습니다.`;
  }

  return `공식 문서 「${item.official.title}」 에 상태 표시가 없습니다.`;
}

/** 지금 이 자리에서 다른 표현이 필요한지 — NOT_FOUND 는 "확인 못 함" 이지 "없어짐" 이 아닙니다 */
function isNotFound(item: ComparisonItem): boolean {
  return item.status === "NOT_FOUND";
}

/**
 * "3. 무엇이 달라졌는가" 와 "6. 지금 다시 공부할 때의 포인트".
 *
 * 여기가 15단계의 전부입니다. `changeType` 마다 말투가 다릅니다.
 * **어느 갈래에서도 자료에 없는 사실을 새로 쓰지 않습니다.**
 */
function buildChangeAndStudy(item: ComparisonItem): {
  explanation: string;
  changeSummary: string;
  studyPoint: string;
} {
  const topic = `\`${item.topic}\``;

  switch (item.changeType) {
    // ── 달라진 것이 확인되지 않음 ──
    case "RECOMMENDED_CHANGED":
      return {
        explanation:
          `${topic} 은 수업 때 쓴 방식도 아직 돌아갑니다. ` +
          `다만 공식 문서가 다른 방식을 권합니다.`,
        changeSummary: item.currentPattern
          ? `공식 문서가 권하는 방식이 ${item.currentPattern} 로 바뀌었습니다.`
          : "공식 문서가 다른 방식을 권합니다.",
        studyPoint:
          `수업 코드를 읽고 이해하는 데는 문제가 없습니다. ` +
          `다시 쓸 때 아래 "현재 방식" 으로 옮겨 보면 됩니다.`,
      };

    case "API_CHANGED":
      return {
        explanation:
          `${topic} 은 쓰는 방법 자체가 달라졌습니다. ` +
          `수업 코드를 그대로 옮겨 쓰면 지금 방식과 어긋납니다.`,
        changeSummary:
          item.oldPattern && item.currentPattern
            ? `${item.oldPattern} → ${item.currentPattern}`
            : "사용법이 달라졌습니다.",
        studyPoint:
          `수업 코드에서 이 부분을 찾아 아래 "현재 방식" 으로 바꿔 보며 익히세요. ` +
          `개념 자체가 사라진 것은 아니라 옮겨 쓰는 연습이면 됩니다.`,
      };

    case "DEPRECATED":
      return {
        explanation:
          `수업에서 ${topic} 을 다뤘습니다. ` +
          `지금 공식 문서는 이것을 더 이상 쓰지 말라고 밝혔습니다.`,
        changeSummary: "공식 문서가 사용 중단을 밝혔습니다.",
        studyPoint: item.recommendedAlternative
          ? `수업자료를 읽는 것은 괜찮지만, 새로 쓰는 코드에서는 그대로 따라 쓰지 않는 것이 좋습니다. ` +
            `공식 문서는 이렇게 적어 두었습니다 — "${firstSentence(item.recommendedAlternative)}"`
          : `수업자료를 읽는 것은 괜찮지만, 새로 쓰는 코드에서는 그대로 따라 쓰지 않는 것이 좋습니다. ` +
            `다만 공식 문서가 무엇으로 대신하라고 적어 두지는 않았습니다.`,
      };

    case "REMOVED":
      return {
        explanation:
          `공식 문서가 ${topic} 이 제거되었다고 밝혔습니다. ` +
          `수업 코드를 그대로 쓰면 동작하지 않을 수 있습니다.`,
        changeSummary:
          item.oldPattern && item.currentPattern
            ? `${item.oldPattern} 은 없어졌습니다. 지금은 ${item.currentPattern} 입니다.`
            : "공식 문서가 제거되었다고 밝혔습니다.",
        studyPoint:
          `이 부분은 수업 방식을 그대로 익히기보다 ` +
          `아래 "현재 방식" 을 중심으로 공부하는 편이 낫습니다.`,
      };

    case "VERSION_ONLY": {
      const atLesson = item.versions?.atLesson ?? "";
      const compared = item.versions?.latestInCourse ?? item.versions?.inThisProject ?? "";

      return {
        explanation:
          `수업 때 ${topic} ${atLesson} 을 썼고, 견준 대상은 ${compared} 입니다. ` +
          `메이저 숫자는 다르지만, 사용법이 달라졌다는 근거는 찾지 못했습니다.`,
        changeSummary:
          `버전 숫자만 다릅니다. 코드에서 바뀐 사용법은 확인되지 않았습니다.`,
        studyPoint:
          `개념을 익히는 데는 수업자료를 그대로 써도 됩니다. ` +
          `버전 숫자가 다르다는 것만으로 수업 방식이 잘못됐다고 볼 수 없습니다. ` +
          `다만 새 프로젝트에 적용할 때는 그때의 공식 문서를 함께 보세요.`,
      };
    }

    case "REVIEW_REQUIRED":
      if (isNotFound(item)) {
        return {
          explanation:
            `우리가 가진 공식 문서에서 ${topic} 을 찾지 못했습니다. ` +
            `없어졌다는 뜻이 아니라, 확인하지 못했다는 뜻입니다.`,
          changeSummary:
            "달라졌는지 그대로인지, 현재 확보된 자료만으로는 판단하기 어렵습니다.",
          studyPoint:
            `수업 코드에서 어떻게 쓰였는지는 볼 수 있습니다. ` +
            `지금도 같은 방식인지는 ${topic} 의 공식 문서를 직접 찾아 확인해 보세요.`,
        };
      }

      return {
        explanation:
          `${topic} 은 근거가 서로 엇갈리거나 모자랍니다. ` +
          `확정하지 않고 남겨 두었습니다.`,
        changeSummary: "근거가 엇갈립니다. 현재 확보된 자료만으로는 판단하기 어렵습니다.",
        studyPoint:
          `아래 "직접 확인할 근거" 를 읽어 보고, 어느 쪽이 맞는지 사람이 판단해야 하는 자리입니다.`,
      };

    // ── NONE ──
    default:
      if (item.kind === "package") {
        return {
          explanation:
            `수업 때 쓴 ${topic} ${item.versions?.atLesson ?? ""} 과 견준 대상의 메이저 버전이 같습니다.`,
          changeSummary: "버전 차이가 없습니다.",
          studyPoint: "수업자료를 그대로 다시 봐도 됩니다.",
        };
      }

      return {
        explanation:
          `수업에서 다룬 ${topic} 은 지금 공식 문서에서도 그대로 확인됩니다. ` +
          `문서가 따로 경고를 달지 않았습니다.`,
        changeSummary: "달라진 점이 확인되지 않았습니다.",
        // "영원히 안전하다" 고 말하지 않습니다. 우리가 본 것은 **오늘 받아 온 문서 한 벌**뿐입니다.
        studyPoint:
          `수업자료를 그대로 다시 봐도 됩니다. ` +
          `다만 이것은 "우리가 확인한 공식 문서 기준" 이라는 뜻이지, 앞으로도 바뀌지 않는다는 뜻은 아닙니다.`,
      };
  }
}

/**
 * 비교 결과 하나를 학습 설명 하나로 바꿉니다.
 */
export function buildGuide(item: ComparisonItem, now: string): StudyGuide {
  const { explanation, changeSummary, studyPoint } = buildChangeAndStudy(item);

  const taught = lessonLineOf(item);
  const practiced = practiceLineOf(item);

  return {
    comparisonId: item.id,
    subject: item.subject,
    topic: item.topic,
    kind: item.kind,
    learningPriority: priorityOf(item.changeType ?? "NONE"),

    changeType: item.changeType ?? "NONE",
    severity: item.severity ?? "NONE",
    status: item.status,

    explanation,
    lessonSummary: buildLessonSummary(item),
    statusSummary: buildStatusSummary(item),
    changeSummary,

    // 14단계가 확인한 것만 옮깁니다. 없으면 만들지 않습니다.
    oldPattern: item.oldPattern,
    // 수업자료의 줄을 먼저 쓰고, 없으면 실습 코드의 줄을 씁니다. 둘 다 없으면 비웁니다.
    oldCode: taught?.line ?? practiced,
    currentPattern: item.currentPattern,
    recommendedAlternative: item.recommendedAlternative,

    studyPoint,
    // 근거는 14단계 것을 그대로 씁니다. 여기서 새로 만들지 않습니다.
    evidence: item.evidence,

    materials: item.lessons.length > 0 ? item.lessons : item.taughtIn.map((t) => ({
      materialId: t.materialId,
      title: t.title,
      path: t.path,
    })),
    practice: item.usedIn.map((site) => ({
      zipId: site.zipId,
      zipTitle: site.zipTitle,
      files: site.files,
    })),
    versions: item.versions,

    updatedAt: now,
  };
}

/**
 * 수업자료 하나를 두고 "이 자료 그냥 다시 공부해도 되나" 에 답할 묶음을 만듭니다.
 *
 * 자료의 우선순위는 **그 안에서 가장 급한 것**을 따릅니다.
 * 사용 중단이 하나라도 있으면 그 자료는 `REPLACE` 입니다 — 나머지가 멀쩡해도요.
 * 공부하는 사람이 알아야 하는 것은 "여기 손봐야 할 게 있다" 는 사실이기 때문입니다.
 */
function rollUpMaterials(guides: StudyGuide[], subjectOf: Map<string, string>): StudyMaterial[] {
  const byMaterial = new Map<string, StudyMaterial>();

  for (const guide of guides) {
    for (const material of guide.materials) {
      const existing = byMaterial.get(material.materialId) ?? {
        materialId: material.materialId,
        title: material.title,
        subject: subjectOf.get(material.materialId) ?? guide.subject,
        path: material.path,
        priority: LEARNING_PRIORITY.KEEP as LearningPriority,
        counts: { KEEP: 0, CHECK: 0, RELEARN: 0, REPLACE: 0 },
        topics: [],
      };

      // 같은 주제가 두 번 들어가지 않게 합니다.
      if (existing.topics.some((entry) => entry.comparisonId === guide.comparisonId)) continue;

      existing.counts[guide.learningPriority]++;
      existing.priority = worseOf(existing.priority, guide.learningPriority);
      existing.topics.push({
        comparisonId: guide.comparisonId,
        topic: guide.topic,
        priority: guide.learningPriority,
      });

      byMaterial.set(material.materialId, existing);
    }
  }

  for (const material of byMaterial.values()) {
    material.topics.sort(
      (a, b) =>
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
        a.topic.localeCompare(b.topic, "ko"),
    );
  }

  return [...byMaterial.values()];
}

/**
 * 비교 결과 전체를 학습 설명으로 옮깁니다.
 *
 * @param comparisons 14단계 결과 — 이 함수는 여기 담긴 것만 씁니다
 * @param now         만든 때 (테스트에서 고정할 수 있게 밖에서 받습니다)
 */
export function buildStudyGuides(comparisons: ComparisonData, now: string): StudyData {
  const guides = comparisons.items.map((item) => buildGuide(item, now));

  // 자료가 어느 과목 것인지는 비교 항목의 과목을 따릅니다.
  const subjectOf = new Map<string, string>();
  for (const item of comparisons.items) {
    for (const lesson of [...item.lessons, ...item.taughtIn]) {
      if (!subjectOf.has(lesson.materialId)) subjectOf.set(lesson.materialId, item.subject);
    }
  }

  const materials = rollUpMaterials(guides, subjectOf);

  const byPriority: Record<string, number> = {};
  for (const guide of guides) {
    byPriority[guide.learningPriority] = (byPriority[guide.learningPriority] ?? 0) + 1;
  }

  return {
    version: 1,
    generatedAt: now,
    comparisonsGeneratedAt: comparisons.generatedAt,
    summary: {
      total: guides.length,
      byPriority,
      materials: materials.length,
    },
    guides,
    materials,
  };
}
