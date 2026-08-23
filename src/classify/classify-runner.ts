/**
 * 분류를 실제로 적용하는 부분.
 *
 * ■ 두 가지 모드
 *
 *   dry-run  판단 결과만 계산해서 보여줍니다. 파일은 하나도 건드리지 않습니다.
 *   실제 적용  자료를 과목별 폴더로 옮기고 카탈로그를 갱신합니다.
 *
 * 먼저 dry-run 으로 확인한 뒤 적용하는 것이 안전합니다.
 * 393건을 잘못 옮기면 되돌리기 번거롭기 때문입니다.
 */
import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DATA_DIR } from "../config/paths.ts";
import { loadIndex, saveIndex, type IndexEntry } from "../store/index-store.ts";
import { classify, type ClassifyResult, type ClassifyRule } from "./classifier.ts";

/** 자료 하나에 대한 분류 결과 */
export interface ClassifiedItem {
  entry: IndexEntry;
  result: ClassifyResult;
  /** 옮겨 갈 경로 (data 폴더 기준) */
  targetPath: string;
  /** 원본 파일을 옮겨 갈 경로. 바이너리가 없으면 undefined */
  targetDownloadPath?: string;
}

export interface ClassifySummary {
  total: number;
  /** 과목별 건수 */
  bySubject: Map<string, number>;
  /** 규칙별 건수 */
  byRule: Map<ClassifyRule, number>;
  /** 확신도별 건수 */
  byConfidence: Map<string, number>;
  /** 전체 결과 */
  items: ClassifiedItem[];
  /** 실제로 옮긴 개수 (dry-run 이면 0) */
  moved: number;
  /** 옮기다 실패한 것들 */
  errors: Array<{ title: string; reason: string }>;
}

/** 파일 경로에서 파일 이름만 떼어냅니다. */
function baseNameOf(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/**
 * 분류를 계산합니다. (파일은 건드리지 않습니다)
 */
export async function planClassification(): Promise<ClassifySummary> {
  const index = await loadIndex();
  const entries = Object.values(index.entries);

  const items: ClassifiedItem[] = [];
  const bySubject = new Map<string, number>();
  const byRule = new Map<ClassifyRule, number>();
  const byConfidence = new Map<string, number>();

  for (const entry of entries) {
    const result = classify(entry);

    // 옮겨 갈 자리를 계산합니다. 파일 이름은 그대로 두고 폴더만 바뀝니다.
    const fileName = baseNameOf(entry.filePath);
    const targetPath = `materials/${result.subject}/${fileName}`;

    let targetDownloadPath: string | undefined;
    if (entry.downloadPath) {
      // 원본 파일은 과목 폴더 아래 files/ 로 함께 옮깁니다.
      targetDownloadPath = `materials/${result.subject}/files/${baseNameOf(entry.downloadPath)}`;
    }

    items.push({ entry, result, targetPath, targetDownloadPath });

    bySubject.set(result.subject, (bySubject.get(result.subject) ?? 0) + 1);
    byRule.set(result.rule, (byRule.get(result.rule) ?? 0) + 1);
    byConfidence.set(result.confidence, (byConfidence.get(result.confidence) ?? 0) + 1);
  }

  return {
    total: entries.length,
    bySubject,
    byRule,
    byConfidence,
    items,
    moved: 0,
    errors: [],
  };
}

/**
 * 계산된 분류를 실제로 적용합니다. 자료를 과목별 폴더로 옮기고 카탈로그를 갱신합니다.
 */
export async function applyClassification(plan: ClassifySummary): Promise<ClassifySummary> {
  const index = await loadIndex();

  let moved = 0;
  const errors: ClassifySummary["errors"] = [];

  for (const item of plan.items) {
    const { entry, result, targetPath, targetDownloadPath } = item;

    try {
      // ── 설명 Markdown 옮기기 ──
      if (entry.filePath && entry.filePath !== targetPath) {
        const from = join(DATA_DIR, entry.filePath);
        const to = join(DATA_DIR, targetPath);
        await mkdir(dirname(to), { recursive: true });
        await rename(from, to);
      }

      // ── 원본 파일 옮기기 ──
      if (entry.downloadPath && targetDownloadPath && entry.downloadPath !== targetDownloadPath) {
        const from = join(DATA_DIR, entry.downloadPath);
        const to = join(DATA_DIR, targetDownloadPath);
        await mkdir(dirname(to), { recursive: true });
        await rename(from, to);
      }

      // ── 카탈로그 갱신 ──
      const updated = index.entries[entry.docId];
      if (updated) {
        updated.subject = result.subject;
        updated.filePath = targetPath;
        if (targetDownloadPath) updated.downloadPath = targetDownloadPath;
      }

      moved++;
    } catch (e) {
      errors.push({
        title: entry.title ?? entry.docId,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await saveIndex(index);

  return { ...plan, moved, errors };
}

