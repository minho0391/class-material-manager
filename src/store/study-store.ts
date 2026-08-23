/**
 * 학습 설명(study-guides.json) 읽기와 쓰기.
 *
 * ■ 이 파일이 답하려는 질문
 *
 *   "그래서 지금 다시 공부할 때, 무엇을 어떻게 보면 되는가?"
 *
 * ■ 14단계와 무엇이 다른가
 *
 * 14단계는 **판정**했습니다 — 이것이 사용 중단인가, 버전만 다른가, 확인 못 했는가.
 * 15단계는 그 판정을 **사람이 읽을 말로 옮깁니다.** 새로 판정하지 않습니다.
 *
 * 그래서 이 파일에는 14단계에 없던 사실이 하나도 들어 있지 않습니다.
 * 들어 있는 것은 **같은 사실을 공부하는 사람 쪽에서 다시 쓴 문장**뿐입니다.
 *
 * ■ 왜 파일을 따로 두는가
 *
 * `comparisons.json` 은 이미 1.2MB 입니다. 설명 문장까지 넣으면 두 배가 됩니다.
 * 게다가 둘은 바뀌는 때가 다릅니다 — 판정은 공식 문서가 바뀔 때,
 * 설명은 말투나 template 을 고칠 때 바뀝니다. 따로 두면 각자 갱신할 수 있습니다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../config/paths.ts";
import { writeJsonAtomic } from "./atomic-write.ts";

/** 학습 설명 파일 자리 */
export const STUDY_GUIDES_FILE = join(DATA_DIR, "study-guides.json");

/**
 * 복습 우선순위 — **무엇부터 다시 봐야 하는가.**
 *
 * 14단계의 `changeType` 을 공부하는 사람의 말로 바꾼 것입니다.
 * 어떤 `changeType` 이 어느 쪽으로 가는지는 `study-builder.ts` 의 `priorityOf` 에 한곳으로 적어 두었습니다.
 */
export const LEARNING_PRIORITY = {
  /** 그대로 복습 — 공식 문서가 아무 경고도 달지 않았습니다 */
  KEEP: "KEEP",
  /** 확인하면서 복습 — 개념은 쓸 수 있지만 버전 차이나 확인 못 한 것이 있습니다 */
  CHECK: "CHECK",
  /** 다시 공부 — 사용법이나 권장 방식이 달라졌습니다 */
  RELEARN: "RELEARN",
  /** 새 방식으로 교체 — 공식 문서가 쓰지 말라고 했거나 없어졌다고 밝혔습니다 */
  REPLACE: "REPLACE",
} as const;

export type LearningPriority = (typeof LEARNING_PRIORITY)[keyof typeof LEARNING_PRIORITY];

/** 판단의 근거 한 줄 — 14단계 것을 그대로 옮겨 옵니다 */
export interface StudyEvidence {
  source: string;
  text: string;
  where?: string;
}

/** 학습 설명 하나 */
export interface StudyGuide {
  /** 어느 비교 결과에서 왔는지 — `comparisons.json` 의 `id` */
  comparisonId: string;
  subject: string;
  topic: string;
  /** api = 문법·API · package = 버전 */
  kind: "api" | "package";

  /** 무엇부터 다시 봐야 하는가 */
  learningPriority: LearningPriority;

  // ── 14단계 판정을 되짚을 수 있게 그대로 들고 옵니다 ──
  // 설명이 어디서 왔는지 사람이 따라갈 수 있어야 하기 때문입니다.
  changeType: string;
  severity: string;
  status: string;

  /** 한 문단짜리 답 — 화면에서 맨 먼저 읽는 글 */
  explanation: string;

  /** 1. 수업에서 배운 내용 (근거가 있을 때만) */
  lessonSummary?: string;
  /** 2. 현재 상태 */
  statusSummary: string;
  /** 3. 무엇이 달라졌는가 */
  changeSummary: string;
  /** 4. 수업 때 쓴 방식 (14단계가 확인한 경우만) */
  oldPattern?: string;
  /** 4. 수업·실습에 실제로 있던 코드 한 줄 (있을 때만) */
  oldCode?: string;
  /** 5. 지금 방식 (공식 문서가 말한 경우만) */
  currentPattern?: string;
  /** 5. 공식 문서가 적어 둔 대안 (있을 때만) */
  recommendedAlternative?: string;
  /** 6. 지금 다시 공부할 때의 포인트 */
  studyPoint: string;
  /** 7. 직접 확인할 근거 */
  evidence: StudyEvidence[];

  /** 이 주제가 나온 수업자료 */
  materials: Array<{ materialId: string; title: string; path: string }>;
  /** 이 주제를 쓴 실습파일 */
  practice: Array<{ zipId: string; zipTitle: string; files: string[] }>;

  /** 버전 비교였을 때 */
  versions?: {
    atLesson: string;
    latestInCourse: string | null;
    inThisProject: string | null;
  };

  /**
   * 나중에 AI 설명을 얹고 싶을 때 쓰는 자리. (확장 지점)
   *
   * **기본 생성은 이 칸을 절대 채우지 않습니다.** 규칙 기반 template 만으로 만들기 때문입니다.
   * 외부 AI 없이도 프로그램이 온전히 돌아가야 하므로, 화면도 이 칸이 없는 것을 정상으로 봅니다.
   */
  aiExplanation?: string;

  updatedAt: string;
}

/** 수업자료 하나를 두고 "이 자료 그냥 다시 공부해도 되나" 에 답하는 묶음 */
export interface StudyMaterial {
  materialId: string;
  title: string;
  subject: string;
  path: string;
  /** 이 자료에서 가장 급한 것 — 가장 무거운 항목을 따릅니다 */
  priority: LearningPriority;
  /** 우선순위별 건수 */
  counts: Record<LearningPriority, number>;
  /** 이 자료에서 다룬 주제들 (급한 것부터) */
  topics: Array<{ comparisonId: string; topic: string; priority: LearningPriority }>;
}

/** study-guides.json 전체 */
export interface StudyData {
  version: 1;
  generatedAt: string;
  /**
   * 이 설명을 만들 때 본 비교 결과가 언제 것인지.
   * `comparisons.json` 의 `generatedAt` 을 그대로 적어 둡니다.
   * 이것이 같으면 다시 만들 까닭이 없습니다.
   */
  comparisonsGeneratedAt: string;
  summary: {
    total: number;
    byPriority: Record<string, number>;
    materials: number;
  };
  guides: StudyGuide[];
  materials: StudyMaterial[];
}

/** 학습 설명을 저장합니다. 급한 것부터, 그다음 과목·주제 순으로 정렬해 둡니다. */
export async function saveStudyGuides(data: StudyData): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const order: LearningPriority[] = ["REPLACE", "RELEARN", "CHECK", "KEEP"];

  const guides = [...data.guides].sort(
    (a, b) =>
      order.indexOf(a.learningPriority) - order.indexOf(b.learningPriority) ||
      a.subject.localeCompare(b.subject) ||
      a.topic.localeCompare(b.topic, "ko"),
  );

  const materials = [...data.materials].sort(
    (a, b) =>
      order.indexOf(a.priority) - order.indexOf(b.priority) ||
      a.subject.localeCompare(b.subject) ||
      a.title.localeCompare(b.title, "ko"),
  );

  await writeJsonAtomic(STUDY_GUIDES_FILE, { ...data, guides, materials });
}

/** 학습 설명을 읽습니다. 아직 만든 적이 없으면 null 입니다. */
export async function loadStudyGuides(): Promise<StudyData | null> {
  try {
    const parsed = JSON.parse(await readFile(STUDY_GUIDES_FILE, "utf8")) as StudyData;
    if (parsed.version !== 1 || !Array.isArray(parsed.guides)) return null;
    return parsed;
  } catch {
    return null;
  }
}
