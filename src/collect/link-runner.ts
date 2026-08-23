/**
 * 1단계 실행 부분 — 기준 문서에서 링크를 뽑아 `data/links.json` 에 저장합니다.
 *
 * ■ 왜 이 파일이 따로 있는가
 *
 * 원래 이 일은 `index.ts` 안에 화면 출력과 뒤섞여 있었습니다.
 * 12단계에서 `refresh` 가 이 일을 다시 해야 하는데,
 * 화면 출력까지 딸려 오면 곤란하고 그렇다고 코드를 베껴 쓸 수도 없습니다.
 *
 * 그래서 **하는 일**만 여기로 옮기고, **보여주는 일**은 index.ts 에 그대로 두었습니다.
 * 다른 단계(collector·relate·build-learning)가 이미 이 모양이라 결도 맞습니다.
 *
 * ■ 왜 refresh 가 이것부터 해야 하는가
 *
 * 강사님이 기준 문서에 새 자료 링크를 추가하면, links.json 을 다시 만들어야
 * 그 자료가 수집 대상 목록에 들어옵니다. 이것을 건너뛰면 새 자료를 영영 못 봅니다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { BASE_DOCUMENT_ID } from "../config/base-document.ts";
import { DATA_DIR, LINKS_FILE } from "../config/paths.ts";
import { fetchAndCleanHtml } from "./docs-fetcher.ts";
import { extractLinks, type UniqueResource } from "./link-extractor.ts";
import { isCollectible, type ResourceKind } from "./url-normalizer.ts";
import { writeJsonAtomic } from "../store/atomic-write.ts";

/** 링크 추출 결과 */
export interface LinkExtractResult {
  ok: boolean;
  /** 실패했을 때의 이유 */
  reason?: string;
  /** 권한 문제로 실패했는지 */
  access?: string;

  /** 내려받은 HTML 크기(바이트) — 이미지를 뺀 뒤 */
  htmlBytes: number;
  /** 제거한 base64 이미지 개수 */
  removedImages: number;
  /** 원본 HTML 을 캐시해 둔 자리 */
  cachePath?: string;

  /** 문서에서 찾은 섹션 제목들 */
  sections: string[];
  /** 중복 포함 링크 수 */
  linkCount: number;
  /** 종류별로 묶고 중복을 제거한 자료 */
  unique: Map<ResourceKind, UniqueResource[]>;
  /** 수집 대상 합계 */
  collectibleTotal: number;
  /** ID 가 이상하게 짧은 자료 (오추출 감시용) */
  suspicious: UniqueResource[];
}

/**
 * 기준 문서를 받아 링크를 뽑고 `data/links.json` 에 저장합니다.
 *
 * 실패해도 예외를 던지지 않고 `ok: false` 로 알려 줍니다.
 * 기존 links.json 은 그대로 남으므로, 다음 단계가 예전 목록으로 계속 진행할 수 있습니다.
 */
export async function extractAndSaveLinks(): Promise<LinkExtractResult> {
  const empty = {
    htmlBytes: 0,
    removedImages: 0,
    sections: [],
    linkCount: 0,
    unique: new Map<ResourceKind, UniqueResource[]>(),
    collectibleTotal: 0,
    suspicious: [],
  };

  const fetched = await fetchAndCleanHtml(BASE_DOCUMENT_ID);

  if (!fetched.ok) {
    return { ok: false, reason: fetched.reason, access: fetched.access, ...empty };
  }

  const inventory = extractLinks(fetched.content);

  let collectibleTotal = 0;
  const suspicious: UniqueResource[] = [];

  for (const list of inventory.unique.values()) {
    for (const resource of list) {
      if (!isCollectible(resource.kind)) continue;
      collectibleTotal++;
      // 조사 중에 겪은 버그(게시형 URL 을 docId "e" 로 잘못 읽는 문제)가
      // 다시 생기지 않았는지 여기서 바로 확인합니다.
      if (resource.id.length < 10) suspicious.push(resource);
    }
  }

  // ── 저장 ──
  await mkdir(DATA_DIR, { recursive: true });

  // Map 은 JSON 으로 바로 바뀌지 않으므로 일반 객체로 풀어서 저장합니다.
  const output = {
    baseDocumentId: BASE_DOCUMENT_ID,
    extractedAt: new Date().toISOString(),
    sections: inventory.sections,
    counts: Object.fromEntries(
      [...inventory.unique.entries()].map(([kind, list]) => [kind, list.length]),
    ),
    resources: Object.fromEntries(
      [...inventory.unique.entries()].map(([kind, list]) => [kind, list]),
    ),
  };

  await writeJsonAtomic(LINKS_FILE, output);

  return {
    ok: true,
    htmlBytes: fetched.content.length,
    removedImages: fetched.removedImages,
    cachePath: fetched.cachePath,
    sections: inventory.sections,
    linkCount: inventory.links.length,
    unique: inventory.unique,
    collectibleTotal,
    suspicious,
  };
}
