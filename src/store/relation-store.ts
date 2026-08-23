/**
 * 연결 관계(relations.json) 읽기와 쓰기.
 *
 * ■ 왜 index.json 에 넣지 않는가
 *
 * index.json 은 "무엇을 언제 받았는가"를 적는 장부입니다.
 * 연결 관계는 그와 성격이 다릅니다.
 *   · 자료를 다시 받지 않아도 규칙만 바꾸면 통째로 다시 만들어집니다
 *   · 자료 393건에 견주어 항목 수가 훨씬 많아질 수 있습니다
 *
 * 섞어 두면 장부가 비대해지고, 연결 규칙을 손볼 때마다 장부 전체를 다시 써야 합니다.
 * 그래서 파일을 나눕니다. index.json 은 8단계 때와 똑같이 유지됩니다.
 */
import { mkdir, readFile } from "node:fs/promises";
import { DATA_DIR, RELATIONS_FILE } from "../config/paths.ts";
import { writeJsonAtomic } from "./atomic-write.ts";

/** 연결에 딸려 오는 소스 파일 하나 */
export interface RelatedSourceFile {
  /** zip 안에서의 상대경로 */
  path: string;
  /** 왜 골랐는지 */
  reason: string;
}

/** 연결 하나 */
export interface Relation {
  /** 설명자료(학습의 중심) */
  materialId: string;
  materialTitle: string;
  /** 설명자료의 종류 — pdf · document · published-document */
  materialKind: string;
  subject: string;

  /** 실습파일 */
  zipId: string;
  zipTitle: string;

  confidence: "high" | "medium" | "low";
  score: number;
  /** 왜 이어졌는지 — 사람이 읽고 판단할 수 있게 */
  reasons: string[];
  /** 이 설명자료와 관련이 깊은 소스 파일들 */
  sourceFiles: RelatedSourceFile[];
}

/** relations.json 파일 전체의 모양 */
export interface RelationData {
  version: 1;
  generatedAt: string;
  /** 한눈에 보는 수치 */
  summary: {
    relations: number;
    high: number;
    medium: number;
    low: number;
    /** 연결이 하나라도 붙은 설명자료 수 */
    linkedMaterials: number;
    /** 연결이 붙지 않은 설명자료 수 */
    unlinkedMaterials: number;
    /** 어딘가에 쓰인 실습파일 수 */
    usedZips: number;
    /** 한 번도 쓰이지 않은 실습파일 수 */
    unusedZips: number;
  };
  relations: Relation[];
}

/**
 * 연결을 저장합니다.
 *
 * 사람이 열어볼 파일이므로 들여쓰기를 넣고,
 * 과목 → 설명자료 제목 → 점수 순으로 정렬해 둡니다.
 * 정렬해 두면 규칙을 바꾼 뒤 앞뒤 결과를 비교하기도 쉽습니다.
 */
export async function saveRelations(data: RelationData): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const sorted = [...data.relations].sort(
    (a, b) =>
      a.subject.localeCompare(b.subject) ||
      a.materialTitle.localeCompare(b.materialTitle, "ko") ||
      b.score - a.score,
  );

  await writeJsonAtomic(RELATIONS_FILE, { ...data, relations: sorted });
}

/**
 * 연결을 읽습니다. 아직 만든 적이 없으면 null 을 돌려줍니다. (오류가 아닙니다)
 */
export async function loadRelations(): Promise<RelationData | null> {
  try {
    const parsed = JSON.parse(await readFile(RELATIONS_FILE, "utf8")) as RelationData;
    if (parsed.version !== 1 || !Array.isArray(parsed.relations)) return null;
    return parsed;
  } catch {
    return null;
  }
}
