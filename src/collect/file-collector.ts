/**
 * 4단계 수집을 지휘하는 부분 — 문서가 아닌 자료들.
 *
 * 3단계에서 Google 문서 217건을 받았고, 여기서는 나머지를 다룹니다.
 *
 *   Drive 파일 182건   PDF·zip·이미지 등
 *   Drive 폴더 4개     안에 무엇이 있는지 목록을 만든다
 *   게시형 문서 1건    /d/e/…/pub 주소라 Drive API 로는 못 여는 문서
 *
 * ■ 3단계와 다른 점
 *
 * 변경 감지를 **md5Checksum** 으로 합니다.
 * Google 문서는 이 값이 오지 않아 본문을 받아 직접 해시를 계산해야 했지만,
 * 바이너리 파일에는 Drive 가 지문을 그대로 알려줍니다.
 * 덕분에 471MB 짜리 zip 더미를 매번 다시 받지 않아도 됩니다.
 *
 * ■ 전부 받지는 않습니다
 *
 * 무엇을 받고 무엇을 목록만 남길지는 config/file-policy.ts 가 정합니다.
 * 수업영상 431개(72.7GB)처럼 받을 수 없는 자료가 실제로 있기 때문입니다.
 */
import { readFile } from "node:fs/promises";
import type { UserRefreshClient } from "google-auth-library";
import { LINKS_FILE } from "../config/paths.ts";
import { decideAction, extensionOf, isGoogleNativeType } from "../config/file-policy.ts";
import { downloadBinary, getBinaryMeta, type DriveBinaryMeta } from "./drive-file-fetcher.ts";
import { buildFolderListingMarkdown, listFolder, type FolderItem } from "./drive-folder.ts";
import { exportContent, getFileMeta } from "./drive-api.ts";
import { fetchPublishedDoc } from "./published-doc.ts";
import { extractPdfText } from "./pdf-text.ts";
import { buildZipMarkdown, isZipMime, readZipContents } from "./zip-text.ts";
import { canonicalGoogleUrl, type ResourceKind } from "./url-normalizer.ts";
import { contentHash } from "../detect/hash.ts";
import { normalizeForHash, normalizeForStorage, stripBase64Images } from "../detect/normalize.ts";
import { loadIndex, saveIndex, type IndexEntry } from "../store/index-store.ts";
import { mergeFailures } from "../store/failure-log.ts";
import { convertBoxedContent } from "../store/markdown-cleanup.ts";
import { archivePrevious, writeBinaryFile, writeMaterial } from "../store/markdown-writer.ts";
import * as log from "../utils/logger.ts";

/** links.json 안의 자료 하나 */
interface LinkResource {
  kind: ResourceKind;
  id: string;
  url: string;
  occurrences: Array<{ section: string | null; text: string }>;
}

interface LinksFile {
  resources: Partial<Record<ResourceKind, LinkResource[]>>;
}

export interface FileCollectOptions {
  limit?: number;
  concurrency?: number;
  delayMs?: number;
  force?: boolean;
  /** 폴더 안에서 새로 찾은 파일도 받을지 (기본 true) */
  includeFolderItems?: boolean;
}

export interface FileCollectSummary {
  /** Drive 파일 처리 결과 */
  downloaded: number;
  listedOnly: number;
  unchanged: number;
  failed: number;
  /** 폴더 처리 결과 */
  foldersListed: number;
  folderItemsFound: number;
  /** 게시형 문서 처리 결과 */
  publishedOk: number;
  /** 내려받은 총 바이트 */
  bytesDownloaded: number;
  failures: Array<{ docId: string; title?: string; code: string; reason: string }>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 바이트를 읽기 좋은 크기 표기로 */
function humanSize(bytes: number | undefined): string {
  if (bytes === undefined) return "알 수 없음";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 파일 자료의 설명 Markdown 을 만듭니다.
 *
 * PDF 는 뽑아낸 글자를, zip 은 안에 든 파일 구조와 소스코드를 그대로 싣고,
 * 나머지는 "무슨 파일인지"를 적습니다.
 * 내용이 없더라도 이 Markdown 이 있어야 5단계에서 과목별로 분류할 수 있습니다.
 *
 * 8단계에서 zip 을 다시 읽는 도구(zip-refresh.ts)도 이 함수를 그대로 씁니다.
 * 그래야 처음 수집할 때와 다시 읽을 때의 결과가 한 글자도 다르지 않습니다.
 */
export function buildFileNote(entry: IndexEntry, extractedText: string): string {
  const lines: string[] = [];

  lines.push(`# ${entry.title}`);
  lines.push("");

  const facts: string[] = [`- **종류**: ${entry.mimeType}`, `- **크기**: ${humanSize(entry.sizeBytes)}`];
  if (entry.pageCount !== undefined) facts.push(`- **쪽수**: ${entry.pageCount}쪽`);
  facts.push(`- **원본**: [Drive 에서 열기](${entry.sourceUrl})`);
  if (entry.downloadPath) facts.push(`- **저장 위치**: \`${entry.downloadPath}\``);
  if (entry.discoveredIn) facts.push(`- **찾은 곳**: ${entry.discoveredIn}`);

  lines.push(...facts);
  lines.push("");

  if (entry.fileAction === "list-only") {
    lines.push("> 이 파일은 내려받지 않았습니다.");
    if (entry.fileActionReason) lines.push(`> ${entry.fileActionReason}`);
    lines.push("> 위 원본 링크로 바로 열어볼 수 있습니다.");
    lines.push("");
    return lines.join("\n");
  }

  if (extractedText) {
    // zip 은 본문이 이미 "## 압축파일 구성" 이라는 제목으로 시작하므로 구분선이 필요 없습니다.
    // PDF 는 글자가 곧바로 이어지기 때문에 구분선이 있어야 어디부터 본문인지 보입니다.
    if (!extractedText.startsWith("##")) {
      lines.push("---");
      lines.push("");
    }
    lines.push(extractedText);
    lines.push("");
  } else if (entry.mimeType === "application/pdf") {
    lines.push("> 이 PDF 에서는 글자를 뽑아내지 못했습니다.");
    lines.push("> 그림으로만 이루어진 문서일 수 있습니다. 원본 파일은 저장되어 있습니다.");
    lines.push("");
  } else if (isZipMime(entry.mimeType)) {
    lines.push("> 이 압축파일은 내용을 읽지 못했습니다.");
    lines.push("> 원본 파일은 위 저장 위치에 보관되어 있습니다.");
    lines.push("");
  } else {
    lines.push("> 그림처럼 글자를 뽑을 수 없는 자료입니다.");
    lines.push("> 원본 파일은 위 저장 위치에 보관되어 있습니다.");
    lines.push("");
  }

  return lines.join("\n");
}

/** 한 건을 처리한 결과 */
type FileOutcome = "downloaded" | "listedOnly" | "unchanged" | "failed";

interface ProcessResult {
  outcome: FileOutcome;
  entry?: IndexEntry;
  bytes?: number;
  failure?: FileCollectSummary["failures"][0];
}

/**
 * Drive 파일 한 건을 처리합니다.
 *
 * @param meta 이미 조회한 파일 정보가 있으면 넘겨주세요. (폴더 안 파일은 목록에 정보가 들어 있습니다)
 */
async function processFile(
  client: UserRefreshClient,
  fileId: string,
  occurrences: IndexEntry["occurrences"],
  existing: IndexEntry | undefined,
  options: FileCollectOptions,
  presetMeta?: DriveBinaryMeta,
  discoveredIn?: string,
): Promise<ProcessResult> {
  // ── 1) 파일 정보 ──
  let meta = presetMeta;

  if (!meta) {
    const fetched = await getBinaryMeta(client, fileId);
    if (!fetched.ok) {
      return {
        outcome: "failed",
        failure: { docId: fileId, code: fetched.code, reason: fetched.reason },
      };
    }
    meta = fetched.value;
  }

  if (meta.trashed) {
    return {
      outcome: "failed",
      failure: { docId: fileId, title: meta.name, code: "trashed", reason: "휴지통에 있습니다." },
    };
  }

  const now = new Date().toISOString();

  // ── 2) Google 문서가 파일 목록에 섞여 있는 경우 ──
  // 링크는 drive.google.com 형태인데 실제로는 Google 문서인 자료가 1건 있었습니다.
  // 이런 자료는 3단계와 같은 방식(export)으로 받아야 합니다.
  if (isGoogleNativeType(meta.mimeType)) {
    return processNativeDoc(client, fileId, meta, occurrences, existing, options, discoveredIn);
  }

  // ── 3) 받을지 목록만 남길지 정한다 ──
  const decision = decideAction(meta.mimeType, meta.sizeBytes);

  const baseEntry: IndexEntry = {
    docId: fileId,
    kind: "drive-file",
    title: meta.name,
    mimeType: meta.mimeType,
    format: "plain",
    sourceUrl: canonicalGoogleUrl("drive-file", fileId),
    occurrences,
    contentHash: meta.md5Checksum ? `md5:${meta.md5Checksum}` : `none:${meta.modifiedTime}`,
    modifiedTime: meta.modifiedTime,
    collectedAt: existing?.collectedAt ?? now,
    updatedAt: now,
    filePath: "",
    subject: existing?.subject,
    md5Checksum: meta.md5Checksum,
    sizeBytes: meta.sizeBytes,
    fileAction: decision.action,
    fileActionReason: decision.reason || undefined,
    discoveredIn,
  };

  // ── 4) 변경 감지: md5 가 같으면 다시 받지 않는다 ──
  const unchanged =
    !options.force && existing !== undefined && existing.contentHash === baseEntry.contentHash;

  if (unchanged) {
    return { outcome: "unchanged", entry: { ...existing, updatedAt: existing.updatedAt } };
  }

  // ── 5) 목록만 남기는 경우 ──
  if (decision.action === "list-only") {
    baseEntry.filePath = await writeMaterial(baseEntry, buildFileNote(baseEntry, ""));
    return { outcome: "listedOnly", entry: baseEntry };
  }

  // ── 6) 실제로 내려받는다 ──
  const downloaded = await downloadBinary(client, fileId);

  if (!downloaded.ok) {
    return {
      outcome: "failed",
      failure: {
        docId: fileId,
        title: meta.name,
        code: downloaded.code,
        reason: downloaded.reason,
      },
    };
  }

  const bytes = downloaded.value;

  // 이전 파일이 있으면 보관해 둡니다.
  if (existing?.filePath) await archivePrevious(baseEntry, existing.filePath);

  baseEntry.downloadPath = await writeBinaryFile(
    meta.name,
    fileId,
    extensionOf(meta.name, meta.mimeType),
    bytes,
  );

  // ── 7) 내용을 뽑아낸다 ──
  //
  //   PDF → 글자 (unpdf)
  //   zip → 파일 구조 + 소스코드 (fflate)
  //
  // 둘 다 실패해도 파일은 이미 저장되어 있으므로 잃는 것이 없습니다.
  let extracted = "";

  if (meta.mimeType === "application/pdf") {
    const result = await extractPdfText(bytes);
    if (result.ok) {
      extracted = result.text;
      baseEntry.pageCount = result.pageCount;
    }
  } else if (isZipMime(meta.mimeType)) {
    const contents = readZipContents(bytes);
    if (contents.ok) {
      extracted = buildZipMarkdown(contents);
      baseEntry.zipFileCount = contents.fileCount;
      baseEntry.zipSourceCount = contents.sourceFiles.length;
    }
  }

  baseEntry.filePath = await writeMaterial(baseEntry, buildFileNote(baseEntry, extracted));

  return { outcome: "downloaded", entry: baseEntry, bytes: bytes.length };
}

/**
 * 파일 목록에 섞여 있던 Google 문서를 3단계와 같은 방식으로 처리합니다.
 *
 * 코드가 3단계 collector 와 비슷하지만, 이런 자료가 1건뿐이라
 * 두 곳을 하나로 합치기보다 각자 두는 편이 읽기 쉽습니다.
 */
async function processNativeDoc(
  client: UserRefreshClient,
  fileId: string,
  binaryMeta: DriveBinaryMeta,
  occurrences: IndexEntry["occurrences"],
  existing: IndexEntry | undefined,
  options: FileCollectOptions,
  discoveredIn?: string,
): Promise<ProcessResult> {
  const meta = await getFileMeta(client, fileId);
  if (!meta.ok) {
    return {
      outcome: "failed",
      failure: { docId: fileId, title: binaryMeta.name, code: meta.code, reason: meta.reason },
    };
  }

  if (!options.force && existing && existing.modifiedTime === meta.value.modifiedTime) {
    return { outcome: "unchanged", entry: existing };
  }

  const fetched = await exportContent(client, meta.value);
  if (!fetched.ok) {
    return {
      outcome: "failed",
      failure: {
        docId: fileId,
        title: meta.value.name,
        code: fetched.code,
        reason: fetched.reason,
      },
    };
  }

  const stripped =
    fetched.value.format === "markdown"
      ? stripBase64Images(fetched.value.content)
      : { text: fetched.value.content, removed: 0 };

  const cleaned =
    fetched.value.format === "markdown"
      ? convertBoxedContent(stripped.text)
      : { text: stripped.text, converted: 0, keptSingle: 0, keptTable: 0 };

  const now = new Date().toISOString();

  const entry: IndexEntry = {
    docId: fileId,
    kind: "document",
    title: meta.value.name,
    mimeType: meta.value.mimeType,
    format: fetched.value.format,
    sourceUrl: canonicalGoogleUrl("document", fileId),
    occurrences,
    contentHash: contentHash(normalizeForHash(cleaned.text)),
    modifiedTime: meta.value.modifiedTime,
    driveVersion: meta.value.version,
    collectedAt: existing?.collectedAt ?? now,
    updatedAt: now,
    filePath: "",
    subject: existing?.subject,
    removedImages: stripped.removed,
    convertedBoxes: cleaned.converted,
    keptTables: cleaned.keptTable,
    discoveredIn,
  };

  if (existing?.filePath) await archivePrevious(entry, existing.filePath);
  entry.filePath = await writeMaterial(entry, normalizeForStorage(cleaned.text));

  return { outcome: "downloaded", entry };
}

/** 여러 건을 정해진 수만큼 동시에 처리합니다. */
async function runPool<T>(
  items: T[],
  concurrency: number,
  delayMs: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) return;
      await worker(item);
      if (delayMs > 0) await sleep(delayMs);
    }
  });

  await Promise.all(runners);
}

/**
 * 4단계 수집을 실행합니다.
 */
export async function collectFiles(
  client: UserRefreshClient,
  options: FileCollectOptions = {},
): Promise<FileCollectSummary> {
  const { concurrency = 3, delayMs = 150, includeFolderItems = true } = options;

  const parsed = JSON.parse(await readFile(LINKS_FILE, "utf8")) as LinksFile;
  const index = await loadIndex();

  const summary: FileCollectSummary = {
    downloaded: 0,
    listedOnly: 0,
    unchanged: 0,
    failed: 0,
    foldersListed: 0,
    folderItemsFound: 0,
    publishedOk: 0,
    bytesDownloaded: 0,
    failures: [],
  };

  /** 처리 결과를 집계에 반영합니다. */
  const apply = (result: ProcessResult): void => {
    if (result.outcome === "downloaded") summary.downloaded++;
    else if (result.outcome === "listedOnly") summary.listedOnly++;
    else if (result.outcome === "unchanged") summary.unchanged++;
    else summary.failed++;

    if (result.entry) index.entries[result.entry.docId] = result.entry;
    if (result.failure) summary.failures.push(result.failure);
    if (result.bytes) summary.bytesDownloaded += result.bytes;
  };

  // ── 1. Drive 파일 ──
  const allFiles = [...(parsed.resources["drive-file"] ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const files = options.limit === undefined ? allFiles : allFiles.slice(0, options.limit);

  if (files.length > 0) {
    log.step(`Drive 파일 ${files.length}건`);
    let done = 0;

    await runPool(files, concurrency, delayMs, async (resource) => {
      const result = await processFile(
        client,
        resource.id,
        resource.occurrences,
        index.entries[resource.id],
        options,
      );
      apply(result);
      done++;
      log.progress(done, files.length, "파일");
    });

    log.endProgress();
  }

  // ── 2. Drive 폴더 ──
  const folders = parsed.resources["drive-folder"] ?? [];

  for (const folder of folders) {
    const fallbackName = folder.occurrences[0]?.text || `폴더 ${folder.id.slice(0, 8)}`;
    log.step(`Drive 폴더 "${fallbackName}"`);

    const listing = await listFolder(client, folder.id, fallbackName);

    if (!listing.ok) {
      summary.failed++;
      summary.failures.push({
        docId: folder.id,
        title: fallbackName,
        code: listing.code,
        reason: listing.reason,
      });
      log.detail(`목록을 가져오지 못했습니다: ${listing.reason.slice(0, 80)}`);
      continue;
    }

    const items = listing.value.items;
    summary.foldersListed++;
    summary.folderItemsFound += items.length;
    log.detail(`파일 ${items.length}개`);

    // 폴더 내용을 표로 정리해 저장합니다.
    const now = new Date().toISOString();
    const existingFolder = index.entries[folder.id];
    const totalBytes = items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
    const markdown = buildFolderListingMarkdown(listing.value);

    const folderEntry: IndexEntry = {
      docId: folder.id,
      kind: "drive-folder",
      title: `${listing.value.folderName} (폴더 목록)`,
      mimeType: "application/vnd.google-apps.folder",
      format: "markdown",
      sourceUrl: canonicalGoogleUrl("drive-folder", folder.id),
      occurrences: folder.occurrences,
      contentHash: contentHash(normalizeForHash(markdown)),
      modifiedTime: now,
      collectedAt: existingFolder?.collectedAt ?? now,
      updatedAt: now,
      filePath: "",
      subject: existingFolder?.subject,
      sizeBytes: totalBytes,
      fileAction: "list-only",
      fileActionReason: `파일 ${items.length}개, 총 ${humanSize(totalBytes)}`,
    };

    const folderChanged = existingFolder?.contentHash !== folderEntry.contentHash;

    if (folderChanged || options.force) {
      if (existingFolder?.filePath) await archivePrevious(folderEntry, existingFolder.filePath);
      folderEntry.filePath = await writeMaterial(folderEntry, markdown);
      index.entries[folder.id] = folderEntry;
      summary.listedOnly++;
    } else {
      summary.unchanged++;
    }

    // 폴더 안에서 찾은 파일 중 "받기로 정한 것"만 개별 처리합니다.
    // 영상처럼 목록만 남길 자료까지 하나하나 파일로 만들면
    // 431개의 빈 설명 파일이 생겨 오히려 방해가 됩니다.
    if (!includeFolderItems) continue;

    const worthDownloading = items.filter(
      (item) =>
        !isGoogleNativeType(item.mimeType) &&
        decideAction(item.mimeType, item.sizeBytes).action === "download",
    );

    if (worthDownloading.length === 0) {
      log.detail("내려받을 파일은 없습니다 (목록만 저장)");
      continue;
    }

    log.detail(`이 중 ${worthDownloading.length}개를 내려받습니다`);
    let done = 0;

    await runPool(worthDownloading, concurrency, delayMs, async (item: FolderItem) => {
      const result = await processFile(
        client,
        item.id,
        [{ section: listing.value.folderName, text: item.name }],
        index.entries[item.id],
        options,
        {
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          modifiedTime: item.modifiedTime ?? now,
          sizeBytes: item.sizeBytes,
          md5Checksum: item.md5Checksum,
        },
        `Drive 폴더: ${listing.value.folderName}`,
      );
      apply(result);
      done++;
      log.progress(done, worthDownloading.length, "폴더 파일");
    });

    log.endProgress();
  }

  // ── 3. 게시형 문서 ──
  const published = parsed.resources["published-document"] ?? [];

  for (const doc of published) {
    log.step("게시형 문서 (/d/e/…/pub)");

    const fetched = await fetchPublishedDoc(doc.id);

    if (!fetched.ok) {
      summary.failed++;
      summary.failures.push({ docId: doc.id, code: fetched.code, reason: fetched.reason });
      log.detail(`가져오지 못했습니다: ${fetched.reason.slice(0, 80)}`);
      continue;
    }

    const now = new Date().toISOString();
    const existing = index.entries[doc.id];
    const hash = contentHash(normalizeForHash(fetched.value.markdown));

    if (!options.force && existing?.contentHash === hash) {
      summary.unchanged++;
      log.detail(`변경 없음 — ${fetched.value.title}`);
      continue;
    }

    const entry: IndexEntry = {
      docId: doc.id,
      kind: "published-document",
      title: fetched.value.title,
      mimeType: "text/html",
      format: "markdown",
      sourceUrl: canonicalGoogleUrl("published-document", doc.id),
      occurrences: doc.occurrences,
      contentHash: hash,
      modifiedTime: now,
      collectedAt: existing?.collectedAt ?? now,
      updatedAt: now,
      filePath: "",
      subject: existing?.subject,
    };

    if (existing?.filePath) await archivePrevious(entry, existing.filePath);
    entry.filePath = await writeMaterial(entry, normalizeForStorage(fetched.value.markdown));

    index.entries[doc.id] = entry;
    summary.publishedOk++;
    log.detail(`저장했습니다 — ${fetched.value.title}`);
  }

  await saveIndex(index);
  await mergeFailures(summary.failures, "4단계 파일·폴더 수집");

  return summary;
}

/** 요약을 사람이 읽기 좋게 만들어 돌려줍니다. (index.ts 에서 출력에 씁니다) */
export function formatBytes(bytes: number): string {
  return humanSize(bytes);
}
