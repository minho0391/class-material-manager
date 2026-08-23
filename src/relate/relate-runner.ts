/**
 * 9단계를 지휘하는 부분 — 설명자료와 실습코드를 잇습니다.
 *
 * ■ 흐름
 *
 *   1. index.json 에서 설명자료와 실습파일을 갈라낸다
 *   2. 저장된 Markdown 에서 단서를 뽑는다 (제목 낱말 · 기술 낱말 · 소스 파일)
 *   3. 낱말이 얼마나 흔한지 센다  ← 오탐을 막는 핵심
 *   4. 같은 과목끼리만 견주어 점수를 매긴다
 *   5. 설명자료마다 점수가 높은 실습파일 몇 개만 남긴다
 *
 * ■ --only 를 써도 점수가 달라지지 않습니다
 *
 * 낱말의 무게는 "전체 자료에서 얼마나 흔한가"로 정해집니다.
 * 그러니 react 만 골라 계산하면서 react 자료만으로 흔함을 재면
 * 전체를 돌렸을 때와 점수가 달라져 버립니다.
 *
 * 그래서 **단서와 통계는 언제나 전체 자료로 만들고**, 거르는 것은 판정 단계에서만 합니다.
 * 저장할 때도 다른 과목의 기존 연결은 건드리지 않고 그대로 둡니다.
 *
 * ■ 네트워크를 쓰지 않습니다
 *
 * 이미 받아둔 `data/` 안의 파일만 읽습니다. Google 인증도 필요 없습니다.
 */
import { loadIndex, type IndexEntry } from "../store/index-store.ts";
import {
  loadRelations,
  saveRelations,
  type Relation,
  type RelationData,
} from "../store/relation-store.ts";
import {
  extractFeature,
  isExplanatory,
  isPractice,
  type MaterialFeature,
} from "./feature-extractor.ts";
import {
  buildRarityTable,
  evaluate,
  MAX_ZIPS_PER_MATERIAL,
  type RelateStatistics,
} from "./relator.ts";
import * as log from "../utils/logger.ts";

export interface RelateOptions {
  /** 특정 과목만 다시 계산합니다 (하위 과목 포함) */
  only?: string;
  /** 결과만 계산하고 파일은 쓰지 않습니다 */
  dryRun?: boolean;
}

/** 과목 하나의 집계 */
export interface SubjectStat {
  subject: string;
  materials: number;
  zips: number;
  relations: number;
  high: number;
  medium: number;
  low: number;
  linkedMaterials: number;
  usedZips: number;
}

export interface RelateSummary {
  /** 판정 대상이 된 설명자료 수 */
  materials: number;
  /** 판정 대상이 된 실습파일 수 */
  zips: number;
  /** 이번에 만들어진 연결 */
  relations: Relation[];
  bySubject: SubjectStat[];
  linkedMaterials: number;
  unlinkedMaterials: number;
  usedZips: number;
  unusedZips: number;
  /** 근거가 약해 잇지 않은 후보 수 */
  rejected: number;
  /** 단서를 뽑지 못한 자료 */
  unreadable: string[];
  /** --only 로 일부만 계산했는지 */
  partial: boolean;
}

/** relations.json 에 적을 짧은 종류 이름 */
function materialKindOf(entry: IndexEntry): string {
  return entry.mimeType === "application/pdf" ? "pdf" : entry.kind;
}

/** 여러 자료에서 단서를 뽑습니다. */
async function readFeatures(
  list: IndexEntry[],
  label: string,
  unreadable: string[],
): Promise<MaterialFeature[]> {
  const features: MaterialFeature[] = [];
  let done = 0;

  for (const entry of list) {
    const feature = await extractFeature(entry);
    if (feature) features.push(feature);
    else unreadable.push(entry.title);

    done++;
    log.progress(done, list.length, label);
  }

  log.endProgress();
  return features;
}

/**
 * 연결을 계산합니다.
 */
export async function relate(options: RelateOptions = {}): Promise<RelateSummary> {
  const index = await loadIndex();
  const entries = Object.values(index.entries);

  const materialEntries = entries.filter((entry) => isExplanatory(entry) && entry.filePath);
  const zipEntries = entries.filter((entry) => isPractice(entry) && entry.filePath);

  const unreadable: string[] = [];

  // ── 1. 단서 뽑기 (언제나 전체) ──
  log.step(`단서를 뽑습니다 — 설명자료 ${materialEntries.length}건 · 실습파일 ${zipEntries.length}건`);

  const allMaterials = await readFeatures(materialEntries, "설명자료", unreadable);
  const allZips = await readFeatures(zipEntries, "실습파일", unreadable);

  // ── 2. 낱말이 얼마나 흔한지 세기 ──
  //
  // 제목 낱말은 설명자료와 실습파일을 합쳐 셉니다. (같은 이름 규칙을 쓰기 때문)
  // 기술 낱말과 경로 낱말은 실습파일 안에서만 셉니다.
  const statistics: RelateStatistics = {
    titleTokens: buildRarityTable(
      [...allMaterials, ...allZips].map((feature) => ({
        subject: feature.subject,
        tokens: feature.titleTokens,
      })),
    ),
    zipKeywords: buildRarityTable(
      allZips.map((zip) => ({ subject: zip.subject, tokens: zip.keywords.keys() })),
    ),
    pathTokens: buildRarityTable(
      allZips.map((zip) => ({
        subject: zip.subject,
        tokens: zip.sourceFiles.flatMap((file) => [...file.tokens]),
      })),
    ),
  };

  // ── 3. 판정 대상 고르기 ──
  const inScope = (subject: string): boolean =>
    !options.only || subject === options.only || subject.startsWith(`${options.only}/`);

  const materials = allMaterials.filter((material) => inScope(material.subject));

  log.step(
    options.only
      ? `연결을 판정합니다 — ${options.only} 과목 설명자료 ${materials.length}건`
      : "연결을 판정합니다",
  );

  const relations: Relation[] = [];
  let rejected = 0;
  let done = 0;

  for (const material of materials) {
    const candidates: Array<{ zip: MaterialFeature; result: NonNullable<ReturnType<typeof evaluate>> }> = [];

    for (const zip of allZips) {
      const result = evaluate(material, zip, statistics);
      if (result) candidates.push({ zip, result });
      else rejected++;
    }

    // 점수가 높은 것부터 정해진 개수만 남깁니다.
    candidates.sort(
      (a, b) => b.result.score - a.result.score || a.zip.entry.title.localeCompare(b.zip.entry.title, "ko"),
    );

    for (const candidate of candidates.slice(0, MAX_ZIPS_PER_MATERIAL)) {
      relations.push({
        materialId: material.entry.docId,
        materialTitle: material.entry.title,
        materialKind: materialKindOf(material.entry),
        subject: material.subject,
        zipId: candidate.zip.entry.docId,
        zipTitle: candidate.zip.entry.title,
        confidence: candidate.result.confidence,
        score: candidate.result.score,
        reasons: candidate.result.reasons,
        sourceFiles: candidate.result.sourceFiles,
      });
    }

    rejected += Math.max(0, candidates.length - MAX_ZIPS_PER_MATERIAL);

    done++;
    log.progress(done, materials.length, "설명자료");
  }

  log.endProgress();

  // ── 4. 저장할 전체 목록 만들기 ──
  //
  // --only 로 일부만 다시 계산했다면, 손대지 않은 과목의 기존 연결은 그대로 둡니다.
  let merged = relations;

  if (options.only) {
    const existing = await loadRelations();
    const untouched = (existing?.relations ?? []).filter((relation) => !inScope(relation.subject));
    merged = [...untouched, ...relations];
  }

  // ── 5. 집계 ──
  const linkedMaterialIds = new Set(merged.map((relation) => relation.materialId));
  const usedZipIds = new Set(merged.map((relation) => relation.zipId));

  const subjects = new Set([
    ...allMaterials.map((m) => m.subject),
    ...allZips.map((z) => z.subject),
  ]);

  const bySubject: SubjectStat[] = [];

  for (const subject of subjects) {
    const own = merged.filter((relation) => relation.subject === subject);
    bySubject.push({
      subject,
      materials: allMaterials.filter((m) => m.subject === subject).length,
      zips: allZips.filter((z) => z.subject === subject).length,
      relations: own.length,
      high: own.filter((r) => r.confidence === "high").length,
      medium: own.filter((r) => r.confidence === "medium").length,
      low: own.filter((r) => r.confidence === "low").length,
      linkedMaterials: new Set(own.map((r) => r.materialId)).size,
      usedZips: new Set(own.map((r) => r.zipId)).size,
    });
  }

  bySubject.sort((a, b) => b.relations - a.relations || b.materials - a.materials);

  const summary: RelateSummary = {
    materials: allMaterials.length,
    zips: allZips.length,
    relations: merged,
    bySubject,
    linkedMaterials: linkedMaterialIds.size,
    unlinkedMaterials: allMaterials.length - linkedMaterialIds.size,
    usedZips: usedZipIds.size,
    unusedZips: allZips.length - usedZipIds.size,
    rejected,
    unreadable,
    partial: Boolean(options.only),
  };

  // ── 6. 파일로 ──
  if (!options.dryRun) {
    const data: RelationData = {
      version: 1,
      generatedAt: new Date().toISOString(),
      summary: {
        relations: merged.length,
        high: merged.filter((r) => r.confidence === "high").length,
        medium: merged.filter((r) => r.confidence === "medium").length,
        low: merged.filter((r) => r.confidence === "low").length,
        linkedMaterials: summary.linkedMaterials,
        unlinkedMaterials: summary.unlinkedMaterials,
        usedZips: summary.usedZips,
        unusedZips: summary.unusedZips,
      },
      relations: merged,
    };

    await saveRelations(data);
  }

  return summary;
}
