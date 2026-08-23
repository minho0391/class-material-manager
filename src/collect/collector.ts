/**
 * 수집 전체를 지휘하는 부분.
 *
 * 앞에서 만든 부품들을 순서대로 불러 씁니다.
 *
 *   links.json 읽기
 *      → Drive 에 파일 정보 물어보기        (drive-api.ts)
 *      → 지난번과 같은지 판단               (index-store.ts)
 *      → 같으면 건너뛰기 ✔
 *      → 다르면 본문 받기                   (drive-api.ts)
 *      → base64 이미지 제거·정규화·해시     (detect/)
 *      → 그래도 같으면 건너뛰기 ✔
 *      → 다르면 이전 버전 보관 후 저장      (markdown-writer.ts)
 *      → 장부 갱신                          (index-store.ts)
 *
 * ■ 두 번 거르는 이유
 *
 * 첫 번째 관문은 수정 시각(modifiedTime)입니다. 본문을 받기 **전에** 판단하므로
 * 통과하면 다운로드 자체를 아낄 수 있습니다. 두 번째 실행부터 특히 빠릅니다.
 *
 * 두 번째 관문은 내용 해시입니다. 문서를 열어보기만 해도 수정 시각이 바뀌는 경우가 있어서,
 * "시각은 바뀌었지만 내용은 그대로"인 경우를 여기서 걸러냅니다.
 */
import { readFile } from "node:fs/promises";
import type { UserRefreshClient } from "google-auth-library";
import { LINKS_FILE } from "../config/paths.ts";
import { exportContent, getFileMeta } from "./drive-api.ts";
import { canonicalGoogleUrl, type ResourceKind } from "./url-normalizer.ts";
import { contentHash } from "../detect/hash.ts";
import { normalizeForHash, normalizeForStorage, stripBase64Images } from "../detect/normalize.ts";
import { loadIndex, saveIndex, type IndexEntry } from "../store/index-store.ts";
import { mergeFailures } from "../store/failure-log.ts";
import { convertBoxedContent } from "../store/markdown-cleanup.ts";
import { archivePrevious, writeMaterial } from "../store/markdown-writer.ts";
import * as log from "../utils/logger.ts";

/** links.json 안에 들어 있는 자료 하나의 모양 */
interface LinkResource {
  kind: ResourceKind;
  id: string;
  url: string;
  occurrences: Array<{ section: string | null; text: string }>;
}

/** links.json 파일 전체의 모양 */
interface LinksFile {
  resources: Partial<Record<ResourceKind, LinkResource[]>>;
}

export interface CollectOptions {
  /** 몇 건만 시험 삼아 처리하고 싶을 때. 지정하지 않으면 전부 처리합니다. */
  limit?: number;
  /** 동시에 보낼 요청 수. 너무 높이면 구글이 요청을 거부할 수 있습니다. */
  concurrency?: number;
  /** 요청 사이에 쉬는 시간(밀리초) */
  delayMs?: number;
  /** 내용이 같아도 무조건 다시 저장할지 */
  force?: boolean;
}

/** 한 건을 처리한 결과 */
type ItemOutcome = "created" | "updated" | "unchanged" | "skipped" | "failed";

export interface CollectSummary {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  failures: Array<{ docId: string; title?: string; code: string; reason: string }>;

  /** 코드블록으로 되돌린 1칸 표의 총 개수 */
  convertedBoxes: number;
  /** 손대지 않은 진짜 표(2칸 이상)의 총 개수 */
  keptTables: number;
}

/** 잠깐 쉽니다. 구글 서버에 한꺼번에 몰리지 않도록 하는 배려입니다. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 이번 단계에서 본문을 받아올 자료 종류.
 *
 * 게시형 문서(/d/e/…/pub)는 Drive 파일 ID 가 아니라 "게시 주소"라서
 * Drive API 로는 조회할 수 없습니다. PDF 와 함께 다음 단계에서 다룹니다.
 */
const TARGET_KINDS: ResourceKind[] = ["document", "spreadsheet", "presentation"];

/** links.json 에서 이번에 처리할 대상을 골라 옵니다. */
async function loadTargets(limit?: number): Promise<LinkResource[]> {
  const raw = await readFile(LINKS_FILE, "utf8");
  const parsed = JSON.parse(raw) as LinksFile;

  const targets: LinkResource[] = [];
  for (const kind of TARGET_KINDS) {
    targets.push(...(parsed.resources[kind] ?? []));
  }

  // 순서를 고정합니다. 시험 실행에서 본 것과 전체 실행에서 처리되는 것이
  // 같은 순서가 되도록 하기 위해서입니다.
  targets.sort((a, b) => a.id.localeCompare(b.id));

  return limit === undefined ? targets : targets.slice(0, limit);
}

/**
 * 자료 한 건을 처리합니다.
 *
 * 예외를 밖으로 던지지 않고 결과를 값으로 돌려줍니다.
 * 한 건이 실패해도 나머지 수백 건은 계속 처리되어야 하기 때문입니다.
 */
async function processOne(
  client: UserRefreshClient,
  resource: LinkResource,
  existing: IndexEntry | undefined,
  options: CollectOptions,
): Promise<{ outcome: ItemOutcome; entry?: IndexEntry; failure?: CollectSummary["failures"][0] }> {
  // ── 1) 파일 정보를 먼저 물어본다 (본문은 아직 받지 않는다) ──
  const meta = await getFileMeta(client, resource.id);

  if (!meta.ok) {
    return {
      outcome: "failed",
      failure: { docId: resource.id, code: meta.code, reason: meta.reason },
    };
  }

  if (meta.value.trashed) {
    return {
      outcome: "skipped",
      failure: {
        docId: resource.id,
        title: meta.value.name,
        code: "trashed",
        reason: "휴지통에 있는 파일입니다.",
      },
    };
  }

  // ── 2) 첫 번째 관문: 수정 시각이 그대로면 본문을 받지 않는다 ──
  if (!options.force && existing && existing.modifiedTime === meta.value.modifiedTime) {
    return { outcome: "unchanged", entry: existing };
  }

  // ── 3) 본문을 받는다 ──
  const fetched = await exportContent(client, meta.value);

  if (!fetched.ok) {
    return {
      outcome: "failed",
      failure: {
        docId: resource.id,
        title: meta.value.name,
        code: fetched.code,
        reason: fetched.reason,
      },
    };
  }

  // ── 4) base64 이미지를 걷어낸다 ──
  // Markdown 으로 받으면 이미지가 문서 맨 아래에 참조 정의로 붙는데,
  // 실제로 확인해 보니 본문 42,097자짜리 문서가 이것 때문에 2.9MB 였습니다.
  const stripped =
    fetched.value.format === "markdown"
      ? stripBase64Images(fetched.value.content)
      : { text: fetched.value.content, removed: 0 };

  // ── 5) 1칸짜리 표에 뭉쳐 있는 여러 줄을 코드블록으로 되돌린다 ──
  // 2칸 이상인 진짜 표는 건드리지 않습니다.
  const cleaned =
    fetched.value.format === "markdown"
      ? convertBoxedContent(stripped.text)
      : { text: stripped.text, converted: 0, keptSingle: 0, keptTable: 0 };

  // ── 6) 두 번째 관문: 내용 해시가 그대로면 저장하지 않는다 ──
  const hash = contentHash(normalizeForHash(cleaned.text));

  const now = new Date().toISOString();

  if (!options.force && existing && existing.contentHash === hash) {
    // 내용은 그대로지만 수정 시각은 바뀌었으므로 그것만 갱신해 둡니다.
    // 그래야 다음 실행에서 첫 번째 관문을 통과해 본문을 다시 받지 않습니다.
    return {
      outcome: "unchanged",
      entry: {
        ...existing,
        modifiedTime: meta.value.modifiedTime,
        driveVersion: meta.value.version,
      },
    };
  }

  // ── 7) 저장한다 ──
  const entry: IndexEntry = {
    docId: resource.id,
    kind: resource.kind,
    title: meta.value.name,
    mimeType: meta.value.mimeType,
    format: fetched.value.format,
    sourceUrl: canonicalGoogleUrl(resource.kind, resource.id),
    occurrences: resource.occurrences,
    contentHash: hash,
    modifiedTime: meta.value.modifiedTime,
    driveVersion: meta.value.version,
    collectedAt: existing?.collectedAt ?? now,
    updatedAt: now,
    filePath: "", // 저장 후 아래에서 채웁니다
    subject: existing?.subject,
    viaFallback: fetched.value.viaFallback,
    removedImages: stripped.removed,
    convertedBoxes: cleaned.converted,
    keptTables: cleaned.keptTable,
  };

  // 내용이 바뀐 경우 이전 파일을 history 로 옮겨 보관합니다.
  if (existing?.filePath) {
    await archivePrevious(entry, existing.filePath);
  }

  entry.filePath = await writeMaterial(entry, normalizeForStorage(cleaned.text));

  return { outcome: existing ? "updated" : "created", entry };
}

/**
 * 여러 건을 정해진 수만큼 동시에 처리합니다.
 *
 * 한꺼번에 400건을 요청하면 구글이 거부하고, 하나씩 처리하면 너무 느립니다.
 * 일꾼을 몇 명 두고 각자 다음 일감을 집어 가는 방식으로 그 사이를 맞춥니다.
 */
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
 * 수집을 실행합니다.
 *
 * @param client 인증된 클라이언트
 * @param options 시험 실행이면 limit 을 주세요. 옵션 외에는 전체 실행과 완전히 같습니다.
 */
export async function collect(
  client: UserRefreshClient,
  options: CollectOptions = {},
): Promise<CollectSummary> {
  const { concurrency = 4, delayMs = 120 } = options;

  const targets = await loadTargets(options.limit);
  const index = await loadIndex();

  const summary: CollectSummary = {
    total: targets.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    convertedBoxes: 0,
    keptTables: 0,
  };

  let done = 0;

  await runPool(targets, concurrency, delayMs, async (resource) => {
    const result = await processOne(client, resource, index.entries[resource.id], options);

    // 결과를 집계합니다.
    summary[result.outcome]++;
    if (result.entry) {
      index.entries[resource.id] = result.entry;
      // 새로 저장한 경우에만 표 변환 통계를 더합니다.
      if (result.outcome === "created" || result.outcome === "updated") {
        summary.convertedBoxes += result.entry.convertedBoxes ?? 0;
        summary.keptTables += result.entry.keptTables ?? 0;
      }
    }
    if (result.failure) summary.failures.push(result.failure);

    done++;
    log.progress(done, targets.length, "수집");
  });

  log.endProgress();

  await saveIndex(index);

  // 실패 목록을 남겨 나중에 재시도할 수 있게 합니다.
  // 덮어쓰지 않고 합치는 이유는, 4단계에서 기록한 실패가 지워지지 않게 하기 위해서입니다.
  await mergeFailures(summary.failures, "3단계 문서 수집");

  return summary;
}
