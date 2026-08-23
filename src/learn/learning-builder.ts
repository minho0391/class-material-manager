/**
 * 10단계를 지휘하는 부분 — 흩어진 것들을 하나의 학습 흐름으로 잇습니다.
 *
 *   [강사 수업 설명]  ←  학습의 중심
 *        ↓
 *   [관련 실습 코드]  ←  8단계가 뽑아둔 zip 안의 진짜 코드
 *        ↓
 *   [공식 문서 보충]  ←  6단계가 만들어둔 요약
 *
 * ■ 새로 만드는 것이 없습니다
 *
 * 수업 내용을 지어내지 않습니다. 코드를 고치지 않습니다.
 * 이미 있는 것을 **어떤 순서로 함께 볼지** 정해 적어 둘 뿐입니다.
 * 그래서 이 단계는 원본을 한 글자도 건드리지 않고 learning.json 하나만 만듭니다.
 *
 * ■ 어떤 연결을 싣는가
 *
 *   high    그대로 싣는다
 *   medium  근거를 한 번 더 따져 보고 싣는다
 *   low     싣지 않는다 (relations.json 에는 그대로 남겨 둔다)
 */
import { LESSON_TOPIC_TERMS } from "../config/tech-keywords.ts";
import { loadIndex, type IndexEntry } from "../store/index-store.ts";
import { loadRelations, type Relation } from "../store/relation-store.ts";
import {
  loadLearning,
  saveLearning,
  type LearningData,
  type LearningDocument,
  type LearningPractice,
  type LearningSourceFile,
} from "../store/learning-store.ts";
import { meaningfulTokens, tokenize } from "../relate/feature-extractor.ts";
import { readPracticeCode, languageOf } from "./practice-reader.ts";
import { findReferencesFor, loadReferences } from "./reference-index.ts";
import * as log from "../utils/logger.ts";

export interface BuildLearningOptions {
  /** 특정 과목만 다시 만듭니다 (하위 과목 포함) */
  only?: string;
  /** 결과만 보여주고 파일은 쓰지 않습니다 */
  dryRun?: boolean;
}

/** medium 을 싣지 않기로 한 까닭 */
export interface ExcludedRelation {
  materialTitle: string;
  zipTitle: string;
  confidence: string;
  score: number;
  reason: string;
}

export interface BuildLearningSummary {
  documents: LearningDocument[];
  /** 실린 연결 */
  includedHigh: number;
  includedMedium: number;
  /** 싣지 않은 연결 */
  excludedMedium: ExcludedRelation[];
  excludedLow: number;
  sourceFiles: number;
  /** 코드를 찾지 못한 소스 파일 */
  missingCode: string[];
  documentsWithReferences: number;
  referenceLinks: number;
  partial: boolean;
}

/**
 * medium 연결을 학습자료에 실어도 되는지 따집니다.
 *
 * 지시받은 기준은 "근거가 명확할 때만, 모순되면 제외" 입니다. 셋을 봅니다.
 *
 *   1. 보여줄 코드가 있는가
 *   2. 과목 일치 말고 다른 근거가 있는가
 *   3. 주제가 어긋나지 않는가
 *
 * 3번이 핵심입니다. `01_CSS GRID 핵심` ↔ `flexbox_base_202604_f.zip` 처럼
 * 근거는 사실인데 zip 이 스스로 다른 주제를 내걸고 있는 경우를 걸러냅니다.
 */
function judgeMedium(relation: Relation): { include: boolean; reason: string } {
  if (relation.sourceFiles.length === 0) {
    return { include: false, reason: "보여줄 실습 코드가 없습니다" };
  }

  // reasons 의 첫 줄은 언제나 "과목 일치" 입니다. 그 외의 근거가 있어야 합니다.
  if (relation.reasons.length < 2) {
    return { include: false, reason: "과목이 같다는 것 말고는 근거가 없습니다" };
  }

  // ── 주제 충돌 ──
  const zipTopics = [...meaningfulTokens(tokenize(relation.zipTitle))].filter((token) =>
    LESSON_TOPIC_TERMS.has(token),
  );

  if (zipTopics.length > 0) {
    const materialTokens = meaningfulTokens(tokenize(relation.materialTitle));

    // 낱말 하나라도 맞으면 어긋난 것이 아닙니다.
    // (hooks ↔ hook 처럼 복수형만 다른 경우도 같은 것으로 봅니다)
    const agrees = zipTopics.some(
      (topic) =>
        materialTokens.has(topic) ||
        materialTokens.has(topic.replace(/s$/, "")) ||
        materialTokens.has(`${topic}s`),
    );

    if (!agrees) {
      return {
        include: false,
        reason: `주제가 어긋납니다 — 실습파일은 "${zipTopics.join(", ")}" 을 내걸고 있습니다`,
      };
    }
  }

  return { include: true, reason: "" };
}

/**
 * 통합 학습자료를 만듭니다.
 */
export async function buildLearning(
  options: BuildLearningOptions = {},
): Promise<BuildLearningSummary> {
  const index = await loadIndex();
  const relationData = await loadRelations();

  if (!relationData) {
    throw new Error(
      "data/relations.json 이 없습니다. 먼저 `node src/index.ts relate` 를 실행해 주세요.",
    );
  }

  const inScope = (subject: string): boolean =>
    !options.only || subject === options.only || subject.startsWith(`${options.only}/`);

  // ── 1. 실을 연결 고르기 ──
  const excludedMedium: ExcludedRelation[] = [];
  let excludedLow = 0;
  const accepted: Relation[] = [];

  for (const relation of relationData.relations) {
    if (relation.confidence === "low") {
      // relations.json 에서 지우지 않습니다. 학습자료에 싣지 않을 뿐입니다.
      excludedLow++;
      continue;
    }

    if (relation.confidence === "medium") {
      const judgement = judgeMedium(relation);
      if (!judgement.include) {
        excludedMedium.push({
          materialTitle: relation.materialTitle,
          zipTitle: relation.zipTitle,
          confidence: relation.confidence,
          score: relation.score,
          reason: judgement.reason,
        });
        continue;
      }
    }

    accepted.push(relation);
  }

  // ── 2. 설명자료별로 묶기 ──
  const byMaterial = new Map<string, Relation[]>();

  for (const relation of accepted) {
    if (!inScope(relation.subject)) continue;
    const list = byMaterial.get(relation.materialId) ?? [];
    list.push(relation);
    byMaterial.set(relation.materialId, list);
  }

  // ── 3. 코드와 공식 문서를 붙이기 ──
  const references = await loadReferences();
  log.detail(`공식 문서 요약 ${references.length}건을 읽었습니다`);

  const documents: LearningDocument[] = [];
  const missingCode: string[] = [];
  const codeCache = new Map<string, Awaited<ReturnType<typeof readPracticeCode>>>();

  let includedHigh = 0;
  let includedMedium = 0;
  let sourceFileCount = 0;
  let referenceLinks = 0;
  let done = 0;

  for (const [materialId, relations] of byMaterial) {
    const material: IndexEntry | undefined = index.entries[materialId];
    if (!material) continue;

    const practice: LearningPractice[] = [];

    // 확신이 큰 것부터 보여줍니다.
    relations.sort((a, b) => b.score - a.score);

    for (const relation of relations) {
      const zip = index.entries[relation.zipId];
      if (!zip?.filePath) continue;

      // 같은 실습파일 Markdown 을 여러 번 읽지 않습니다.
      let codes = codeCache.get(relation.zipId);
      if (!codes) {
        codes = await readPracticeCode(zip.filePath);
        codeCache.set(relation.zipId, codes);
      }

      const sourceFiles: LearningSourceFile[] = [];

      for (const file of relation.sourceFiles) {
        const found = codes.get(file.path);
        if (!found) {
          missingCode.push(`${relation.zipTitle} → ${file.path}`);
          continue;
        }

        sourceFiles.push({
          path: found.path,
          language: found.language || languageOf(found.path),
          reason: file.reason,
          code: found.code,
        });
      }

      // 코드를 하나도 못 찾았다면 보여줄 것이 없습니다.
      if (sourceFiles.length === 0) continue;

      practice.push({
        zipId: relation.zipId,
        zipTitle: relation.zipTitle,
        confidence: relation.confidence as "high" | "medium",
        score: relation.score,
        reasons: relation.reasons,
        sourceFiles,
      });

      sourceFileCount += sourceFiles.length;
      if (relation.confidence === "high") includedHigh++;
      else includedMedium++;
    }

    if (practice.length === 0) continue;

    const subject = material.subject ?? "_unclassified";
    const related = findReferencesFor(references, material.title, subject);
    referenceLinks += related.length;

    documents.push({
      materialId,
      title: material.title,
      subject,
      materialKind: material.mimeType === "application/pdf" ? "pdf" : material.kind,
      materialPath: material.filePath,
      sourceUrl: material.sourceUrl,
      practice,
      references: related.map((reference) => ({
        subject: reference.subject,
        slug: reference.slug,
        title: reference.title,
        sourceName: reference.sourceName,
        sourceUrl: reference.sourceUrl,
        language: reference.language,
        mentions: reference.mentions,
      })),
    });

    done++;
    log.progress(done, byMaterial.size, "학습자료");
  }

  log.endProgress();

  const summary: BuildLearningSummary = {
    documents,
    includedHigh,
    includedMedium,
    excludedMedium,
    excludedLow,
    sourceFiles: sourceFileCount,
    missingCode,
    documentsWithReferences: documents.filter((doc) => doc.references.length > 0).length,
    referenceLinks,
    partial: Boolean(options.only),
  };

  // ── 4. 저장 ──
  //
  // --only 로 일부만 만들었다면 다른 과목의 기존 학습자료는 그대로 둡니다.
  if (!options.dryRun) {
    let merged = documents;

    if (options.only) {
      const existing = await loadLearning();
      const untouched = (existing?.documents ?? []).filter((doc) => !inScope(doc.subject));
      merged = [...untouched, ...documents];
    }

    const data: LearningData = {
      version: 1,
      generatedAt: new Date().toISOString(),
      summary: {
        documents: merged.length,
        practiceLinks: merged.reduce((sum, doc) => sum + doc.practice.length, 0),
        high: merged.reduce(
          (sum, doc) => sum + doc.practice.filter((p) => p.confidence === "high").length,
          0,
        ),
        medium: merged.reduce(
          (sum, doc) => sum + doc.practice.filter((p) => p.confidence === "medium").length,
          0,
        ),
        mediumExcluded: excludedMedium.length,
        lowExcluded: excludedLow,
        sourceFiles: merged.reduce(
          (sum, doc) => sum + doc.practice.reduce((n, p) => n + p.sourceFiles.length, 0),
          0,
        ),
        documentsWithReferences: merged.filter((doc) => doc.references.length > 0).length,
      },
      documents: merged,
    };

    await saveLearning(data);
    summary.documents = merged;
  }

  return summary;
}
