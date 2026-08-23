/**
 * 통합 학습자료(learning.json) 읽기와 쓰기.
 *
 * ■ 파일을 또 나누는 이유
 *
 *   index.json      무엇을 언제 받았는가 (수집 장부)
 *   relations.json  무엇과 무엇이 관련 있는가 (연결 판정)
 *   learning.json   그래서 한 화면에 무엇을 함께 보여줄 것인가 (10단계)
 *
 * 셋은 만들어지는 시점도, 다시 만드는 이유도 다릅니다.
 * 한 파일에 몰아 두면 규칙 하나를 손볼 때마다 전부를 다시 써야 합니다.
 *
 * ■ 코드를 이 파일에 담아 두는 이유
 *
 * 코드 원문은 이미 실습파일 Markdown 에 있으니 경로만 적어 둘 수도 있습니다.
 * 그런데 그러면 **뷰어가 Markdown 을 해석하는 코드를 따로 가져야 합니다.**
 * 뷰어는 "읽어서 보여주기만 한다"는 원칙을 지키는 편이 낫고,
 * 골라낸 코드를 다 합쳐도 156KB 라 부담이 없어 여기에 담아 둡니다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DATA_DIR, LEARNING_FILE } from "../config/paths.ts";
import { writeJsonAtomic } from "./atomic-write.ts";

/** 학습자료에 실린 실습 코드 파일 하나 */
export interface LearningSourceFile {
  /** zip 안에서의 상대경로 */
  path: string;
  /** 코드블록에 쓸 언어 이름 */
  language: string;
  /** 9단계가 이 파일을 고른 이유 */
  reason: string;
  /** 코드 원문 — 강사님이 준 그대로입니다 */
  code: string;
}

/** 이 수업자료에 딸린 실습파일 하나 */
export interface LearningPractice {
  zipId: string;
  zipTitle: string;
  /** 9단계 신뢰도 — 학습자료에는 high 와 medium 만 실립니다 */
  confidence: "high" | "medium";
  score: number;
  /** 왜 이어졌는지 (9단계 판정 근거) */
  reasons: string[];
  sourceFiles: LearningSourceFile[];
}

/** 이 수업자료에 딸린 공식 문서 요약 (본문은 data/references/ 에 그대로 둡니다) */
export interface LearningReference {
  subject: string;
  slug: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  language: string;
  mentions: number;
}

/** 통합 학습자료 한 편 */
export interface LearningDocument {
  /** 설명자료(학습의 중심)의 문서 ID */
  materialId: string;
  title: string;
  subject: string;
  /** pdf · document · published-document */
  materialKind: string;
  /** 설명자료 Markdown 의 위치 (data 폴더 기준) — 본문은 옮겨 담지 않습니다 */
  materialPath: string;
  sourceUrl: string;

  /** 관련 실습 코드 */
  practice: LearningPractice[];
  /** 관련 공식 문서 요약 */
  references: LearningReference[];
}

/** learning.json 파일 전체의 모양 */
export interface LearningData {
  version: 1;
  generatedAt: string;
  summary: {
    /** 통합 학습자료 편수 */
    documents: number;
    /** 실린 실습파일 연결 수 */
    practiceLinks: number;
    high: number;
    medium: number;
    /** 근거가 약해 싣지 않은 medium 연결 수 */
    mediumExcluded: number;
    /** 정책상 싣지 않은 low 연결 수 */
    lowExcluded: number;
    /** 실린 소스 파일 수 */
    sourceFiles: number;
    /** 공식 문서 요약이 함께 붙은 학습자료 편수 */
    documentsWithReferences: number;
  };
  documents: LearningDocument[];
}

/**
 * 통합 학습자료를 저장합니다.
 *
 * 과목 → 제목 순으로 정렬해 둡니다. 사람이 열어볼 파일이고,
 * 규칙을 바꾼 뒤 앞뒤를 비교하기도 쉬워집니다.
 */
export async function saveLearning(data: LearningData): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const documents = [...data.documents].sort(
    (a, b) => a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title, "ko"),
  );

  await writeJsonAtomic(LEARNING_FILE, { ...data, documents });
}

/** 통합 학습자료를 읽습니다. 아직 만든 적이 없으면 null 입니다. (오류가 아닙니다) */
export async function loadLearning(): Promise<LearningData | null> {
  try {
    const parsed = JSON.parse(await readFile(LEARNING_FILE, "utf8")) as LearningData;
    if (parsed.version !== 1 || !Array.isArray(parsed.documents)) return null;
    return parsed;
  } catch {
    return null;
  }
}
