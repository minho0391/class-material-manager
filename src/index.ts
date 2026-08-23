/**
 * 프로그램의 시작점 (CLI 진입점).
 *
 * 여기서는 "어떤 명령을 실행할지" 고르는 일만 합니다.
 * 실제 작업은 각 폴더의 부품들이 맡습니다. 진입점이 얇을수록 전체 흐름이 잘 보입니다.
 *
 * 사용법:
 *   node src/index.ts extract     기준 문서에서 링크를 뽑아 data/links.json 에 저장
 *   node src/index.ts auth        브라우저에서 Google 계정 인증 (한 번만)
 *   node src/index.ts help        도움말
 */
import { mkdir, writeFile } from "node:fs/promises";
import { BASE_DOCUMENT_ID, BASE_DOCUMENT_NAME } from "./config/base-document.ts";
import { DATA_DIR, LINKS_FILE, TOKEN_FILE } from "./config/paths.ts";
import { extractAndSaveLinks } from "./collect/link-runner.ts";
import { isCollectible, type ResourceKind } from "./collect/url-normalizer.ts";
import {
  AuthError,
  authorize,
  authorizedFetch,
  verifyConnection,
} from "./collect/auth/google-auth.ts";
import { collect, type CollectOptions } from "./collect/collector.ts";
import { collectFiles, formatBytes } from "./collect/file-collector.ts";
import { refreshZipMaterials, type ZipRefreshOptions } from "./collect/zip-refresh.ts";
import { relate, type RelateOptions } from "./relate/relate-runner.ts";
import { buildLearning, type BuildLearningOptions } from "./learn/learning-builder.ts";
import { refresh, type RefreshOptions } from "./refresh/refresh-runner.ts";
import { compare, type CompareOptions } from "./compare/compare-runner.ts";
import { COMPARISONS_FILE } from "./config/paths.ts";
import { LEARNING_FILE, RELATIONS_FILE } from "./config/paths.ts";
import { applyClassification, planClassification } from "./classify/classify-runner.ts";
import { enrich } from "./enrich/enrich-runner.ts";
import { REFERENCES_DIR } from "./config/paths.ts";
import { FAILED_FILE, INDEX_FILE } from "./config/paths.ts";
import { INBOX_DIR } from "./store/markdown-writer.ts";
import { buildStudy } from "./study/study-runner.ts";
import { STUDY_GUIDES_FILE } from "./store/study-store.ts";
import { loadCollectStatus } from "./store/collect-status-store.ts";
import { COLLECT_LABEL, COLLECT_MARK, COLLECT_MEANING } from "./enrich/collect-status.ts";
import { describeRateLimit, hasGithubToken } from "./net/github.ts";
import { FAILURE_LABEL, type FailureType } from "./net/failure.ts";
import { PRIORITY_LABEL, PRIORITY_MEANING } from "./study/study-builder.ts";
import * as log from "./utils/logger.ts";

/** 종류를 사람이 읽을 수 있는 한국어 이름으로 바꿉니다. (출력용) */
const KIND_LABEL: Record<ResourceKind, string> = {
  document: "Google 문서",
  "published-document": "게시된 문서",
  spreadsheet: "Google 시트",
  presentation: "Google 슬라이드",
  form: "Google 설문",
  "drive-file": "Drive 파일 (PDF 등)",
  "drive-folder": "Drive 폴더",
  external: "외부 사이트",
  ignored: "무시됨",
};

/**
 * extract 명령 — 기준 문서에서 링크를 전부 뽑아냅니다.
 *
 * 1단계의 목표는 딱 하나입니다.
 * "앞으로 무엇을 수집해야 하는지" 정확한 목록을 만드는 것.
 */
async function runExtract(): Promise<void> {
  log.step(`기준 문서를 가져옵니다 — ${BASE_DOCUMENT_NAME}`);
  log.detail(`문서 ID: ${BASE_DOCUMENT_ID}`);

  const result = await extractAndSaveLinks();

  if (!result.ok) {
    log.error(`문서를 가져오지 못했습니다: ${result.reason ?? "알 수 없는 이유"}`);
    if (result.access === "private") {
      log.detail("이 문서는 권한이 필요합니다. 2단계에서 인증을 붙이면 해결됩니다.");
    }
    process.exitCode = 1;
    return;
  }

  const sizeMb = (result.htmlBytes / 1024 / 1024).toFixed(2);
  log.success(`가져왔습니다 (이미지 ${result.removedImages}개 제거 후 ${sizeMb} MB)`);
  if (result.cachePath) log.detail(`캐시: ${result.cachePath}`);

  log.step("링크를 뽑아냅니다");
  log.success(`섹션 ${result.sections.length}개, 링크 ${result.linkCount}개를 찾았습니다`);

  // ── 종류별 요약 출력 ────────────────────────────────
  log.step("종류별 집계 (중복 제거 후)");

  for (const kind of [...result.unique.keys()].sort()) {
    const list = result.unique.get(kind) ?? [];
    const mark = isCollectible(kind) ? "수집 대상" : "참고 링크";
    log.detail(`${KIND_LABEL[kind].padEnd(20)} ${String(list.length).padStart(4)}건   ${mark}`);
  }

  log.info("");
  log.success(`수집 대상 합계: ${result.collectibleTotal}건`);

  // ── 검증: 이상한 ID 가 섞이지 않았는지 확인 ──────────
  if (result.suspicious.length > 0) {
    log.warn(`의심스럽게 짧은 ID 가 ${result.suspicious.length}건 있습니다. 확인이 필요합니다.`);
    for (const s of result.suspicious) log.detail(`${s.kind} → "${s.id}"`);
  } else {
    log.success("ID 오추출 없음 — 모든 ID 가 정상 길이입니다");
  }

  log.success(`결과를 저장했습니다 → ${LINKS_FILE}`);
}

/**
 * auth 명령 — 브라우저에서 Google 계정 인증을 받습니다.
 *
 * 한 번만 하면 토큰이 저장되어 다음부터는 바로 자료를 가져옵니다.
 */
async function runAuth(): Promise<void> {
  log.step("Google 계정 인증");
  log.detail("브라우저가 열리면 계정을 고르고 권한을 허용해 주세요.");
  log.detail("읽기 권한만 요청합니다. 자료를 고치거나 지우지 않습니다.");

  const client = await authorize();
  const who = await verifyConnection(client);

  log.success(`인증되었습니다 — ${who.displayName} <${who.email}>`);
  log.detail(`토큰 저장 위치: ${TOKEN_FILE}`);
  log.detail("이 파일은 git 에 올라가지 않습니다. 남에게 주지 마세요.");
}

/**
 * 명령 뒤에 붙은 옵션을 읽습니다.
 *
 * 예: node src/index.ts collect --limit 10 --force
 */
function parseCollectOptions(args: string[]): CollectOptions {
  const options: CollectOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--limit") {
      const value = Number(args[++i]);
      if (Number.isFinite(value) && value > 0) options.limit = value;
    } else if (arg === "--concurrency") {
      const value = Number(args[++i]);
      if (Number.isFinite(value) && value > 0) options.concurrency = value;
    } else if (arg === "--force") {
      options.force = true;
    }
  }

  return options;
}

/**
 * collect 명령 — 수업자료를 실제로 내려받아 저장합니다.
 *
 * --limit 을 주면 앞에서부터 그만큼만 처리합니다.
 * 옵션만 다를 뿐 처리 방식은 전체 실행과 완전히 같으므로,
 * 적은 수로 결과를 확인한 뒤 그대로 전체를 돌리면 됩니다.
 */
async function runCollect(args: string[]): Promise<void> {
  const options = parseCollectOptions(args);

  const client = await authorize();

  log.step(
    options.limit === undefined
      ? "수업자료를 수집합니다 (전체)"
      : `수업자료를 수집합니다 (앞에서 ${options.limit}건만 시험)`,
  );
  if (options.force) log.detail("--force: 내용이 같아도 다시 저장합니다");
  log.detail(`동시 요청 ${options.concurrency ?? 4}건, 요청 사이 지연 있음`);

  const summary = await collect(client, options);

  // ── 결과 요약 ────────────────────────────────────────
  log.step("결과");
  log.detail(`대상          ${String(summary.total).padStart(4)}건`);
  log.detail(`새로 수집     ${String(summary.created).padStart(4)}건`);
  log.detail(`갱신됨        ${String(summary.updated).padStart(4)}건`);
  log.detail(`변경 없음     ${String(summary.unchanged).padStart(4)}건  ← 다시 저장하지 않음`);
  log.detail(`건너뜀        ${String(summary.skipped).padStart(4)}건`);
  log.detail(`실패          ${String(summary.failed).padStart(4)}건`);

  if (summary.convertedBoxes > 0 || summary.keptTables > 0) {
    log.info("");
    log.detail(`코드블록으로 되돌린 1칸 표  ${summary.convertedBoxes}개`);
    log.detail(`손대지 않은 진짜 표        ${summary.keptTables}개`);
  }

  if (summary.failures.length > 0) {
    log.warn(`실패 ${summary.failures.length}건 (앞 8건):`);
    for (const failure of summary.failures.slice(0, 8)) {
      log.detail(`[${failure.code}] ${failure.title ?? failure.docId} — ${failure.reason.slice(0, 70)}`);
    }
    log.detail(`전체 목록: ${FAILED_FILE}`);
  }

  log.info("");
  log.success(`저장 위치: ${INBOX_DIR}`);
  log.detail(`카탈로그: ${INDEX_FILE}`);
}

/**
 * collect-files 명령 — 문서가 아닌 자료를 수집합니다.
 *
 * PDF·zip·이미지는 파일 그대로 받고, Drive 폴더는 목록을 만들고,
 * 게시형 문서(/d/e/…/pub)는 웹에서 받아옵니다.
 */
async function runCollectFiles(args: string[]): Promise<void> {
  const options = parseCollectOptions(args);

  const client = await authorize();

  log.step(
    options.limit === undefined
      ? "문서가 아닌 자료를 수집합니다 (전체)"
      : `문서가 아닌 자료를 수집합니다 (앞에서 ${options.limit}건만 시험)`,
  );
  log.detail("무엇을 받고 무엇을 목록만 남길지는 config/file-policy.ts 가 정합니다");
  if (options.force) log.detail("--force: 내용이 같아도 다시 저장합니다");

  const summary = await collectFiles(client, {
    limit: options.limit,
    concurrency: options.concurrency ?? 3,
    force: options.force,
  });

  // ── 결과 요약 ────────────────────────────────────────
  log.step("결과");
  log.detail(`내려받음      ${String(summary.downloaded).padStart(4)}건  (${formatBytes(summary.bytesDownloaded)})`);
  log.detail(`목록만 기록   ${String(summary.listedOnly).padStart(4)}건  ← 영상·대용량 파일 등`);
  log.detail(`변경 없음     ${String(summary.unchanged).padStart(4)}건  ← 다시 받지 않음`);
  log.detail(`실패          ${String(summary.failed).padStart(4)}건`);

  log.info("");
  log.detail(`폴더 목록 작성 ${String(summary.foldersListed).padStart(3)}개  (안에서 파일 ${summary.folderItemsFound}개 발견)`);
  log.detail(`게시형 문서    ${String(summary.publishedOk).padStart(3)}건`);

  if (summary.failures.length > 0) {
    log.warn(`실패 ${summary.failures.length}건 (앞 8건):`);
    for (const failure of summary.failures.slice(0, 8)) {
      log.detail(`[${failure.code}] ${failure.title ?? failure.docId} — ${failure.reason.slice(0, 70)}`);
    }
    log.detail(`전체 목록: ${FAILED_FILE}`);
  }

  log.info("");
  log.success(`저장 위치: ${INBOX_DIR}`);
}

/**
 * classify 명령 — 수집한 자료를 과목별로 나눕니다.
 *
 * 옵션 없이 실행하면 결과만 보여주고 파일은 건드리지 않습니다.
 * 결과가 괜찮으면 --apply 로 실제로 옮깁니다.
 */
async function runClassify(args: string[]): Promise<void> {
  const apply = args.includes("--apply");
  const showAll = args.includes("--all");

  log.step(apply ? "자료를 과목별로 나눕니다 (실제 적용)" : "자료를 과목별로 나눕니다 (미리보기)");
  log.detail("분류 규칙은 src/config/subjects.ts 한 파일에 모여 있습니다");

  const plan = await planClassification();

  // ── 과목별 건수 ──
  log.step("과목별 건수");
  const subjects = [...plan.bySubject.entries()].sort((a, b) => {
    if (a[0] === "_unclassified") return 1;
    if (b[0] === "_unclassified") return -1;
    return b[1] - a[1];
  });
  for (const [subject, count] of subjects) {
    log.detail(`${subject.padEnd(24)}${String(count).padStart(5)}건`);
  }

  // ── 판단 근거 ──
  log.step("판단 근거");
  for (const [rule, count] of [...plan.byRule.entries()].sort((a, b) => b[1] - a[1])) {
    log.detail(`${String(rule).padEnd(30)}${String(count).padStart(5)}건`);
  }

  // ── 확신도 ──
  log.step("확신도");
  const confidenceLabel: Record<string, string> = {
    high: "높음 (섹션 하나로 확정)",
    medium: "중간 (여러 섹션·제목 판단)",
    low: "낮음 (판단 실패)",
  };
  for (const level of ["high", "medium", "low"]) {
    const count = plan.byConfidence.get(level) ?? 0;
    log.detail(`${(confidenceLabel[level] ?? level).padEnd(34)}${String(count).padStart(5)}건`);
  }

  // ── 미분류 ──
  const unclassified = plan.items.filter((i) => i.result.subject === "_unclassified");
  if (unclassified.length > 0) {
    log.step(`_unclassified ${unclassified.length}건 — 직접 확인이 필요합니다`);
    for (const item of unclassified) {
      log.detail(`· ${item.entry.title}`);
      const sections = [...new Set(item.entry.occurrences.map((o) => o.section).filter(Boolean))];
      if (sections.length > 0) log.detail(`    섹션: ${sections.join(", ")}`);
    }
  }

  // ── 확신도 중간 ──
  const medium = plan.items.filter((i) => i.result.confidence === "medium");
  if (medium.length > 0) {
    const shown = showAll ? medium : medium.slice(0, 12);
    log.step(
      showAll
        ? `확신도 중간 ${medium.length}건`
        : `확신도 중간 ${medium.length}건 (${shown.length}건 표시 — 전체는 --all)`,
    );
    for (const item of shown) {
      log.detail(`· ${item.entry.title} → ${item.result.subject}`);
      log.detail(`    ${item.result.reason}`);
    }
  }

  // ── 적용 ──
  if (!apply) {
    log.info("");
    log.success("dry-run 이므로 파일은 그대로입니다.");
    log.detail("결과가 괜찮으면 `node src/index.ts classify --apply` 로 실제 적용하세요.");
    return;
  }

  log.step("파일을 옮깁니다");
  const applied = await applyClassification(plan);

  for (const error of applied.errors.slice(0, 10)) {
    log.warn(`${error.title} — ${error.reason.slice(0, 80)}`);
  }

  log.success(`${applied.moved}건을 과목별 폴더로 옮겼습니다`);
  if (applied.errors.length > 0) log.warn(`옮기지 못한 자료 ${applied.errors.length}건`);
}

async function runExtractZip(args: string[]): Promise<void> {
  const options: ZipRefreshOptions = {
    only: args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined,
    dryRun: args.includes("--dry-run"),
  };

  const limitArg = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : undefined;
  if (Number.isFinite(limitArg) && limitArg !== undefined && limitArg > 0) options.limit = limitArg;

  log.step("이미 받아둔 압축파일을 다시 읽습니다");
  log.detail("저장된 원본만 씁니다 — 다시 내려받지 않습니다");
  if (options.only) log.detail(`대상 과목: ${options.only}`);
  if (options.dryRun) log.detail("--dry-run: 결과만 보여주고 파일은 건드리지 않습니다");

  const summary = await refreshZipMaterials(options);

  if (summary.total === 0) {
    log.warn("카탈로그에 다시 읽을 압축파일이 없습니다");
    return;
  }

  // ── 과목별 요약 ──
  const bySubject = new Map<string, { count: number; sources: number; bytes: number }>();
  for (const item of summary.items) {
    const current = bySubject.get(item.subject) ?? { count: 0, sources: 0, bytes: 0 };
    current.count++;
    current.sources += item.sourceCount;
    current.bytes += item.textBytes;
    bySubject.set(item.subject, current);
  }

  log.step("결과");
  log.detail(`${"과목".padEnd(20)}${"압축파일".padStart(8)}${"소스".padStart(7)}${"텍스트".padStart(10)}`);
  log.detail("─".repeat(45));

  for (const [subject, stat] of [...bySubject.entries()].sort((a, b) => b[1].sources - a[1].sources)) {
    log.detail(
      subject.padEnd(20) +
        String(stat.count).padStart(8) +
        String(stat.sources).padStart(7) +
        `${(stat.bytes / 1024).toFixed(0)}KB`.padStart(10),
    );
  }

  const totalSources = summary.items.reduce((sum, item) => sum + item.sourceCount, 0);
  const totalBytes = summary.items.reduce((sum, item) => sum + item.textBytes, 0);
  const limited = summary.items.reduce((sum, item) => sum + item.skippedByLimit, 0);

  log.info("");
  log.detail(`대상            ${String(summary.total).padStart(4)}건`);
  log.detail(`다시 읽음       ${String(summary.refreshed).padStart(4)}건`);
  log.detail(`원본 없음       ${String(summary.missing).padStart(4)}건`);
  log.detail(`실패            ${String(summary.failed).padStart(4)}건`);
  log.detail(`소스 없음       ${String(summary.emptySource).padStart(4)}건  ← 이미지·디자인 원본만 든 자료`);
  log.detail(`안전 제한 생략  ${String(limited).padStart(4)}건`);

  for (const failure of summary.errors.slice(0, 10)) {
    log.warn(`${failure.title} — ${failure.reason.slice(0, 80)}`);
  }

  log.info("");
  if (options.dryRun) {
    log.success(`소스 ${totalSources}개 (${(totalBytes / 1024).toFixed(0)}KB) 를 읽을 수 있습니다`);
    log.detail("--dry-run 이라 파일은 그대로입니다. 실제로 적용하려면 옵션을 빼고 다시 실행하세요.");
  } else {
    log.success(`소스 ${totalSources}개 (${(totalBytes / 1024).toFixed(0)}KB) 를 본문에 실었습니다`);
    log.detail("이제 검색과 과목 분류가 압축파일 안의 코드까지 봅니다");
  }
}

/**
 * relate 명령 — 설명자료와 실습코드를 잇습니다.
 *
 * 이미 받아둔 Markdown 만 읽습니다. 네트워크도 인증도 쓰지 않습니다.
 */
async function runRelate(args: string[]): Promise<void> {
  const options: RelateOptions = {
    only: args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined,
    dryRun: args.includes("--dry-run"),
  };

  log.step("설명자료와 실습코드를 잇습니다");
  log.detail("PDF·문서가 학습의 중심이고, zip 실습코드를 곁들이는 방향으로 잇습니다");
  if (options.only) log.detail(`대상 과목: ${options.only} (다른 과목의 기존 연결은 그대로 둡니다)`);
  if (options.dryRun) log.detail("--dry-run: 결과만 보여주고 파일은 쓰지 않습니다");

  const summary = await relate(options);

  // ── 과목별 표 ──
  log.step("과목별 결과");
  log.detail(
    `${"과목".padEnd(20)}${"설명".padStart(5)}${"실습".padStart(5)}${"연결".padStart(6)}` +
      `${"high".padStart(6)}${"med".padStart(5)}${"low".padStart(5)}${"연결된 설명".padStart(12)}`,
  );
  log.detail("─".repeat(64));

  for (const stat of summary.bySubject) {
    if (stat.materials === 0 && stat.zips === 0) continue;
    log.detail(
      stat.subject.padEnd(20) +
        String(stat.materials).padStart(5) +
        String(stat.zips).padStart(5) +
        String(stat.relations).padStart(6) +
        String(stat.high).padStart(6) +
        String(stat.medium).padStart(5) +
        String(stat.low).padStart(5) +
        `${stat.linkedMaterials}/${stat.materials}`.padStart(12),
    );
  }

  // ── 전체 ──
  const high = summary.relations.filter((r) => r.confidence === "high");
  const medium = summary.relations.filter((r) => r.confidence === "medium");
  const low = summary.relations.filter((r) => r.confidence === "low");

  log.info("");
  log.detail(`설명자료          ${String(summary.materials).padStart(4)}건`);
  log.detail(`실습파일          ${String(summary.zips).padStart(4)}건`);
  log.detail(`연결              ${String(summary.relations.length).padStart(4)}개` +
    `  (high ${high.length} · medium ${medium.length} · low ${low.length})`);
  log.detail(`연결된 설명자료   ${String(summary.linkedMaterials).padStart(4)}건`);
  log.detail(`연결 없는 설명자료 ${String(summary.unlinkedMaterials).padStart(3)}건  ← 짝이 될 실습파일이 없는 자료`);
  log.detail(`쓰인 실습파일     ${String(summary.usedZips).padStart(4)}건`);
  log.detail(`쓰이지 않은 실습파일 ${String(summary.unusedZips).padStart(2)}건`);
  log.detail(`근거가 약해 버림  ${String(summary.rejected).padStart(4)}건`);

  if (summary.unreadable.length > 0) {
    log.warn(`단서를 뽑지 못한 자료 ${summary.unreadable.length}건`);
    for (const title of summary.unreadable.slice(0, 5)) log.detail(`  ${title}`);
  }

  // ── high 연결 예시 ──
  if (high.length > 0) {
    log.step(`high 연결 예시 (${Math.min(5, high.length)}건 / 전체 ${high.length}건)`);
    for (const relation of [...high].sort((a, b) => b.score - a.score).slice(0, 5)) {
      log.info(`  ${relation.materialTitle}`);
      log.detail(`  → ${relation.zipTitle}   [${relation.confidence} ${relation.score}점]`);
      for (const reason of relation.reasons) log.detail(`     · ${reason}`);
      for (const file of relation.sourceFiles.slice(0, 3)) log.detail(`     └ ${file.path}`);
      log.info("");
    }
  }

  if (options.dryRun) {
    log.success("dry-run 이므로 파일은 그대로입니다.");
    log.detail("실제로 저장하려면 --dry-run 을 빼고 다시 실행하세요.");
  } else {
    log.success(`연결 ${summary.relations.length}개를 저장했습니다`);
    log.detail(`저장 위치: ${RELATIONS_FILE}`);
  }
}

/**
 * build-learning 명령 — 수업 설명·실습 코드·공식 문서를 한 편으로 엮습니다.
 *
 * 새로 만드는 내용이 없습니다. 이미 있는 것을 어떤 순서로 함께 볼지 적어 둘 뿐입니다.
 * 네트워크도 인증도 쓰지 않습니다.
 */
async function runBuildLearning(args: string[]): Promise<void> {
  const options: BuildLearningOptions = {
    only: args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined,
    dryRun: args.includes("--dry-run"),
  };

  log.step("통합 학습자료를 만듭니다");
  log.detail("수업 설명 → 관련 실습 코드 → 공식 문서 순으로 엮습니다");
  log.detail("원본은 건드리지 않습니다. learning.json 만 새로 만듭니다");
  if (options.only) log.detail(`대상 과목: ${options.only} (다른 과목은 그대로 둡니다)`);
  if (options.dryRun) log.detail("--dry-run: 결과만 보여주고 파일은 쓰지 않습니다");

  const summary = await buildLearning(options);

  // ── 신뢰도별 처리 ──
  log.step("9단계 연결을 어떻게 다뤘는지");
  log.detail(`high    ${String(summary.includedHigh).padStart(4)}건  실었습니다`);
  log.detail(`medium  ${String(summary.includedMedium).padStart(4)}건  실었습니다`);
  log.detail(`medium  ${String(summary.excludedMedium.length).padStart(4)}건  근거가 약해 뺐습니다`);
  log.detail(`low     ${String(summary.excludedLow).padStart(4)}건  정책상 뺐습니다 (relations.json 에는 그대로 남아 있습니다)`);

  for (const excluded of summary.excludedMedium) {
    log.detail(`  · ${excluded.materialTitle} → ${excluded.zipTitle}`);
    log.detail(`      ${excluded.reason}`);
  }

  // ── 과목별 ──
  const bySubject = new Map<string, { docs: number; practice: number; files: number; refs: number }>();
  for (const document of summary.documents) {
    const current = bySubject.get(document.subject) ?? { docs: 0, practice: 0, files: 0, refs: 0 };
    current.docs++;
    current.practice += document.practice.length;
    current.files += document.practice.reduce((sum, item) => sum + item.sourceFiles.length, 0);
    current.refs += document.references.length;
    bySubject.set(document.subject, current);
  }

  log.step("과목별 결과");
  log.detail(`${"과목".padEnd(20)}${"학습자료".padStart(9)}${"실습파일".padStart(9)}${"코드".padStart(6)}${"공식문서".padStart(9)}`);
  log.detail("─".repeat(54));

  for (const [subject, stat] of [...bySubject.entries()].sort((a, b) => b[1].docs - a[1].docs)) {
    log.detail(
      subject.padEnd(20) +
        String(stat.docs).padStart(9) +
        String(stat.practice).padStart(9) +
        String(stat.files).padStart(6) +
        String(stat.refs).padStart(9),
    );
  }

  // ── 전체 ──
  const totalPractice = summary.documents.reduce((sum, doc) => sum + doc.practice.length, 0);
  const totalFiles = summary.documents.reduce(
    (sum, doc) => sum + doc.practice.reduce((n, p) => n + p.sourceFiles.length, 0),
    0,
  );

  log.info("");
  log.detail(`통합 학습자료      ${String(summary.documents.length).padStart(4)}편`);
  log.detail(`실습파일 연결      ${String(totalPractice).padStart(4)}개`);
  log.detail(`실습 코드 파일     ${String(totalFiles).padStart(4)}개`);
  log.detail(`공식 문서가 붙은 편 ${String(summary.documentsWithReferences).padStart(3)}편  (연결 ${summary.referenceLinks}개)`);

  if (summary.missingCode.length > 0) {
    log.warn(`코드를 찾지 못한 소스 파일 ${summary.missingCode.length}개`);
    for (const item of summary.missingCode.slice(0, 5)) log.detail(`  ${item}`);
  }

  // ── 예시 ──
  const examples = [...summary.documents]
    .filter((doc) => doc.practice.some((p) => p.confidence === "high"))
    .sort((a, b) => (b.practice[0]?.score ?? 0) - (a.practice[0]?.score ?? 0))
    .slice(0, 3);

  if (examples.length > 0) {
    log.step("만들어진 학습자료 예시");
    for (const document of examples) {
      log.info(`  ${document.title}  [${document.subject}]`);
      for (const item of document.practice) {
        log.detail(`  └ 실습: ${item.zipTitle}  (${item.confidence} ${item.score}점)`);
        for (const file of item.sourceFiles.slice(0, 3)) {
          log.detail(`      · ${file.path}  (${file.language}, ${file.code.length}자)`);
        }
      }
      for (const reference of document.references.slice(0, 3)) {
        log.detail(`  └ 공식문서: ${reference.title} (${reference.sourceName})`);
      }
      log.info("");
    }
  }

  if (options.dryRun) {
    log.success("dry-run 이므로 파일은 그대로입니다.");
    log.detail("실제로 저장하려면 --dry-run 을 빼고 다시 실행하세요.");
  } else {
    log.success(`통합 학습자료 ${summary.documents.length}편을 저장했습니다`);
    log.detail(`저장 위치: ${LEARNING_FILE}`);
    log.detail("뷰어의 자료 상세 화면(/m/…)에서 바로 보입니다");
  }
}

async function runEnrich(args: string[]): Promise<void> {
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  const limitArg = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : undefined;
  const indexOnly = args.includes("--index-only");

  log.step("공식 문서로 보충합니다");
  if (hasGithubToken()) log.detail("GITHUB_TOKEN 을 찾았습니다 — 인증된 요청으로 보냅니다");
  log.detail("원문을 통째로 저장하지 않고 핵심 요약·학습 포인트·출처만 남깁니다");
  if (only) log.detail(`대상 과목: ${only}`);
  if (indexOnly) log.detail("--index-only: 문서 목록만 만들고 요약은 건너뜁니다");

  const summary = await enrich({
    only,
    limit: Number.isFinite(limitArg) ? limitArg : undefined,
    indexOnly,
  });

  // ── 결과 표 ──
  log.step("결과");
  log.detail(
    `${"과목".padEnd(12)}${"공식문서".padStart(8)}${"한국어".padStart(8)}${"매칭".padStart(7)}${"요약".padStart(7)}`,
  );
  log.detail("─".repeat(46));

  for (const result of summary.results) {
    log.detail(
      result.subject.padEnd(12) +
        String(result.indexCount).padStart(8) +
        String(result.koreanCount || "-").padStart(8) +
        String(result.matchedCount).padStart(7) +
        String(result.summarized).padStart(7),
    );
    if (result.reason) log.detail(`  └ ${result.reason.slice(0, 70)}`);
  }

  // ── 요약이 원문을 얼마나 줄였는지 ──
  const originalChars = summary.results.reduce((sum, r) => sum + r.originalChars, 0);
  const summaryChars = summary.results.reduce((sum, r) => sum + r.summaryChars, 0);

  if (originalChars > 0) {
    const ratio = ((summaryChars / originalChars) * 100).toFixed(1);
    log.info("");
    log.detail(
      `원문 ${(originalChars / 1024).toFixed(0)}KB → 요약 ${(summaryChars / 1024).toFixed(0)}KB (${ratio}%)`,
    );
  }

  log.info("");
  log.success(`요약본 ${summary.totalSummarized}건을 만들었습니다`);
  log.detail(`저장 위치: ${REFERENCES_DIR}`);
}

/** 도움말 출력 */
/**
 * refresh 명령 — 학습 데이터 전체를 한 번에 최신 상태로 갱신합니다.
 *
 * 사용자가 여덟 개 명령의 순서를 외우고 있을 이유가 없습니다.
 * 평소에는 이 명령 하나만 쓰면 됩니다.
 */
async function runRefresh(args: string[]): Promise<void> {
  const options: RefreshOptions = {
    dryRun: args.includes("--dry-run"),
    skipCollect: args.includes("--skip-collect"),
    skipEnrich: args.includes("--skip-enrich"),
  };

  log.step("학습 데이터를 최신 상태로 갱신합니다");
  log.detail("기존 명령을 올바른 순서로 부릅니다. 바뀐 것만 다시 만듭니다");
  if (options.dryRun) {
    log.warn("--dry-run: 파일을 하나도 바꾸지 않습니다");
    log.detail("네트워크를 쓰는 단계(수집·공식문서)는 미리보기가 없어 건너뜁니다");
  }
  if (options.skipCollect) log.detail("--skip-collect: Drive 수집을 건너뜁니다");
  if (options.skipEnrich) log.detail("--skip-enrich: 공식 문서 확인을 건너뜁니다");

  const summary = await refresh(options);

  // ── 단계별 결과 ──
  log.step("단계별 결과");
  for (const step of summary.steps) {
    // 바깥에서 못 받아온 것은 성공도 실패도 아닙니다. 따로 표시합니다. (16단계)
    const mark =
      step.status === "완료"
        ? "✓"
        : step.status === "건너뜀"
          ? "○"
          : step.status === "이전 데이터 사용"
            ? "⚠"
            : "✗";
    log.info(`  ${mark} [${step.order}/${summary.steps.length}] ${step.name.padEnd(28)} ${step.status}`);
    log.detail(`      ${step.detail}`);
  }

  // ── 앞뒤 비교 ──
  const { before, after } = summary;
  const rows: Array<[string, number, number]> = [
    ["자료(index.json)", before.entries, after.entries],
    ["압축파일", before.zips, after.zips],
    ["압축파일 소스", before.zipSources, after.zipSources],
    ["PDF", before.pdfs, after.pdfs],
    ["공식문서 요약", before.references, after.references],
    ["연결", before.relations, after.relations],
    ["  high", before.high, after.high],
    ["  medium", before.medium, after.medium],
    ["  low", before.low, after.low],
    ["통합 학습자료", before.learningDocuments, after.learningDocuments],
    ["  실습 연결", before.practiceLinks, after.practiceLinks],
    ["  실습 코드", before.sourceFiles, after.sourceFiles],
    ["  공식문서 연결", before.referenceLinks, after.referenceLinks],
    ["학습 설명", before.studyGuides, after.studyGuides],
    ["  손볼 자료", before.studyToReview, after.studyToReview],
  ];

  log.step("갱신 앞뒤 비교");
  log.detail(`${"항목".padEnd(20)}${"전".padStart(8)}${"후".padStart(8)}   변화`);
  log.detail("─".repeat(46));
  for (const [label, a, b] of rows) {
    const diff = b - a;
    const mark = diff === 0 ? "" : diff > 0 ? `  +${diff}` : `  ${diff}`;
    log.detail(label.padEnd(20) + String(a).padStart(8) + String(b).padStart(8) + mark);
  }

  // ── 공식 문서가 얼마나 최신인가 ── (16단계)
  const collect = await loadCollectStatus();
  if (collect) {
    const label = COLLECT_LABEL[collect.status] ?? collect.status;
    log.step("공식 문서 최신 상태");
    log.detail(`${COLLECT_MARK[collect.status] ?? "·"} ${label} — ${COLLECT_MEANING[collect.status] ?? ""}`);
    log.detail(`마지막 시도 ${collect.checkedAt.slice(0, 16).replace("T", " ")}`);
    if (collect.lastSuccessAt) {
      log.detail(`마지막 성공 ${collect.lastSuccessAt.slice(0, 16).replace("T", " ")}`);
    }
    if (collect.rateLimited) {
      log.warn(describeRateLimit({ resetAt: collect.rateLimitResetAt }));
      if (!collect.usedToken) {
        log.detail("GITHUB_TOKEN 을 설정하면 요청 한도가 크게 늘어납니다 (선택 사항입니다)");
      }
    }

    // ── 못 받은 문서 ── (17단계)
    //
    // 몇 건인지만 알려 주고, 무엇이었는지는 앞의 몇 개만 보여 줍니다.
    // 전체 목록은 `data/collect-status.json` 에 있습니다.
    const failedDocuments = collect.failedDocuments ?? [];
    if (failedDocuments.length > 0) {
      const byType = new Map<string, number>();
      for (const failure of failedDocuments) {
        byType.set(failure.failureType, (byType.get(failure.failureType) ?? 0) + 1);
      }

      log.warn(
        `못 받은 공식 문서 ${failedDocuments.length}건 — ` +
          [...byType.entries()]
            .map(([type, count]) => `${FAILURE_LABEL[type as FailureType] ?? type} ${count}`)
            .join(" · "),
      );

      for (const failure of failedDocuments.slice(0, 3)) {
        log.detail(
          `  [${failure.source}] ${failure.id.slice(0, 40)} — ` +
            `${FAILURE_LABEL[failure.failureType as FailureType] ?? failure.failureType}` +
            (failure.statusCode ? ` (HTTP ${failure.statusCode})` : "") +
            ` · ${failure.attempts}번 시도` +
            (failure.usingPreviousData ? " · 예전 요약본 있음" : ""),
        );
      }

      log.detail("자세한 목록: data/collect-status.json");
    }
  }

  if (after.inInbox > 0) {
    log.warn(`분류되지 않고 _inbox 에 남은 자료 ${after.inInbox}건 — classify --apply 로 확인해 보세요`);
  }

  if (after.orphans > 0) {
    log.warn(`기준 문서에서 사라졌는데 카탈로그에 남아 있는 자료 ${after.orphans}건`);
    log.detail("자동으로 지우지 않습니다. 링크가 잠시 빠졌을 수도 있으니 직접 확인해 주세요.");
  }

  // ── 마무리 ──
  log.info("");
  const failed = summary.steps.filter((s) => s.status === "실패");

  if (failed.length > 0) {
    log.warn(`${failed.length}개 단계가 실패했습니다`);
    for (const step of failed) log.detail(`· [${step.order}] ${step.name}`);
    log.detail("기존 데이터는 그대로 남아 있습니다. 문제를 고친 뒤 다시 실행하면 이어서 갱신됩니다.");
    if (summary.stopped) log.detail("연결 재계산이 실패해 학습자료 재생성은 하지 않았습니다.");
    process.exitCode = 1;
    return;
  }

  if (summary.dryRun) {
    log.success("dry-run 이므로 파일을 하나도 바꾸지 않았습니다.");
    log.detail("실제로 갱신하려면 --dry-run 을 빼고 다시 실행하세요.");
    return;
  }

  if (summary.changed) {
    log.success("갱신을 마쳤습니다. 뷰어를 새로고침하면 최신 내용이 보입니다.");
  } else {
    log.success("현재 데이터가 최신 상태입니다. 바뀐 것이 없습니다.");
  }
}

/**
 * compare 명령 — 수업 때 배운 방식이 지금도 맞는지 견줍니다.
 *
 * 공식 문서가 스스로 밝힌 상태와 package.json 의 버전만 근거로 씁니다.
 * 근거가 모자라면 확정하지 않고 "확인 필요" 로 남깁니다.
 */
/**
 * 15단계 — 견준 결과를 "다시 공부할 거리" 로 옮깁니다.
 *
 * 새로 판정하지 않습니다. 14단계가 정해 둔 것을 사람이 읽을 말로 바꿀 뿐입니다.
 */
async function runStudy(args: string[]): Promise<void> {
  const options = {
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
  };

  log.step("견준 결과를 학습 설명으로 옮깁니다");
  log.detail("새로 판정하지 않습니다. 14단계 결과를 문장으로 바꿉니다");
  log.detail("외부 AI 를 쓰지 않습니다 — 규칙 기반 template 으로만 만듭니다");
  if (options.force) log.detail("--force: 비교 결과가 그대로여도 다시 만듭니다");
  if (options.dryRun) log.detail("--dry-run: 결과만 보여주고 파일은 쓰지 않습니다");

  const summary = await buildStudy(options);

  if (!summary) {
    log.error("아직 견준 결과가 없습니다. 먼저 `node src/index.ts compare` 를 실행하세요.");
    return;
  }

  if (!summary.rebuilt) {
    log.success(`견준 결과가 그대로라 다시 만들지 않았습니다 — 학습 설명 ${summary.data.guides.length}건`);
    log.detail("설명 말투를 고쳤다면 `--force` 로 다시 만드세요");
    return;
  }

  log.step("복습 우선순위");
  const order = ["REPLACE", "RELEARN", "CHECK", "KEEP"] as const;
  for (const priority of order) {
    const count = summary.byPriority.get(priority) ?? 0;
    if (count === 0) continue;
    log.detail(`${PRIORITY_LABEL[priority].padEnd(18)}${String(count).padStart(5)}건   (${priority})`);
    log.detail(`  ${PRIORITY_MEANING[priority]}`);
  }

  log.info("");
  log.detail(`학습 설명       ${String(summary.data.guides.length).padStart(5)}건`);
  log.detail(`수업자료        ${String(summary.data.materials.length).padStart(5)}건`);

  // ── 다시 봐야 할 자료부터 ──
  const notable = summary.data.materials.filter((material) => material.priority !== "KEEP");

  if (notable.length > 0) {
    log.step(`먼저 볼 자료 (${Math.min(8, notable.length)}건 / 전체 ${notable.length}건)`);
    for (const material of notable.slice(0, 8)) {
      log.info(`  [${PRIORITY_LABEL[material.priority]}] ${material.title}`);
      const topics = material.topics
        .filter((entry) => entry.priority !== "KEEP")
        .slice(0, 4)
        .map((entry) => entry.topic);
      if (topics.length > 0) log.detail(`    볼 것: ${topics.join(", ")}`);
    }
  }

  if (options.dryRun) {
    log.success("dry-run 이므로 파일은 그대로입니다.");
    return;
  }

  log.success(`학습 설명 ${summary.data.guides.length}건을 저장했습니다`);
  log.detail(`저장 위치: ${STUDY_GUIDES_FILE}`);
}

async function runCompare(args: string[]): Promise<void> {
  const options: CompareOptions = {
    only: args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined,
    dryRun: args.includes("--dry-run"),
  };

  log.step("수업 당시 방식과 현재 공식 문서를 견줍니다");
  log.detail("공식 문서가 직접 밝힌 상태와 package.json 버전만 근거로 씁니다");
  log.detail("근거가 모자라면 확정하지 않고 '확인 필요' 로 남깁니다");
  if (options.only) log.detail(`대상 과목: ${options.only}`);
  if (options.dryRun) log.detail("--dry-run: 결과만 보여주고 파일은 쓰지 않습니다");

  const summary = await compare(options);

  // ── 상태별 ──
  const LABEL: Record<string, string> = {
    CURRENT: "그대로 사용 가능",
    DEPRECATED: "사용 중단됨",
    UNSTABLE: "실험적·비표준",
    VERSION_GAP: "버전 차이 있음",
    NOT_FOUND: "공식문서에서 확인 안 됨",
    REVIEW_REQUIRED: "확인 필요",
  };

  log.step("상태별 결과");
  for (const [status, count] of [...summary.byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    log.detail(`${(LABEL[status] ?? status).padEnd(24)}${String(count).padStart(5)}건   (${status})`);
  }

  log.info("");
  log.detail(`비교 항목        ${String(summary.items.length).padStart(5)}건`);
  log.detail(`공식 문서        ${String(summary.officialDocs).padStart(5)}건`);
  log.detail(`실습파일         ${String(summary.practiceZips).padStart(5)}건`);

  // ── 눈여겨볼 것부터 ──
  const notable = summary.items.filter(
    (item) => item.status !== "CURRENT",
  );

  if (notable.length > 0) {
    log.step(`눈여겨볼 항목 (${Math.min(10, notable.length)}건 / 전체 ${notable.length}건)`);
    const order = ["DEPRECATED", "UNSTABLE", "VERSION_GAP", "REVIEW_REQUIRED", "NOT_FOUND"];
    const sorted = [...notable].sort(
      (a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.topic.localeCompare(b.topic),
    );

    for (const item of sorted.slice(0, 10)) {
      log.info(`  [${item.status}] ${item.subject} · ${item.topic}`);
      log.detail(`    ${item.reason}`);
      for (const site of item.usedIn.slice(0, 2)) {
        log.detail(`    쓰인 곳: ${site.zipTitle} → ${site.files.slice(0, 2).join(", ")}`);
      }
      for (const lesson of item.lessons.slice(0, 1)) log.detail(`    수업자료: ${lesson.title}`);
      for (const ev of item.evidence.slice(0, 2)) {
        log.detail(`    근거(${ev.source}): ${ev.text.slice(0, 100)}`);
      }
      log.info("");
    }
  }

  if (options.dryRun) {
    log.success("dry-run 이므로 파일은 그대로입니다.");
  } else {
    log.success(`비교 ${summary.items.length}건을 저장했습니다`);
    log.detail(`저장 위치: ${COMPARISONS_FILE}`);
  }
}

function showHelp(): void {
  console.log(`
수업자료 관리 도구 (class-material-manager)

사용법:
  node src/index.ts <명령> [옵션]

명령:
  extract    기준 문서에서 링크를 뽑아 data/links.json 에 저장합니다
  auth       브라우저에서 Google 계정 인증을 받습니다 (처음 한 번만)
  collect        Google 문서를 내려받아 data/materials/_inbox/ 에 저장합니다
  collect-files  PDF·zip·이미지·폴더 목록·게시형 문서를 수집합니다
  extract-zip    이미 받아둔 zip 을 다시 읽어 안의 소스코드를 본문에 싣습니다
  classify       수집한 자료를 과목별로 나눕니다 (기본은 미리보기)
  relate         설명자료(PDF·문서)와 zip 실습코드를 이어 줍니다
  enrich         공식 문서로 보충합니다 (색인 + 핵심 요약)
  build-learning 수업 설명·실습 코드·공식 문서를 한 편으로 엮습니다
  compare        수업 당시 방식이 지금도 맞는지 공식 문서와 견줍니다
  study          견준 결과를 '다시 공부할 거리' 로 옮깁니다
  refresh        ★ 위 과정을 올바른 순서로 한 번에 실행합니다 (평소에는 이것만)
  help           이 도움말을 보여줍니다

compare 옵션:
  (옵션 없음)      전체를 견주어 data/comparisons.json 에 저장합니다
  --dry-run        결과만 보여주고 파일은 쓰지 않습니다
  --only <과목>    그 과목만 다시 견줍니다

study 옵션:
  (옵션 없음)      비교 결과가 바뀌었을 때만 학습 설명을 다시 만듭니다
  --force          비교 결과가 그대로여도 다시 만듭니다 (설명 말투를 고쳤을 때)
  --dry-run        결과만 보여주고 파일은 쓰지 않습니다

refresh 옵션:
  (옵션 없음)      전체를 최신 상태로 갱신합니다
  --dry-run        파일을 바꾸지 않고, 바꾸지 않고도 볼 수 있는 단계만 미리 봅니다
  --skip-collect   Google Drive 수집을 건너뜁니다 (로컬 자료만 다시 엮기)
  --skip-enrich    공식 문서 확인을 건너뜁니다 (빠른 갱신)

relate 옵션:
  (옵션 없음)      전체를 다시 계산해 data/relations.json 에 저장합니다
  --dry-run        결과만 보여주고 파일은 쓰지 않습니다
  --only <과목>    그 과목만 다시 계산합니다 (다른 과목의 연결은 그대로 둡니다)

build-learning 옵션:
  (옵션 없음)      전체를 다시 만들어 data/learning.json 에 저장합니다
  --dry-run        결과만 보여주고 파일은 쓰지 않습니다
  --only <과목>    그 과목만 다시 만듭니다 (다른 과목은 그대로 둡니다)

extract-zip 옵션:
  (옵션 없음)      카탈로그에 있는 zip 을 전부 다시 읽습니다
  --dry-run        결과만 보여주고 파일은 건드리지 않습니다
  --only <과목>    특정 과목만 처리합니다 (예: --only react)
  --limit N        앞에서부터 N건만 처리합니다 (시험 실행용)

enrich 옵션:
  --only <과목>    특정 과목만 처리합니다 (예: --only css)
  --limit N        과목당 요약 개수 상한 (기본 40)
  --index-only     문서 목록만 만들고 요약은 건너뜁니다

classify 옵션:
  (옵션 없음)      dry-run — 결과만 보여주고 파일은 옮기지 않습니다
  --apply          실제로 과목별 폴더로 옮깁니다
  --all            확신도가 중간인 자료를 전부 보여줍니다

collect / collect-files 공통 옵션:
  --limit N        앞에서부터 N건만 처리합니다 (시험 실행용)
  --concurrency N  동시에 보낼 요청 수 (기본 4 / 파일은 3)
  --force          내용이 같아도 다시 저장합니다
`);
}

/** 명령을 골라 실행합니다. */
async function main(): Promise<void> {
  // process.argv 는 [node 경로, 스크립트 경로, 그 뒤 인자들] 순서입니다.
  const command = process.argv[2] ?? "help";

  switch (command) {
    case "extract":
      await runExtract();
      break;
    case "auth":
      await runAuth();
      break;
    case "collect":
      await runCollect(process.argv.slice(3));
      break;
    case "collect-files":
      await runCollectFiles(process.argv.slice(3));
      break;
    case "extract-zip":
      await runExtractZip(process.argv.slice(3));
      break;
    case "classify":
      await runClassify(process.argv.slice(3));
      break;
    case "relate":
      await runRelate(process.argv.slice(3));
      break;
    case "build-learning":
      await runBuildLearning(process.argv.slice(3));
      break;
    case "refresh":
      await runRefresh(process.argv.slice(3));
      break;
    case "compare":
      await runCompare(process.argv.slice(3));
      break;
    case "enrich":
      await runEnrich(process.argv.slice(3));
      break;
    case "study":
      await runStudy(process.argv.slice(3));
      break;
    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;
    default:
      log.error(`모르는 명령입니다: ${command}`);
      showHelp();
      process.exitCode = 1;
  }
}

// 예상하지 못한 오류가 나도 원인을 볼 수 있게 잡아서 출력합니다.
main().catch((e: unknown) => {
  // 인증 오류는 "무엇을 하면 되는지"까지 알려주므로 따로 예쁘게 보여줍니다.
  if (e instanceof AuthError) {
    log.error(e.message);
    log.detail(e.hint);
  } else {
    log.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  }
  process.exitCode = 1;
});
