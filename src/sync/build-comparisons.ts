/**
 * comparisons.json → comparisons 행 변환.
 *
 * comparisons 테이블의 material_id 는 단일 컬럼(FK 1개)이지만 원본 항목 하나는
 * 여러 수업자료(lessons/taughtIn)·여러 실습zip(usedIn)에 걸칠 수 있는 M:N 구조입니다.
 * material_id 에는 대표 자료 하나만 넣고, 전체 목록은 details(jsonb) 에 그대로 보존해
 * 데이터 손실 없이 기존 스키마 안에서 표현합니다.
 */
import type { ComparisonData, ComparisonItem } from "../store/comparison-store.ts";

export interface ComparisonRow {
  id: string;
  material_id: string | null;
  subject: string | null;
  technology: string | null;
  status: string;
  change_type: string | null;
  severity: string | null;
  reason: string | null;
  needs_review: boolean;
  evidence: unknown;
  official: unknown;
  details: unknown;
  checked_at: string | null;
  generated_at: string;
}

function representativeMaterialId(item: ComparisonItem): string | null {
  // lessons/taughtIn(설명자료)이 없는 항목(예: package 비교)은 usedIn(실습zip)만 있을 수 있습니다.
  // 이 경우도 material_id 를 비워두지 않도록 usedIn 을 마지막으로 봅니다.
  return (
    item.lessons[0]?.materialId ?? item.taughtIn[0]?.materialId ?? item.usedIn[0]?.zipId ?? null
  );
}

export function buildComparisonRows(data: ComparisonData): ComparisonRow[] {
  return data.items.map((item) => ({
    id: item.id,
    material_id: representativeMaterialId(item),
    subject: item.subject ?? null,
    technology: item.topic ?? null,
    status: item.status,
    change_type: item.changeType ?? null,
    severity: item.severity ?? null,
    reason: item.reason ?? null,
    needs_review: item.needsReview ?? false,
    evidence: item.evidence,
    // official 컬럼은 NOT NULL 입니다. package 비교(kind: "package")는 공식 문서 대신
    // versions(현재 프로젝트 버전 비교)를 근거로 쓰므로 official 필드 자체가 없습니다 — 빈 객체로 채웁니다.
    official: item.official ?? {},
    details: {
      kind: item.kind,
      lessons: item.lessons,
      taughtIn: item.taughtIn,
      usedIn: item.usedIn,
      oldPattern: item.oldPattern,
      currentPattern: item.currentPattern,
      recommendedAlternative: item.recommendedAlternative,
      versions: item.versions,
    },
    checked_at: item.lastComparedAt ?? null,
    generated_at: data.generatedAt,
  }));
}
