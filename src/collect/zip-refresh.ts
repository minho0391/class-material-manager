/**
 * 이미 내려받아 둔 zip 을 다시 읽어 Markdown 을 새로 만드는 부분.
 *
 * ■ 왜 따로 있는가
 *
 * 8단계를 만들기 전에 이미 zip 115건(347MB)을 전부 내려받아 두었습니다.
 * 그런데 그때는 zip 안을 들여다보는 기능이 없어서, 만들어진 Markdown 에는
 * "압축 파일이라 글자를 뽑을 수 없습니다" 한 줄만 들어 있습니다.
 *
 * 이것을 고치려고 347MB 를 다시 내려받는 것은 낭비입니다.
 * **원본 zip 은 이미 `data/materials/<과목>/files/` 에 그대로 있으므로**
 * 그 파일을 읽어 본문만 새로 쓰면 됩니다. 네트워크도 인증도 필요 없습니다.
 *
 * ■ 수집 흐름을 건드리지 않습니다
 *
 * 변경 감지에 쓰는 `contentHash` 는 zip 의 md5 라서 이 작업으로 바뀌지 않습니다.
 * 그래서 다음에 `collect-files` 를 돌려도 "변경 없음"으로 판정되어
 * 여기서 새로 쓴 본문이 다시 지워지지 않습니다.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../config/paths.ts";
import { loadIndex, saveIndex, type IndexEntry } from "../store/index-store.ts";
import { rewriteMaterial } from "../store/markdown-writer.ts";
import { buildFileNote } from "./file-collector.ts";
import { buildZipMarkdown, isZipMime, readZipContents } from "./zip-text.ts";
import * as log from "../utils/logger.ts";

export interface ZipRefreshOptions {
  /** 앞에서부터 N건만 처리합니다 (시험 실행용) */
  limit?: number;
  /** 특정 과목만 처리합니다 */
  only?: string;
  /** 결과만 계산하고 파일은 건드리지 않습니다 */
  dryRun?: boolean;
}

/** 한 건의 처리 결과 */
export interface ZipRefreshItem {
  title: string;
  subject: string;
  fileCount: number;
  sourceCount: number;
  skippedByLimit: number;
  textBytes: number;
}

export interface ZipRefreshSummary {
  /** 카탈로그에 있는 zip 자료 수 */
  total: number;
  /** 실제로 다시 읽은 건수 */
  refreshed: number;
  /** 원본 파일이 없어 건너뛴 건수 */
  missing: number;
  /** 읽다 실패한 건수 */
  failed: number;
  /** 읽을 수 있는 소스가 하나도 없던 건수 (이미지만 든 자료 등) */
  emptySource: number;
  items: ZipRefreshItem[];
  errors: Array<{ title: string; reason: string }>;
}

/** 카탈로그에서 zip 자료만 골라냅니다. */
function selectZipEntries(
  entries: IndexEntry[],
  options: ZipRefreshOptions,
): IndexEntry[] {
  const zips = entries
    .filter((entry) => isZipMime(entry.mimeType) && entry.downloadPath)
    .filter((entry) => (options.only ? (entry.subject ?? "") === options.only : true))
    // 순서를 고정해 두면 --limit 로 시험 실행할 때 매번 같은 자료가 걸립니다.
    .sort((a, b) => a.title.localeCompare(b.title, "ko"));

  return options.limit === undefined ? zips : zips.slice(0, options.limit);
}

/**
 * 이미 받아둔 zip 을 다시 읽어 본문을 새로 씁니다.
 */
export async function refreshZipMaterials(
  options: ZipRefreshOptions = {},
): Promise<ZipRefreshSummary> {
  const index = await loadIndex();
  const targets = selectZipEntries(Object.values(index.entries), options);

  const summary: ZipRefreshSummary = {
    total: targets.length,
    refreshed: 0,
    missing: 0,
    failed: 0,
    emptySource: 0,
    items: [],
    errors: [],
  };

  let done = 0;

  for (const entry of targets) {
    done++;
    log.progress(done, targets.length, "압축파일");

    // ── 1) 저장된 원본을 읽는다 ──
    let bytes: Uint8Array;
    try {
      const buffer = await readFile(join(DATA_DIR, entry.downloadPath ?? ""));
      bytes = new Uint8Array(buffer);
    } catch {
      summary.missing++;
      summary.errors.push({
        title: entry.title,
        reason: `저장된 원본을 찾지 못했습니다 (${entry.downloadPath})`,
      });
      continue;
    }

    // ── 2) 안을 읽는다 ──
    const contents = readZipContents(bytes);
    if (!contents.ok) {
      summary.failed++;
      summary.errors.push({ title: entry.title, reason: contents.reason ?? "알 수 없는 오류" });
      continue;
    }

    if (contents.sourceFiles.length === 0) summary.emptySource++;

    summary.items.push({
      title: entry.title,
      subject: entry.subject ?? "_unclassified",
      fileCount: contents.fileCount,
      sourceCount: contents.sourceFiles.length,
      skippedByLimit: contents.skipped.filter((file) => file.byLimit).length,
      textBytes: contents.textBytes,
    });

    if (options.dryRun) continue;

    // ── 3) 본문을 새로 쓴다 ──
    //
    // 카탈로그의 기록을 그대로 쓰되 zip 관련 항목만 채웁니다.
    // contentHash·modifiedTime 은 손대지 않습니다. 자료가 바뀐 것이 아니라
    // 우리가 읽는 방식이 좋아진 것뿐이기 때문입니다.
    const updated: IndexEntry = {
      ...entry,
      zipFileCount: contents.fileCount,
      zipSourceCount: contents.sourceFiles.length,
    };

    try {
      updated.filePath = await rewriteMaterial(updated, buildFileNote(updated, buildZipMarkdown(contents)));
      index.entries[entry.docId] = updated;
      summary.refreshed++;
    } catch (e) {
      summary.failed++;
      summary.errors.push({
        title: entry.title,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  log.endProgress();

  if (!options.dryRun && summary.refreshed > 0) await saveIndex(index);

  return summary;
}
