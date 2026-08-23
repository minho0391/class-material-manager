/**
 * "그래서 내 코드를 고쳐야 하나" 를 정하는 부분.
 *
 * ■ 13단계와 무엇이 다른가
 *
 * 13단계는 **상태**를 말했습니다 — 그대로 쓸 수 있나, 사용 중단인가, 버전이 다른가.
 * 그런데 `VERSION_GAP` 은 "메이저 숫자가 다르다"는 사실만 알려 줍니다.
 * 숫자가 달라도 코드는 그대로 돌아갈 수 있고, 숫자가 같아도 권장 방식이 바뀔 수 있습니다.
 *
 * 14단계는 그 위에 **변화의 종류와 무게**를 얹습니다.
 *
 * ■ 근거의 순서
 *
 * 아무 문장이나 근거로 삼지 않습니다. 믿을 만한 순서가 정해져 있습니다.
 *
 *   1. 공식 문서 front matter 의 `status:`        ← 기계가 읽으라고 만든 칸
 *   2. 공식 문서가 못박은 경고 상자 (WARNING)
 *   3. 공식 대응표에 적힌 "예전 방식 → 현재 방식"  ← 주소가 반드시 붙어 있음
 *   4. package.json 의 버전 숫자
 *
 * 여기 없는 것은 근거가 아닙니다. 본문에서 낱말을 찾는 방식은 쓰지 않습니다.
 *
 * ■ 어긋나면 미룹니다
 *
 * "공식 문서는 멀쩡하다는데 버전은 두 단계나 낮다" 처럼 근거가 서로 다른 곳을 가리키면
 * 확정하지 않고 `REVIEW_REQUIRED` 로 남기고, **왜 어긋났는지도 함께 적습니다.**
 */
import {
  API_CHANGES,
  CHANGE_TYPE,
  severityOf,
  type ApiChange,
  type ChangeType,
  type Severity,
} from "../config/api-changes.ts";
import type { Evidence } from "../store/comparison-store.ts";

/** 판정에 넣어 줄 재료 */
export interface AnalysisInput {
  /** 공식 문서가 밝힌 상태 (없으면 빈 배열) */
  docStatus: string[];
  /** 문서가 적어 둔 경고 문장 */
  docStatusNote?: string;
  /** 공식 문서를 아예 찾지 못했는지 */
  docMissing: boolean;

  /** 버전 비교 결과 (패키지 항목일 때) */
  versionGap?: {
    atLesson: string;
    comparedTo: string;
    /** 메이저가 실제로 다른지 */
    majorDiffers: boolean;
  };

  /** 이 항목과 얽힌 실습 코드 전체 (예전 방식이 들어 있는지 확인용) */
  code?: string;
  /** 어느 과목인지 — 대응표를 고를 때 씁니다 */
  subject: string;
}

/** 판정 결과 */
export interface Analysis {
  changeType: ChangeType;
  severity: Severity;
  /** 왜 그렇게 보았는지 한 줄 */
  summary: string;
  /** 수업 때 쓴 방식 (확인된 경우만) */
  oldPattern?: string;
  /** 지금 방식 (공식 문서가 말한 경우만) */
  currentPattern?: string;
  /** 무엇으로 바꾸면 되는지 (공식 문서가 말한 경우만) */
  recommendedAlternative?: string;
  /** 판정에 쓴 근거 */
  evidence: Evidence[];
}

/**
 * 공식 대응표에서 이 코드에 실제로 들어 있는 예전 방식을 찾습니다.
 *
 * **코드에 있을 때만** 돌려줍니다. 버전 숫자만 보고 "아마 이럴 것이다" 하지 않습니다.
 */
function findOldPattern(code: string, subject: string): ApiChange | null {
  for (const change of API_CHANGES) {
    if (change.subject && !subject.startsWith(change.subject)) continue;
    if (!change.detect.test(code)) continue;
    return change;
  }
  return null;
}

/**
 * 변화의 종류와 무게를 정합니다.
 */
export function analyze(input: AnalysisInput): Analysis {
  const evidence: Evidence[] = [];

  // ── 1순위: 공식 문서가 front matter 에 적어 둔 상태 ──
  const deprecated =
    input.docStatus.includes("deprecated") || input.docStatus.includes("obsolete");

  if (deprecated) {
    evidence.push({
      source: "공식 문서 상태 (front matter)",
      text: `status: ${input.docStatus.join(", ")}` + (input.docStatusNote ? ` — ${input.docStatusNote}` : ""),
    });

    // 공식 문서가 "대신 이것을 쓰라"고 적어 두었으면 그대로 옮깁니다.
    // 우리가 지어내지 않고, 문서가 쓴 문장을 그대로 씁니다.
    return {
      changeType: CHANGE_TYPE.DEPRECATED,
      severity: severityOf(CHANGE_TYPE.DEPRECATED),
      summary: "공식 문서가 사용 중단을 밝혔습니다",
      recommendedAlternative: input.docStatusNote,
      evidence,
    };
  }

  if (input.docStatus.includes("experimental") || input.docStatus.includes("non-standard")) {
    evidence.push({
      source: "공식 문서 상태 (front matter)",
      text: `status: ${input.docStatus.join(", ")}`,
    });
    return {
      changeType: CHANGE_TYPE.REVIEW_REQUIRED,
      severity: severityOf(CHANGE_TYPE.REVIEW_REQUIRED),
      summary: "공식 문서가 실험적·비표준이라고 밝혔습니다. 그대로 믿고 쓰기 어렵습니다",
      evidence,
    };
  }

  // ── 3순위: 공식 대응표 (코드에 예전 방식이 실제로 있을 때만) ──
  const matched = input.code ? findOldPattern(input.code, input.subject) : null;

  if (matched) {
    const alsoUsesCurrent = matched.currentDetect?.test(input.code ?? "") ?? false;

    evidence.push({
      source: `공식 문서 (${matched.technology})`,
      text: matched.officialSays,
      where: matched.officialUrl,
    });

    // 예전 방식과 현재 방식이 **둘 다** 보이면 옮기는 중일 수 있습니다.
    // 어느 쪽이라 단정하지 않고 사람에게 넘깁니다.
    if (alsoUsesCurrent) {
      evidence.push({
        source: "근거 충돌",
        text: `코드에 예전 방식(${matched.oldPattern})과 현재 방식(${matched.currentPattern})이 함께 있습니다`,
      });
      return {
        changeType: CHANGE_TYPE.REVIEW_REQUIRED,
        severity: severityOf(CHANGE_TYPE.REVIEW_REQUIRED),
        summary: "예전 방식과 현재 방식이 코드에 함께 있습니다",
        oldPattern: matched.oldPattern,
        currentPattern: matched.currentPattern,
        evidence,
      };
    }

    const changeType =
      matched.kind === "removed"
        ? CHANGE_TYPE.REMOVED
        : matched.kind === "deprecated"
          ? CHANGE_TYPE.DEPRECATED
          : CHANGE_TYPE.RECOMMENDED_CHANGED;

    return {
      changeType,
      severity: severityOf(changeType),
      summary:
        matched.kind === "recommended"
          ? "공식 문서가 다른 방식을 권합니다"
          : "공식 문서가 이 방식이 제거·중단되었다고 밝혔습니다",
      oldPattern: matched.oldPattern,
      currentPattern: matched.currentPattern,
      recommendedAlternative: matched.currentPattern,
      evidence,
    };
  }

  // ── 4순위: 버전 숫자 ──
  if (input.versionGap?.majorDiffers) {
    evidence.push({
      source: "버전 숫자",
      text: `수업 때 ${input.versionGap.atLesson} · 견준 대상 ${input.versionGap.comparedTo}`,
    });
    evidence.push({
      source: "사용법 변화 근거",
      text: "코드에서 바뀐 사용법을 찾지 못했습니다. 버전 숫자만으로는 고쳐야 한다고 볼 수 없습니다.",
    });

    return {
      changeType: CHANGE_TYPE.VERSION_ONLY,
      severity: severityOf(CHANGE_TYPE.VERSION_ONLY),
      summary: "버전은 다르지만, 사용법이 달라졌다는 근거는 찾지 못했습니다",
      evidence,
    };
  }

  // ── 공식 문서를 아예 못 찾은 경우 ──
  if (input.docMissing) {
    evidence.push({
      source: "확인하지 못한 까닭",
      text: "공식 문서를 찾지 못했습니다. 없어졌다는 뜻이 아니라, 우리가 확인하지 못했다는 뜻입니다.",
    });
    return {
      changeType: CHANGE_TYPE.REVIEW_REQUIRED,
      severity: severityOf(CHANGE_TYPE.REVIEW_REQUIRED),
      summary: "공식 문서를 찾지 못해 확인하지 못했습니다",
      evidence,
    };
  }

  // ── 아무 근거도 나오지 않음 ──
  evidence.push({
    source: "공식 문서 상태",
    text: "문서에 아무 표시가 없습니다 (경고 없음)",
  });

  return {
    changeType: CHANGE_TYPE.NONE,
    severity: severityOf(CHANGE_TYPE.NONE),
    summary: "달라진 것이 확인되지 않았습니다",
    evidence,
  };
}
