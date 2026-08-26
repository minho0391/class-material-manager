/**
 * learning.json → learning_documents 행 변환.
 *
 * 중요: practice[].sourceFiles[].code (강사 실습 코드 원문) 은 DB로 옮기지 않습니다.
 * "강사 원본 자료는 Supabase에 저장하지 않는다"는 프로젝트 원칙에 따라
 * 경로(path)·언어(language)·고른 이유(reason)만 남깁니다. 코드 본문은 뷰어가
 * 지금처럼 로컬 learning.json 파일에서 그대로 읽습니다.
 */
import type { LearningData } from "../store/learning-store.ts";

export interface LearningDocumentRow {
  material_id: string;
  subject: string | null;
  title: string | null;
  practice_relations: unknown;
  source_files: unknown;
  official_docs: unknown;
  content: unknown;
  generated_at: string;
}

export function buildLearningDocumentRows(data: LearningData): LearningDocumentRow[] {
  return data.documents.map((doc) => {
    const practiceRelations = doc.practice.map((practice) => ({
      zipId: practice.zipId,
      zipTitle: practice.zipTitle,
      confidence: practice.confidence,
      score: practice.score,
      reasons: practice.reasons,
    }));

    const sourceFiles = doc.practice.flatMap((practice) =>
      practice.sourceFiles.map((sourceFile) => ({
        zipId: practice.zipId,
        zipTitle: practice.zipTitle,
        path: sourceFile.path,
        language: sourceFile.language,
        reason: sourceFile.reason,
      })),
    );

    return {
      material_id: doc.materialId,
      subject: doc.subject ?? null,
      title: doc.title ?? null,
      practice_relations: practiceRelations,
      source_files: sourceFiles,
      official_docs: doc.references,
      content: {
        materialKind: doc.materialKind,
        materialPath: doc.materialPath,
        sourceUrl: doc.sourceUrl,
      },
      generated_at: data.generatedAt,
    };
  });
}
