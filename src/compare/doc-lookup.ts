/**
 * `NOT_FOUND` 로 남은 것들의 공식 문서를 따로 찾아오는 부분.
 *
 * ■ 6단계와 무엇이 다른가
 *
 * 6단계 `enrich` 는 "수업에서 많이 언급된 주제" 상위 40건을 요약합니다.
 * 여기서는 그 반대로, **비교에서 확인하지 못한 것만 콕 집어** 찾습니다.
 *
 *   찾는 대상   13단계가 NOT_FOUND 로 남긴 항목들
 *   찾는 곳     MDN 원문 저장소의 정해진 자리
 *   저장하는 것 상태·경고 문장·주소 (본문은 담지 않습니다)
 *
 * ■ 못 찾으면 그대로 둡니다
 *
 * 비슷한 문서를 억지로 붙이지 않습니다. 못 찾은 것은 `NOT_FOUND` 그대로입니다.
 * "모르겠다" 가 "틀린 확정" 보다 낫습니다.
 *
 * ■ 한 번 찾은 것은 다시 찾지 않습니다
 *
 * 찾은 결과(못 찾은 것도 포함)를 `data/doc-lookup.json` 에 적어 둡니다.
 * `refresh` 를 돌릴 때마다 같은 주소를 다시 두드리지 않습니다.
 */
import { mkdir, readFile } from "node:fs/promises";
import { DATA_DIR, DOC_LOOKUP_FILE } from "../config/paths.ts";
import {
  candidatePaths,
  LOOKUP_DELAY_MS,
  MAX_CANDIDATES_PER_TERM,
  mdnPageUrl,
  mdnRawUrl,
} from "../config/doc-lookup-paths.ts";
import { contentHash } from "../detect/hash.ts";
import { readDocStatus } from "../enrich/doc-status.ts";
import { describeRateLimit, fetchGithub } from "../net/github.ts";
import * as log from "../utils/logger.ts";
import { writeJsonAtomic } from "../store/atomic-write.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 찾아본 결과 하나 */
export interface LookupResult {
  /** 찾던 이름 */
  term: string;
  /** 찾았는지 */
  found: boolean;
  /** 사람이 볼 문서 주소 */
  pageUrl?: string;
  /** 공식 문서가 밝힌 상태 */
  docStatus?: string[];
  /** 문서가 적어 둔 경고 문장 */
  docStatusNote?: string;
  /** 문서 앞부분 지문 — 바뀌었는지 알아보는 데 씁니다 */
  contentHash?: string;
  /** 언제 찾아봤는지 */
  checkedAt: string;
  /** 못 찾았을 때, 몇 군데를 짚어 봤는지 */
  tried?: number;
}

/** doc-lookup.json 전체 */
interface LookupData {
  version: 1;
  updatedAt: string;
  results: Record<string, LookupResult>;
}

/** 저장된 결과를 읽습니다. */
export async function loadLookups(): Promise<Map<string, LookupResult>> {
  try {
    const parsed = JSON.parse(await readFile(DOC_LOOKUP_FILE, "utf8")) as LookupData;
    if (parsed.version !== 1) return new Map();
    return new Map(Object.entries(parsed.results ?? {}));
  } catch {
    return new Map();
  }
}

/** 결과를 저장합니다. */
async function saveLookups(results: Map<string, LookupResult>): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const sorted: Record<string, LookupResult> = {};
  for (const key of [...results.keys()].sort()) {
    const value = results.get(key);
    if (value) sorted[key] = value;
  }

  const data: LookupData = { version: 1, updatedAt: new Date().toISOString(), results: sorted };
  await writeJsonAtomic(DOC_LOOKUP_FILE, data);
}

/**
 * 문서 하나를 찾아봅니다.
 *
 * ■ "못 찾음" 을 함부로 적어 두지 않습니다 (16단계)
 *
 * 예전에는 200 이 아닌 응답을 전부 "그 자리에 없다" 로 봤습니다.
 * 그런데 요청 한도에 걸려 403 이 오면 그것도 "없다" 가 되었고,
 * 그 결과가 `doc-lookup.json` 에 **굳어 버렸습니다.**
 * 한 번 굳으면 다음 실행은 그 이름을 아예 건너뛰므로 영영 못 찾습니다.
 *
 * 그래서 한도에 걸리면 **아무 답도 적지 않고** 물러납니다.
 * 모른다고 적는 것과 아무 말도 하지 않는 것은 다릅니다.
 */
async function lookupOne(
  term: string,
  subject: string,
): Promise<{ result: LookupResult; rateLimited?: false } | { rateLimited: true; resetAt?: string }> {
  const now = new Date().toISOString();
  const paths = candidatePaths(term, subject).slice(0, MAX_CANDIDATES_PER_TERM);

  for (const path of paths) {
    const outcome = await fetchGithub(mdnRawUrl(path), { timeoutMs: 20_000 });
    await sleep(LOOKUP_DELAY_MS);

    // 한도에 걸렸으면 여기서 멈춥니다. 더 짚어 봐야 같은 답만 옵니다.
    if (outcome.kind === "rate-limited") {
      return { rateLimited: true, resetAt: outcome.resetAt };
    }

    // 404 는 "그 자리에 없다" 일 뿐입니다. 다음 자리를 짚어 봅니다.
    // 네트워크가 잠깐 흔들린 것도 마찬가지로 넘어갑니다.
    if (outcome.kind !== "ok") continue;

    const markdown = await outcome.response.text();
    const status = readDocStatus(markdown);

    // 문서에서 온 부분만 지문으로 삼습니다. (앞 4KB 면 상태·요약을 담기 충분합니다)
    return {
      result: {
        term,
        found: true,
        pageUrl: mdnPageUrl(path),
        docStatus: status.flags,
        docStatusNote: status.note,
        contentHash: contentHash(markdown.slice(0, 4096)),
        checkedAt: now,
      },
    };
  }

  return { result: { term, found: false, checkedAt: now, tried: paths.length } };
}

/**
 * 확인하지 못한 이름들의 공식 문서를 찾아옵니다.
 *
 * 이미 찾아본 이름은 건너뜁니다. (`force` 를 주면 다시 찾습니다)
 */
export async function lookupMissingDocs(
  terms: Array<{ term: string; subject: string }>,
  options: { force?: boolean } = {},
): Promise<{
  results: Map<string, LookupResult>;
  searched: number;
  found: number;
  rateLimited?: boolean;
  rateLimitResetAt?: string;
}> {
  const results = await loadLookups();

  const todo = options.force
    ? terms
    : terms.filter((item) => !results.has(item.term));

  if (todo.length === 0) return { results, searched: 0, found: 0 };

  log.detail(`공식 문서를 찾아봅니다 — ${todo.length}개 (이미 찾아본 ${results.size}개는 건너뜁니다)`);

  let found = 0;
  let done = 0;
  let rateLimited = false;
  let resetAt: string | undefined;

  for (const item of todo) {
    const outcome = await lookupOne(item.term, item.subject);

    // 한도에 걸렸으면 여기서 그만둡니다.
    // 지금까지 찾아낸 것은 그대로 두고, **못 찾았다는 답은 적지 않습니다.**
    if (outcome.rateLimited) {
      rateLimited = true;
      resetAt = outcome.resetAt;
      break;
    }

    results.set(item.term, outcome.result);
    if (outcome.result.found) found++;

    done++;
    log.progress(done, todo.length, "문서 찾기");
  }

  log.endProgress();

  if (rateLimited) {
    log.warn(describeRateLimit({ resetAt }));
    log.detail(`${done}개까지만 찾아봤습니다. 나머지는 그대로 두었습니다`);
  }

  await saveLookups(results);

  return { results, searched: done, found, rateLimited, rateLimitResetAt: resetAt };
}
