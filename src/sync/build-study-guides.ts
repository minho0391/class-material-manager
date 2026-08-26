/**
 * study-guides.json 의 guides[] (355건) → study_guides 행 변환.
 *
 * materials[] (89건, 자료별 요약) 은 이 테이블이 아니라
 * build-material-metadata.ts 에서 material_metadata.extra 로 들어갑니다 — 자료 하나당
 * 하나씩 대응하는 데이터라 그쪽이 자연스러운 자리입니다.
 */
import type { StudyData, StudyGuide } from "../store/study-store.ts";

export interface StudyGuideRow {
  comparison_id: string;
  material_id: string | null;
  subject: string | null;
  learning_priority: string;
  explanation: string | null;
  recommended_alternative: string | null;
  study_point: string | null;
  details: unknown;
  generated_at: string;
}

function representativeMaterialId(guide: StudyGuide): string | null {
  // materials(설명자료)가 없는 항목(예: 실습에만 등장한 package 비교)은 practice(실습zip)만
  // 있을 수 있습니다. 이 경우도 material_id 를 비워두지 않도록 practice 를 마지막으로 봅니다.
  return guide.materials[0]?.materialId ?? guide.practice[0]?.zipId ?? null;
}

export function buildStudyGuideRows(data: StudyData): StudyGuideRow[] {
  return data.guides.map((guide) => ({
    comparison_id: guide.comparisonId,
    material_id: representativeMaterialId(guide),
    subject: guide.subject ?? null,
    learning_priority: guide.learningPriority,
    explanation: guide.explanation ?? null,
    recommended_alternative: guide.recommendedAlternative ?? null,
    study_point: guide.studyPoint ?? null,
    details: {
      topic: guide.topic,
      kind: guide.kind,
      changeType: guide.changeType,
      severity: guide.severity,
      status: guide.status,
      lessonSummary: guide.lessonSummary,
      statusSummary: guide.statusSummary,
      changeSummary: guide.changeSummary,
      oldPattern: guide.oldPattern,
      oldCode: guide.oldCode,
      currentPattern: guide.currentPattern,
      evidence: guide.evidence,
      materials: guide.materials,
      practice: guide.practice,
      versions: guide.versions,
      aiExplanation: guide.aiExplanation,
      updatedAt: guide.updatedAt,
    },
    generated_at: guide.updatedAt,
  }));
}
