/**
 * 6단계를 지휘하는 부분 — 공식 문서로 보충하기.
 *
 * 과목마다 이렇게 진행합니다.
 *
 *   1. 공식 문서 목록을 받아 INDEX.md 로 저장          (가벼운 색인)
 *   2. 그 과목 수업자료 본문을 전부 읽어 하나로 합침
 *   3. 목록 중 수업에서 실제로 다룬 주제를 골라냄       (topic-matcher)
 *   4. 고른 문서의 원문을 받아 요약해 저장             (summarizer)
 *
 * ■ 저장하는 것은 요약뿐입니다
 *
 * 원문을 그대로 담지 않습니다. 핵심 설명·학습 포인트·예제 하나·출처 주소만 남깁니다.
 * (React 의 useState 문서 하나가 38KB 인데, 요약하면 1KB 남짓입니다)
 */
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash } from "../detect/hash.ts";
import { readDocStatus, type DocStatus } from "./doc-status.ts";
import {
  DOC_SOURCES,
  FETCH_DELAY_MS,
  MAX_SUMMARIES_PER_SUBJECT,
  type DocSource,
} from "../config/doc-sources.ts";
import { REFERENCES_DIR } from "../config/paths.ts";
import { loadIndex, type IndexEntry } from "../store/index-store.ts";
import { referenceFileName } from "../store/markdown-writer.ts";
import { fetchIndex, type DocIndexEntry } from "./index-fetcher.ts";
import {
  COLLECT_STATUS,
  combineWithContent,
  summarizeAttempts,
  overallStatus,
  type CollectStatus,
  type SourceAttempt,
} from "./collect-status.ts";
import { collectDocuments, type DocumentFailure, type RetryDeps } from "../net/fetch-retry.ts";
import { FAILURE_LABEL, type FailureType } from "../net/failure.ts";
import { describeRateLimit, hasGithubToken } from "../net/github.ts";
import { saveCollectStatus } from "../store/collect-status-store.ts";
import { ruleBasedSummarizer, type DocSummary, type Summarizer } from "./summarizer.ts";
import { collectMaterialText, matchTopics, type MatchedTopic } from "./topic-matcher.ts";
import * as log from "../utils/logger.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface EnrichOptions {
  /** 특정 과목만 처리하고 싶을 때 */
  only?: string;
  /** 과목당 요약 개수 상한 */
  limit?: number;
  /** 색인만 만들고 요약은 건너뛸지 */
  indexOnly?: boolean;
  /**
   * 다시 하기·기다리기를 밖에서 갈아 끼울 수 있게 합니다. (17단계)
   *
   * 시험이 실제로 몇 분씩 기다리지 않게 하려는 것입니다. 평소에는 비워 둡니다.
   */
  retry?: RetryDeps;
}

export interface SubjectResult {
  subject: string;
  name: string;
  /** 공식 문서 목록 개수 */
  indexCount: number;
  /** 그중 한국어 문서 */
  koreanCount: number;
  /** 수업자료와 매칭된 개수 */
  matchedCount: number;
  /** 실제로 요약을 만든 개수 */
  summarized: number;

  // ── 지난번과 견준 결과 (12단계) ──
  /** 처음 만든 요약본 */
  created: number;
  /** 공식 문서 내용이 바뀌어 다시 쓴 것 */
  documentChanged: number;
  /** 문서는 그대로인데 수업자료 연결이 바뀌어 다시 쓴 것 */
  relinked: number;
  /** 지문이 없던 예전 파일에 지문만 붙인 것 (첫 실행에서만 나옵니다) */
  fingerprinted: number;
  /** 아무것도 바뀌지 않아 파일을 건드리지 않은 것 */
  unchanged: number;
  /**
   * 예전 실행 때 만들어졌지만 이번에는 주제로 뽑히지 않은 요약본.
   *
   * **지우지 않습니다.** 수업자료가 조금 바뀌어 순위에서 밀렸을 뿐일 수 있고,
   * 다음 실행에 다시 올라올 수도 있습니다. 지웠다 만들었다 하면 오히려 어지럽습니다.
   * 몇 건이 그런 상태인지 알려만 줍니다.
   */
  stale: number;

  /** 이름이 겹쳐 건너뛴 문서 (언급이 많은 쪽을 남깁니다) */
  nameConflicts: number;

  /** 요약을 만들지 못한 개수 */
  failed: number;

  // ── 16단계: 가져왔는가 ──
  //
  // "몇 건" 과 "어떻게 됐는가" 는 다른 이야기입니다.
  // 못 받아서 0건인 것과 원래 0건인 것을 이 칸이 가릅니다.
  /** 이 과목의 공식 문서를 가져왔는가 */
  collectStatus: CollectStatus;
  /** 출처마다 무슨 일이 있었는지 */
  attempts: SourceAttempt[];
  /** 요청 한도에 걸렸는지 */
  rateLimited: boolean;
  /** 언제 다시 할 수 있는지 (알 수 있을 때만) */
  rateLimitResetAt?: string;
  /** 이미 가진 요약본 수 — STALE 과 FAILED 를 가르는 근거 */
  existingSummaries: number;

  // ── 17단계: 원문을 얼마나 받았는가 ──
  //
  // 16단계는 목록까지만 봤습니다. 목록을 정상으로 받고도
  // 원문 50건 중 5건을 못 받을 수 있는데, 그것을 `failed` 하나로만 세면
  // "무엇이 왜 안 됐는지" 를 알 수 없습니다.
  /** 원문을 요청해 본 문서 수 */
  contentAttempted: number;
  /** 받아 온 문서 수 */
  contentSucceeded: number;
  /** 요청 한도 때문에 손도 못 댄 문서 수 */
  contentSkipped: number;
  /** 못 받은 문서들 (개수 상한 있음) */
  contentFailures: DocumentFailure[];
  /** 원문 총 글자수 → 요약 총 글자수 */
  originalChars: number;
  summaryChars: number;
  reason?: string;
}

export interface EnrichSummary {
  results: SubjectResult[];
  totalSummarized: number;
  /** 공식 문서가 실제로 바뀐 건수 — 12단계 refresh 가 이 값으로 최신 여부를 알립니다 */
  totalDocumentChanged: number;
  /** 새로 생긴 요약본 */
  totalCreated: number;
  /** 그대로인 요약본 */
  totalUnchanged: number;
  /** 이번에 뽑히지 않았지만 폴더에 남아 있는 예전 요약본 */
  totalStale: number;

  // ── 16단계 ──
  /** 전체적으로 공식 문서를 가져왔는가 */
  status: CollectStatus;
  /** 요청 한도에 걸린 과목이 있는지 */
  rateLimited: boolean;
  /** 언제 다시 할 수 있는지 */
  rateLimitResetAt?: string;
  /** 새로 받지 못해 예전 자료를 쓴 과목 */
  staleSubjects: string[];
  /** 받지도 못했고 예전 자료도 없는 과목 */
  failedSubjects: string[];
  /** 토큰을 썼는지 — 값은 절대 담지 않습니다 */
  usedToken: boolean;

  // ── 17단계: 원문을 얼마나 받았는가 ──
  /** 원문을 요청해 본 문서 수 */
  contentAttempted: number;
  /** 받아 온 문서 수 */
  contentSucceeded: number;
  /** 요청 한도 때문에 손도 못 댄 문서 수 */
  contentSkipped: number;
  /** 못 받은 문서들 (과목 이름을 붙여 모읍니다) */
  contentFailures: Array<DocumentFailure & { subject: string }>;
}

/** 색인을 사람이 읽을 수 있는 Markdown 으로 만듭니다. */
function buildIndexMarkdown(source: DocSource, docs: DocIndexEntry[], koreanCount: number): string {
  const lines: string[] = [];

  lines.push(`# ${source.name} — 문서 색인`);
  lines.push("");
  lines.push(`- 공식 문서: <${source.homeUrl}>`);
  lines.push(`- 문서 수: ${docs.length}개${koreanCount > 0 ? ` (한국어 번역 ${koreanCount}개)` : ""}`);
  lines.push(`- 조회일: ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push("> 이 파일은 **목록**입니다. 내용은 담지 않고 제목과 주소만 적어 둡니다.");
  lines.push("> 수업에서 다룬 주제는 이 폴더 안에 요약본이 따로 있습니다.");
  lines.push("");

  // llms.txt 는 묶음(섹션)이 있으므로 그대로 살립니다.
  const bySection = new Map<string, DocIndexEntry[]>();
  for (const doc of docs) {
    const key = doc.section ?? "문서";
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)?.push(doc);
  }

  for (const [section, list] of bySection) {
    lines.push(`## ${section}`);
    lines.push("");
    for (const doc of list) {
      const flag = doc.language === "ko" ? " 🇰🇷" : "";
      const url = doc.url ?? doc.markdownUrl ?? "";
      lines.push(url ? `- [${doc.title}](${url})${flag}` : `- ${doc.title}${flag}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * 공식 문서에서 뽑아낸 내용의 지문.
 *
 * ■ 왜 필요한가
 *
 * 공식 문서는 시간이 지나면 바뀝니다. 그런데 예전에는 `enrich` 를 돌릴 때마다
 * 153개 요약본을 **내용이 같든 다르든 무조건 새로 썼습니다.**
 * 그러면 "이번에 무엇이 바뀌었나"를 알 길이 없습니다.
 *
 * 그래서 공식 문서에서 온 부분만 뽑아 지문을 만들어 둡니다.
 * 다음에 다시 받아 지문이 같으면 문서가 그대로라는 뜻입니다.
 *
 * ■ 무엇을 빼는가
 *
 * 수업자료 언급 횟수처럼 **우리 쪽 사정으로 바뀌는 값은 넣지 않습니다.**
 * 그것까지 넣으면 공식 문서는 그대로인데 바뀐 것처럼 보입니다.
 */
function summaryFingerprint(summary: DocSummary, status: DocStatus): string {
  return contentHash(
    JSON.stringify({
      // 공식 문서가 밝힌 상태. deprecated 로 바뀌면 지문이 달라져 refresh 가 알아챕니다.
      status: status.flags,
      statusNote: status.note ?? "",
      title: summary.title,
      sourceUrl: summary.sourceUrl,
      summary: summary.summary,
      learningPoints: summary.learningPoints,
      example: summary.example ?? "",
      language: summary.language,
      originalLength: summary.originalLength,
    }),
  );
}

/** 이미 저장된 요약본에서 지문과 조회일을 꺼냅니다. 없으면 null. */
async function readPreviousSummary(
  path: string,
): Promise<{ content: string; fingerprint: string; fetchedAt: string } | null> {
  try {
    const content = await readFile(path, "utf8");
    return {
      content,
      fingerprint: content.match(/^contentHash:\s*(\S+)$/m)?.[1] ?? "",
      fetchedAt: content.match(/^fetchedAt:\s*(\S+)$/m)?.[1] ?? "",
    };
  } catch {
    return null;
  }
}

/** 요약 하나를 Markdown 파일 내용으로 만듭니다. */
function buildSummaryMarkdown(
  summary: DocSummary,
  match: MatchedTopic,
  source: DocSource,
  summarizerName: string,
  fingerprint: string,
  fetchedAt: string,
  status: DocStatus,
): string {
  // 조회일은 "이 내용을 공식 문서에서 받아온 날" 입니다.
  // 내용이 그대로면 예전 날짜를 그대로 둡니다. 그래야 언제부터 안 바뀌었는지 알 수 있습니다.
  const today = fetchedAt;
  const lines: string[] = [];

  // ── front matter ──
  lines.push("---");
  lines.push(`title: ${JSON.stringify(summary.title)}`);
  lines.push(`subject: ${source.subject}`);
  lines.push(`sourceUrl: ${JSON.stringify(summary.sourceUrl)}`);
  lines.push(`sourceName: ${JSON.stringify(source.name)}`);
  lines.push(`language: ${summary.language}`);
  lines.push(`fetchedAt: ${today}`);
  lines.push(`contentHash: ${fingerprint}`);
  // 공식 문서가 스스로 밝힌 상태 (13단계 비교의 근거)
  if (status.flags.length > 0) {
    lines.push(`docStatus: ${status.flags.join(", ")}`);
    if (status.note) lines.push(`docStatusNote: ${JSON.stringify(status.note)}`);
  }
  lines.push(`summarizer: ${summarizerName}`);
  lines.push(`mentionsInMaterials: ${match.hits}`);
  lines.push(`originalLength: ${summary.originalLength}`);
  lines.push("---");
  lines.push("");

  lines.push(`# ${summary.title}`);
  lines.push("");

  // ── 핵심 요약 ──
  lines.push("## 📘 핵심 요약");
  lines.push("");
  lines.push(summary.summary || "_(원문에서 요약할 문단을 찾지 못했습니다)_");
  lines.push("");

  // ── 학습 포인트 ──
  if (summary.learningPoints.length > 0) {
    lines.push("## 🎯 학습 포인트");
    lines.push("");
    for (const point of summary.learningPoints) lines.push(`- ${point}`);
    lines.push("");
  }

  // ── 예제 ──
  if (summary.example) {
    lines.push("## 💡 예제");
    lines.push("");
    lines.push(summary.example);
    lines.push("");
  }

  // ── 수업자료와 나란히 ──
  lines.push("## 📚 이 주제를 다룬 수업자료");
  lines.push("");
  lines.push(`수업자료에서 **${match.hits}번** 언급되었습니다.`);
  lines.push("");
  for (const material of match.materials) lines.push(`- ${material}`);
  lines.push("");

  // ── 차이 표시 (아직 자동 판단하지 않음) ──
  lines.push("## ⚖️ 수업 방식과 공식 문서의 차이");
  lines.push("");
  lines.push("| 구분 | 내용 |");
  lines.push("| :---- | :---- |");
  lines.push("| 수업에서 배운 방식 | _(위 수업자료 참고 — 삭제하지 않습니다)_ |");
  lines.push("| 현재 공식 문서 방식 | _(위 핵심 요약 참고)_ |");
  lines.push("| 차이 유형 | _미판정_ |");
  lines.push("");
  lines.push(
    "> 차이 유형(`deprecated` / `still-valid` / `preference` / `version-gap`)은 아직 자동으로 판단하지 않습니다.",
  );
  lines.push("> 지금 요약은 문서에서 문단을 그대로 뽑아내는 방식이라, 두 방식을 비교하려면 사람의 판단이 필요합니다.");
  lines.push("> 나중에 AI 요약을 붙이면 이 칸이 자동으로 채워집니다.");
  lines.push("");

  // ── 출처 ──
  lines.push("## 🔗 출처");
  lines.push("");
  lines.push(`- [${source.name} — ${summary.title}](${summary.sourceUrl})`);
  lines.push(`- 조회일: ${today}`);
  lines.push(
    `- 원문 ${summary.originalLength.toLocaleString("ko-KR")}자 중 핵심만 옮겨 적었습니다. 전체 내용은 위 주소에서 보세요.`,
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * 이미 가진 요약본이 몇 개인지 셉니다.
 *
 * 이 숫자 하나가 **"새로 못 받았지만 공부는 할 수 있다"(STALE)** 와
 * **"쓸 것이 아무것도 없다"(FAILED)** 를 가릅니다.
 */
async function countExistingSummaries(directory: string): Promise<number> {
  try {
    const files = await readdir(directory);
    return files.filter((name) => name.endsWith(".md") && name !== "INDEX.md").length;
  } catch {
    // 폴더가 아직 없으면 0 입니다. 오류가 아닙니다.
    return 0;
  }
}

/**
 * 파일을 **다 쓴 뒤에 바꿔치기** 합니다.
 *
 * 그냥 덮어쓰면 쓰는 도중에 멈췄을 때 반쯤 쓰인 파일이 남습니다.
 * 옆에 임시 파일로 다 쓴 다음 이름만 바꾸면 그럴 일이 없습니다 —
 * 파일은 언제나 **예전 것 아니면 새것**이지, 그 중간이 되지 않습니다.
 */
async function writeFileAtomic(path: string, content: string): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

/** 과목 하나를 처리합니다. */
async function enrichSubject(
  source: DocSource,
  materials: IndexEntry[],
  summarizer: Summarizer,
  options: EnrichOptions,
): Promise<SubjectResult> {
  const result: SubjectResult = {
    subject: source.subject,
    name: source.name,
    indexCount: 0,
    koreanCount: 0,
    matchedCount: 0,
    summarized: 0,
    created: 0,
    documentChanged: 0,
    relinked: 0,
    fingerprinted: 0,
    unchanged: 0,
    stale: 0,
    nameConflicts: 0,
    failed: 0,
    originalChars: 0,
    summaryChars: 0,
    collectStatus: COLLECT_STATUS.FAILED,
    attempts: [],
    rateLimited: false,
    existingSummaries: 0,
    contentAttempted: 0,
    contentSucceeded: 0,
    contentSkipped: 0,
    contentFailures: [],
  };

  const targetDir = join(REFERENCES_DIR, source.subject);

  // 이미 가진 요약본을 먼저 셉니다.
  //
  // 이 숫자가 STALE 과 FAILED 를 가릅니다 —
  // 못 받아왔더라도 예전 자료가 있으면 공부는 계속할 수 있습니다.
  result.existingSummaries = await countExistingSummaries(targetDir);

  // ── 1) 문서 목록 ──
  const index = await fetchIndex(source, options.retry);

  result.attempts = index.attempts;
  const collected = summarizeAttempts(index.attempts, result.existingSummaries > 0);
  result.collectStatus = collected.status;
  result.rateLimited = collected.rateLimited;
  result.rateLimitResetAt = collected.resetAt;

  if (!index.ok) {
    // **여기서 INDEX.md 를 건드리지 않습니다.**
    //
    // 예전에는 실패해도 그다음 줄에서 빈 목록으로 덮어썼습니다.
    // 그래서 요청 한도에 걸린 실행 한 번이 "문서 수: 0개" 를 남겼습니다.
    // 받아오지 못했으면 예전 것을 그대로 두는 편이 언제나 낫습니다.
    result.reason = collected.rateLimited
      ? describeRateLimit({ resetAt: collected.resetAt })
      : (index.reason ?? "공식 문서 목록을 받지 못했습니다");
    return result;
  }

  result.indexCount = index.entries.length;
  result.koreanCount = index.koreanCount;

  await mkdir(targetDir, { recursive: true });

  // 받아온 것이 있을 때만 색인을 다시 씁니다.
  // 빈 목록으로 덮어쓰면 예전에 받아 둔 목록을 잃습니다.
  if (index.entries.length > 0) {
    await writeFileAtomic(
      join(targetDir, "INDEX.md"),
      buildIndexMarkdown(source, index.entries, index.koreanCount),
    );
  }

  if (options.indexOnly) return result;

  // ── 2) 수업자료 본문 모으기 ──
  const material = await collectMaterialText(materials);

  if (material.byFile.length === 0) {
    result.reason = "이 과목의 수업자료가 없어 매칭할 대상이 없습니다";
    return result;
  }

  // ── 3) 수업에서 다룬 주제 고르기 ──
  const limit = options.limit ?? MAX_SUMMARIES_PER_SUBJECT;
  const matched = matchTopics(index.entries, material, limit);
  result.matchedCount = matched.length;

  // ── 4) 원문 받아 요약 ── (17단계: 다시 하기·이어받기)
  //
  // 한 번 실패했다고 곧바로 포기하지 않습니다. 다시 해 볼 만한 실패면 몇 번 더 해 봅니다.
  // 요청 한도에 걸렸는데 곧 풀린다면 기다렸다 **멈춘 자리에서** 이어갑니다.
  // 이미 받아 온 문서를 처음부터 다시 받는 일은 없습니다.
  const touched = new Set<string>(["index.md"]);

  // 주소가 없는 것은 요청해 볼 수조차 없습니다. 먼저 걸러 두고 따로 셉니다.
  const withUrl = matched.filter((match) => Boolean(match.doc.markdownUrl));
  result.failed += matched.length - withUrl.length;

  const byId = new Map(withUrl.map((match) => [match.doc.markdownUrl as string, match]));

  const contents = await collectDocuments(
    withUrl.map((match) => ({
      id: match.doc.title,
      url: match.doc.markdownUrl as string,
      // 한국어 쪽에 본문이 없으면 영어 원문으로 받습니다.
      fallbackUrl: match.doc.fallbackMarkdownUrl,
    })),
    async (document, response) => {
      const match = byId.get(document.url);
      if (!match) return;

      const url = document.url;
      const markdown = await response.text();

      const status = readDocStatus(markdown);

      const summary = await summarizer.summarize({
        markdown,
        fallbackTitle: match.doc.title,
        fallbackUrl: match.doc.url ?? url,
        language: match.doc.language,
      });

      const fileName = referenceFileName(summary.title);

      // ── 이름이 겹치는 문서 ──
      //
      // 서로 다른 공식 문서가 같은 파일 이름이 되는 경우가 5쌍 있습니다.
      // (예: 제목이 달라도 특수문자를 걷어내면 같아지는 것들)
      //
      // 예전에는 나중 것이 앞의 것을 덮어썼습니다. 그러면 돌릴 때마다 두 문서가
      // 번갈아 저장되어, 공식 문서는 그대로인데 **매번 "바뀜" 으로 잡혔습니다.**
      // (12단계에서 이 값을 세기 시작하면서 드러났습니다 — 실행마다 10건)
      //
      // matched 는 언급이 많은 순으로 정렬돼 있으므로, **먼저 온 쪽이 더 중요한 주제**입니다.
      // 먼저 온 것을 남기고 뒤엣것은 건너뜁니다. 결과가 실행할 때마다 같아집니다.
      // 대소문자만 다른 이름도 같은 파일입니다.
      //
      // 윈도우·맥의 파일시스템은 `headers.md` 와 `Headers.md` 를 **같은 파일로 봅니다.**
      // 그런데 글자로만 견주면 다른 이름이라 둘 다 쓰게 되고, 서로를 덮어씁니다.
      // 그러면 디스크 내용은 늘 같은데 **매번 "문서가 바뀌었다"고 잘못 세게 됩니다.**
      // (Next.js 문서의 `headers` / `Headers` 처럼 실제로 이런 짝이 있습니다)
      const nameKey = fileName.toLowerCase();

      if (touched.has(nameKey)) {
        result.nameConflicts++;
        return;
      }

      touched.add(nameKey);
      const path = join(targetDir, fileName);

      // ── 지난번과 같은 문서인지 견줍니다 ──
      const previous = await readPreviousSummary(path);
      const fingerprint = summaryFingerprint(summary, status);

      // 지문이 없는 예전 파일은 "바뀌었는지"를 알 방법이 없습니다.
      // 바뀌었다고 우기지 않고, 지문을 붙이는 것으로만 처리합니다. 다음부터는 정확해집니다.
      const hadFingerprint = Boolean(previous?.fingerprint);
      const documentChanged = hadFingerprint && previous?.fingerprint !== fingerprint;

      // 공식 문서가 바뀌었을 때만 조회일을 새로 찍습니다.
      const fetchedAt =
        previous?.fetchedAt && !documentChanged
          ? previous.fetchedAt
          : new Date().toISOString().slice(0, 10);

      const content = buildSummaryMarkdown(
        summary,
        match,
        source,
        summarizer.name,
        fingerprint,
        fetchedAt,
        status,
      );

      if (previous?.content === content) {
        // 공식 문서도, 수업자료 쪽 연결도 그대로입니다. 파일을 건드리지 않습니다.
        result.unchanged++;
      } else {
        await writeFile(path, content, "utf8");
        if (previous === null) result.created++;
        else if (documentChanged) result.documentChanged++;
        else if (!hadFingerprint) result.fingerprinted++;
        else result.relinked++;
      }

      result.summarized++;
      result.originalChars += summary.originalLength;
      result.summaryChars += content.length;
    },
    { timeoutMs: 30_000, betweenMs: FETCH_DELAY_MS },
    options.retry,
  );

  result.contentAttempted = contents.attempted;
  result.contentSucceeded = contents.succeeded;
  result.contentSkipped = contents.skipped;
  result.contentFailures = contents.failures;
  result.failed += contents.attempted - contents.succeeded;

  if (contents.rateLimited) {
    result.rateLimited = true;
    result.rateLimitResetAt ??= contents.rateLimitResetAt;
  }

  // 목록 상태와 원문 상태를 합쳐 최종 상태를 냅니다.
  // 목록을 정상으로 받았어도 원문을 일부 못 받았으면 `SUCCESS` 가 아닙니다.
  result.collectStatus = combineWithContent(
    result.collectStatus,
    {
      attempted: contents.attempted,
      succeeded: contents.succeeded,
      // 없는 문서(404)는 실패에서 뺍니다. 다시 해도 없는 것이라 상태를 내릴 까닭이 없습니다.
      failed: contents.attempted - contents.succeeded - contents.notFound,
      notFound: contents.notFound,
      skipped: contents.skipped,
      rateLimited: contents.rateLimited,
      resetAt: contents.rateLimitResetAt,
    },
    result.existingSummaries > 0,
  );


  // ── 5) 이번에 뽑히지 않은 예전 요약본 세기 ──
  //
  // 수업자료가 바뀌면 주제 순위가 달라져, 예전에 만든 요약본이 이번에는 안 뽑힐 수 있습니다.
  // 그 파일들은 그대로 남습니다. 몇 건인지만 알려 줍니다.
  try {
    const existing = await readdir(targetDir);
    result.stale = existing.filter((name) => name.endsWith(".md") && !touched.has(name.toLowerCase())).length;
  } catch {
    result.stale = 0;
  }

  return result;
}

/**
 * 6단계를 실행합니다.
 */
export async function enrich(
  options: EnrichOptions = {},
  summarizer: Summarizer = ruleBasedSummarizer,
): Promise<EnrichSummary> {
  const index = await loadIndex();
  const entries = Object.values(index.entries);

  const sources = options.only
    ? DOC_SOURCES.filter((s) => s.subject === options.only)
    : DOC_SOURCES;

  const results: SubjectResult[] = [];

  for (const source of sources) {
    log.step(`${source.name} (${source.subject})`);

    // 이 과목에 속한 수업자료를 모읍니다.
    // javascript/jquery 처럼 하위 폴더도 함께 봅니다.
    const materials = entries.filter(
      (e) => e.subject === source.subject || e.subject?.startsWith(`${source.subject}/`),
    );

    log.detail(`수업자료 ${materials.length}건`);

    const result = await enrichSubject(source, materials, summarizer, options);
    results.push(result);

    if (result.reason) {
      log.warn(result.reason);
    } else {
      log.detail(
        `공식 문서 ${result.indexCount}개` +
          (result.koreanCount > 0 ? ` (한국어 ${result.koreanCount})` : "") +
          ` → 매칭 ${result.matchedCount}개 → 요약 ${result.summarized}개`,
      );
      // 원문을 못 받은 것이 있으면 **왜** 못 받았는지 알려 줍니다. (17단계)
      // `failed 5` 만으로는 다시 해 볼 만한 것인지조차 알 수 없습니다.
      if (result.contentFailures.length > 0 || result.contentSkipped > 0) {
        const byType = new Map<string, number>();
        for (const failure of result.contentFailures) {
          byType.set(failure.type, (byType.get(failure.type) ?? 0) + 1);
        }

        const parts = [...byType.entries()].map(
          ([type, count]) => `${FAILURE_LABEL[type as FailureType] ?? type} ${count}`,
        );
        if (result.contentSkipped > 0) parts.push(`손도 못 댐 ${result.contentSkipped}`);

        log.warn(`  원문 ${result.contentAttempted}건 중 ${result.contentSucceeded}건 받음 — ${parts.join(" · ")}`);

        for (const failure of result.contentFailures.slice(0, 3)) {
          log.detail(
            `    ${failure.id.slice(0, 40)} — ${FAILURE_LABEL[failure.type as FailureType] ?? failure.type}` +
              (failure.statusCode ? ` (HTTP ${failure.statusCode})` : "") +
              ` · ${failure.attempts}번 시도`,
          );
        }
      }

      // 지난번과 무엇이 달라졌는지 알려 줍니다. 이것이 12단계의 핵심입니다.
      if (result.summarized > 0) {
        log.detail(
          `  새로 만듦 ${result.created} · 문서 바뀜 ${result.documentChanged} · ` +
            `연결만 바뀜 ${result.relinked} · 지문 추가 ${result.fingerprinted} · 그대로 ${result.unchanged}` +
            (result.stale > 0 ? ` · 이번에 안 뽑힌 예전 요약본 ${result.stale}` : "") +
            (result.nameConflicts > 0 ? ` · 이름 겹쳐 건너뜀 ${result.nameConflicts}` : ""),
        );
      }
    }
  }

  // ── 16단계: 전체적으로 어떻게 됐는가 ──
  const rateLimitedResults = results.filter((r) => r.rateLimited);
  const resetAt = rateLimitedResults
    .map((r) => r.rateLimitResetAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const status = overallStatus(results.map((r) => r.collectStatus));

  // 원문 쪽 결과를 과목 이름과 함께 모읍니다. 어느 출처에서 실패했는지 알아야 하기 때문입니다.
  const contentFailures = results.flatMap((r) =>
    r.contentFailures.map((failure) => ({ ...failure, subject: r.subject })),
  );

  // 무슨 일이 있었는지 남겨 둡니다. 다음 실행과 화면이 이것을 읽습니다.
  // 특정 과목만 돌렸을 때는 전체 상태를 덮어쓰지 않습니다 — 나머지 과목의 기록을 잃기 때문입니다.
  if (!options.only) {
    await saveCollectStatus({
      checkedAt: new Date().toISOString(),
      status,
      rateLimited: rateLimitedResults.length > 0,
      rateLimitResetAt: resetAt,
      usedToken: hasGithubToken(),
      subjects: results.map((r) => ({
        subject: r.subject,
        status: r.collectStatus,
        indexCount: r.indexCount,
        summaries: r.existingSummaries,
        rateLimited: r.rateLimited,
        reason: r.reason,
        contentAttempted: r.contentAttempted,
        contentSucceeded: r.contentSucceeded,
        contentFailed: r.contentAttempted - r.contentSucceeded,
        contentSkipped: r.contentSkipped,
      })),
      // 못 받은 문서를 적어 둡니다. 응답 본문도 토큰도 담지 않습니다 — 단서만 남깁니다.
      failedDocuments: contentFailures.map((failure) => ({
        source: failure.subject,
        id: failure.id,
        failureType: failure.type,
        statusCode: failure.statusCode,
        attempts: failure.attempts,
        lastAttemptAt: new Date().toISOString(),
        // 그 자리에 예전 요약본이 남아 있는지 — 있으면 공부는 계속할 수 있습니다.
        usingPreviousData:
          (results.find((r) => r.subject === failure.subject)?.existingSummaries ?? 0) > 0,
      })),
    });
  }

  return {
    results,
    totalSummarized: results.reduce((sum, r) => sum + r.summarized, 0),
    totalDocumentChanged: results.reduce((sum, r) => sum + r.documentChanged, 0),
    totalCreated: results.reduce((sum, r) => sum + r.created, 0),
    totalUnchanged: results.reduce((sum, r) => sum + r.unchanged, 0),
    totalStale: results.reduce((sum, r) => sum + r.stale, 0),

    status,
    rateLimited: rateLimitedResults.length > 0,
    rateLimitResetAt: resetAt,
    staleSubjects: results
      .filter((r) => r.collectStatus === COLLECT_STATUS.STALE)
      .map((r) => r.subject),
    failedSubjects: results
      .filter((r) => r.collectStatus === COLLECT_STATUS.FAILED)
      .map((r) => r.subject),
    usedToken: hasGithubToken(),

    contentAttempted: results.reduce((sum, r) => sum + r.contentAttempted, 0),
    contentSucceeded: results.reduce((sum, r) => sum + r.contentSucceeded, 0),
    contentSkipped: results.reduce((sum, r) => sum + r.contentSkipped, 0),
    contentFailures,
  };
}
