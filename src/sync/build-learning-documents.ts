/**
 * learning.json → learning_documents 행 변환.
 *
 * 2026-08-27 저장 경계 정밀화: 실습 코드 **텍스트**(practice[].sourceFiles[].code)는
 * 뷰어 학습 화면과 검색에 필요하므로 `source_files` 에 함께 담습니다. 원본 파일 자체
 * (ZIP)는 여전히 로컬 전용입니다. (PROJECT_CONTEXT.md "텍스트 본문·references 이관" 참고)
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
        code: sourceFile.code,
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
