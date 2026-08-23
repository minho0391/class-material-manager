/**
 * 비교 결과(comparisons.json) 읽기와 쓰기.
 *
 * ■ 이 파일이 답하려는 질문
 *
 *   "수업 때 배운 이 방식이 지금도 맞는가?"
 *
 * ■ 무엇을 담지 않는가
 *
 * **AI 가 지어낸 결론을 담지 않습니다.**
 * 공식 문서가 스스로 밝힌 것(front matter 의 `status:`)과
 * 실습 코드의 package.json 에 적힌 버전처럼 **확인 가능한 사실**만 근거로 씁니다.
 * 근거가 모자라면 확정하지 않고 `REVIEW_REQUIRED` 로 남깁니다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { COMPARISONS_FILE, DATA_DIR } from "../config/paths.ts";

/**
 * 비교 결과 상태.
 *
 * 각 값의 뜻을 여기 한곳에 적어 둡니다. 화면과 보고서가 같은 말을 쓰게 하려는 것입니다.
 */
export const COMPARISON_STATUS = {
  /** 공식 문서에서 확인되고, 문서가 아무 경고도 달지 않았습니다 */
  CURRENT: "CURRENT",
  /** 공식 문서가 **이 기능을 쓰지 말라고** 밝혔습니다 (deprecated) */
  DEPRECATED: "DEPRECATED",
  /** 공식 문서가 실험적·비표준이라고 밝혔습니다 — 그대로 믿고 쓰기 어렵습니다 */
  UNSTABLE: "UNSTABLE",
  /** 수업 때 쓴 버전과 더 최신 수업자료(또는 이 저장소)의 버전이 **메이저**로 다릅니다 */
  VERSION_GAP: "VERSION_GAP",
  /** 우리가 가진 공식 문서 표본에서 확인되지 않았습니다 — 없어졌다는 뜻이 **아닙니다** */
  NOT_FOUND: "NOT_FOUND",
  /** 근거가 모자라거나 엇갈립니다. 사람이 봐야 합니다 */
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
} as const;

export type ComparisonStatus = (typeof COMPARISON_STATUS)[keyof typeof COMPARISON_STATUS];

/** 판단의 근거 한 줄 */
export interface Evidence {
  /** 어디서 온 근거인지 (공식문서 상태 · package.json · 실습 코드 …) */
  source: string;
  /** 근거가 되는 실제 글 */
  text: string;
  /** 확인하러 갈 수 있는 곳 (파일 경로 또는 주소) */
  where?: string;
}

/** 이 기술을 실제로 쓴 실습파일 */
export interface UsageSite {
  zipId: string;
  zipTitle: string;
  /** zip 안에서 실제로 쓰인 파일들 */
  files: string[];
}

/** 비교 항목 하나 */
export interface ComparisonItem {
  /** 다시 만들어도 같은 값이 나오는 키 */
  id: string;
  subject: string;
  /** 비교 대상 — API·요소·속성 이름 또는 패키지 이름 */
  topic: string;
  /** api = 문법·API 비교 · package = 버전 비교 */
  kind: "api" | "package";

  status: ComparisonStatus;
  /** 왜 그렇게 판단했는지 한 줄로 */
  reason: string;

  // ── 14단계에서 더한 것들 ──
  //
  // 13단계의 `status` 는 "어떻게 되었나"를 말합니다.
  // 아래 둘은 **"내 코드를 고쳐야 하나"** 에 답합니다.
  // 13단계 데이터에는 없던 칸이라 없을 수도 있습니다. (호환을 위해 선택 항목)

  /** 변화의 종류 — NONE · VERSION_ONLY · RECOMMENDED_CHANGED · API_CHANGED · DEPRECATED · REMOVED · REVIEW_REQUIRED */
  changeType?: string;
  /** 중요도 — NONE · LOW · MEDIUM · HIGH */
  severity?: string;
  /** 수업 때 쓴 방식 (확인된 경우만) */
  oldPattern?: string;
  /** 지금 방식 (공식 문서가 말한 경우만) */
  currentPattern?: string;
  /** 무엇으로 바꾸면 되는지 (공식 문서가 말한 경우만) */
  recommendedAlternative?: string;

  /** 관련 수업 설명자료 (10단계 학습자료 연결에서 되짚은 것) */
  lessons: Array<{ materialId: string; title: string; path: string }>;
  /**
   * 이 기술이 **강사 설명자료 본문에 나온 곳**.
   *
   * 실습 코드에는 없어도 수업에서 가르친 것일 수 있습니다.
   * 실제로 `<font>` 태그가 그렇습니다 — 실습 zip 에는 없고 강사 PDF 에만 있습니다.
   */
  taughtIn: Array<{ materialId: string; title: string; path: string; line?: string }>;
  /** 이 기술을 실제로 쓴 실습 코드 */
  usedIn: UsageSite[];

  /** 근거가 된 공식 문서 (api 비교일 때) */
  official?: {
    subject: string;
    slug: string;
    title: string;
    sourceUrl: string;
    /** 이 내용을 받아온 날 */
    fetchedAt: string;
    /**
     * 비교할 때 본 공식 문서의 지문.
     * `refresh` 로 문서가 바뀌면 이 값이 달라져 "다시 봐야 함"을 알 수 있습니다.
     */
    contentHash: string;
    docStatus: string[];
    /**
     * 이 문서를 **어디서 가져왔는지**. (14단계)
     *
     * 두 곳에서 옵니다 — 6단계가 모아 둔 요약(`reference`)과
     * 14단계가 이름을 짚어 찾아낸 것(`lookup`)입니다.
     *
     * 이것을 적어 두지 않으면 "문서가 바뀌었나" 를 볼 때 엉뚱한 표를 뒤지게 됩니다.
     * 실제로 그랬습니다. 찾아낸 문서를 요약 목록에서 찾으니 늘 "사라졌다"가 나와,
     * 아무것도 바뀌지 않았는데도 갱신할 때마다 30건씩 다시 견주었습니다.
     *
     * 13단계에 만들어진 자료에는 없는 칸입니다. 없으면 `reference` 로 봅니다.
     */
    source?: "reference" | "lookup";
  };

  /** 버전 비교일 때 */
  versions?: {
    /** 이 실습파일의 package.json 에 적힌 버전 */
    atLesson: string;
    /** 같은 패키지를 쓰는 수업자료 중 가장 높은 버전 */
    latestInCourse: string | null;
    /** 이 저장소가 지금 쓰는 버전 (없으면 null) */
    inThisProject: string | null;
  };

  evidence: Evidence[];
  lastComparedAt: string;
  /**
   * 비교한 뒤 공식 문서가 바뀌었는지.
   * `compare --check` 가 채웁니다. true 면 다시 비교해야 합니다.
   */
  needsReview?: boolean;
}

/** comparisons.json 전체 */
export interface ComparisonData {
  version: 1;
  generatedAt: string;
  summary: {
    total: number;
    byStatus: Record<string, number>;
    /** 비교에 쓴 공식 문서 수 */
    officialDocs: number;
    /** 비교에 쓴 실습파일 수 */
    practiceZips: number;
    /** 다시 봐야 하는 항목 수 */
    needsReview: number;
  };
  items: ComparisonItem[];
}

/** 비교 결과를 저장합니다. 과목 → 상태 → 주제 순으로 정렬해 사람이 읽기 좋게 둡니다. */
export async function saveComparisons(data: ComparisonData): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const items = [...data.items].sort(
    (a, b) =>
      a.subject.localeCompare(b.subject) ||
      a.status.localeCompare(b.status) ||
      a.topic.localeCompare(b.topic, "ko"),
  );

  await writeFile(COMPARISONS_FILE, JSON.stringify({ ...data, items }, null, 2), "utf8");
}

/** 비교 결과를 읽습니다. 아직 만든 적이 없으면 null 입니다. */
export async function loadComparisons(): Promise<ComparisonData | null> {
  try {
    const parsed = JSON.parse(await readFile(COMPARISONS_FILE, "utf8")) as ComparisonData;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}
