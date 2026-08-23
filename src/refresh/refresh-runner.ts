/**
 * 12단계 — 학습 데이터 전체를 한 번에 최신 상태로 되돌리는 파이프라인.
 *
 * ■ 왜 필요한가
 *
 * 지금까지 만든 명령이 여덟 개입니다. 순서를 틀리면 결과가 어긋납니다.
 *
 *   · 수집을 하고 분류를 안 하면 자료가 `_inbox` 에 남습니다
 *   · 분류를 하고 연결을 다시 안 하면 relations.json 이 옛날 것을 가리킵니다
 *   · 연결을 다시 하고 학습자료를 안 만들면 화면이 옛날 코드를 보여줍니다
 *
 * 사용자가 이 순서를 외우고 있어야 할 이유가 없습니다.
 * 이 파일은 **기존 명령을 올바른 순서로 부르는 일만** 합니다.
 * 각 단계의 일 자체는 원래 있던 모듈이 그대로 합니다. 여기서 다시 구현하지 않습니다.
 *
 * ■ 무엇을 하지 않는가
 *
 * "수업에서 배운 방식이 지금도 맞는가"를 판정하지 않습니다.
 * 이 단계가 하는 일은 **최신 자료를 다시 갖춰 놓는 것**까지입니다.
 * 그 위에서 무엇이 달라졌는지 뜻을 읽는 일은 다음 단계의 몫입니다.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { LEARNING_FILE, LINKS_FILE, REFERENCES_DIR, RELATIONS_FILE } from "../config/paths.ts";
import { AuthError, authorize } from "../collect/auth/google-auth.ts";
import { extractAndSaveLinks } from "../collect/link-runner.ts";
import { collect } from "../collect/collector.ts";
import { collectFiles, formatBytes } from "../collect/file-collector.ts";
import { refreshZipMaterials } from "../collect/zip-refresh.ts";
import { applyClassification, planClassification } from "../classify/classify-runner.ts";
import { enrich, type EnrichSummary } from "../enrich/enrich-runner.ts";
import { relate } from "../relate/relate-runner.ts";
import { buildLearning } from "../learn/learning-builder.ts";
import { compare, markStaleComparisons } from "../compare/compare-runner.ts";
import { buildStudy } from "../study/study-runner.ts";
import { COLLECT_STATUS } from "../enrich/collect-status.ts";
import { describeRateLimit } from "../net/github.ts";
import { STUDY_GUIDES_FILE } from "../store/study-store.ts";
import { COLLECT_STATUS_FILE } from "../store/collect-status-store.ts";
import { loadComparisons } from "../store/comparison-store.ts";
import { loadIndex } from "../store/index-store.ts";
import * as log from "../utils/logger.ts";

export interface RefreshOptions {
  /** 실제로 바꾸지 않고, 바꾸지 않고도 볼 수 있는 것만 미리 봅니다 */
  dryRun?: boolean;
  /** Google Drive 에서 자료를 받아오는 단계를 건너뜁니다 (로컬 자료만 다시 엮기) */
  skipCollect?: boolean;
  /** 공식 문서를 다시 확인하는 단계를 건너뜁니다 (빠른 갱신) */
  skipEnrich?: boolean;
}

/** 한 단계가 어떻게 끝났는지 */
/**
 * 단계 하나가 어떻게 끝났는가.
 *
 * 16단계에서 `"이전 데이터 사용"` 을 더했습니다.
 * 그전에는 바깥에서 자료를 못 받아와도 `완료` 로 찍혔습니다.
 * 자료를 잃지는 않았지만 **갱신은 실패한 것**이라, 그 둘을 같은 말로 부르면 안 됩니다.
 */
export type StepStatus = "완료" | "건너뜀" | "실패" | "이전 데이터 사용";

export interface StepResult {
  order: number;
  name: string;
  status: StepStatus;
  /** 사람이 읽을 한 줄 결과 */
  detail: string;
  /** 이 단계가 실제로 무언가를 바꿨는지 */
  changed: boolean;
}

/** 데이터가 지금 어떤 상태인지 한 장으로 */
export interface DataSnapshot {
  entries: number;
  materials: number;
  zips: number;
  zipSources: number;
  pdfs: number;
  inInbox: number;
  references: number;
  relations: number;
  high: number;
  medium: number;
  low: number;
  learningDocuments: number;
  practiceLinks: number;
  sourceFiles: number;
  referenceLinks: number;
  /** 공식 문서를 마지막으로 어떻게 가져왔는가 (16단계) */
  collectStatus: string;
  /** 학습 설명 건수 (15단계) */
  studyGuides: number;
  /** 손볼 것이 있는 수업자료 — "그대로 복습" 이 아닌 것 (15단계) */
  studyToReview: number;
  /**
   * 기준 문서에서 사라졌는데 카탈로그에는 남아 있는 자료.
   *
   * 강사님이 기준 문서에서 링크를 지우면 여기 잡힙니다.
   * **지우지는 않습니다.** 잠깐의 네트워크 오류나 링크 수정만으로도
   * 사라진 것처럼 보일 수 있는데, 그걸 믿고 지우면 받아둔 자료를 잃습니다.
   * 사람이 보고 판단하도록 알리기만 합니다.
   */
  orphans: number;
}

export interface RefreshSummary {
  steps: StepResult[];
  before: DataSnapshot;
  after: DataSnapshot;
  /** 전체적으로 무언가 바뀌었는지 */
  changed: boolean;
  /** 필수 단계가 실패해 뒷단계를 멈췄는지 */
  stopped: boolean;
  dryRun: boolean;
}

/** 파일 하나를 JSON 으로 읽습니다. 없으면 null. */
async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * 지금 데이터가 어떤 상태인지 세어 둡니다.
 *
 * refresh 앞뒤로 한 번씩 재서, 무엇이 얼마나 달라졌는지 사람이 바로 알 수 있게 합니다.
 * 숫자를 지어내지 않고 실제 파일에서 셉니다.
 */
export async function takeSnapshot(): Promise<DataSnapshot> {
  const index = await loadIndex();
  const entries = Object.values(index.entries);

  const isZip = (mime: string): boolean =>
    mime === "application/zip" || mime === "application/x-zip-compressed";

  const relations = await readJson<{
    relations: Array<{ confidence: string }>;
  }>(RELATIONS_FILE);

  const learning = await readJson<{
    documents: Array<{
      practice: Array<{ sourceFiles: unknown[] }>;
      references: unknown[];
    }>;
  }>(LEARNING_FILE);

  const study = await readJson<{
    guides: unknown[];
    materials: Array<{ priority: string }>;
  }>(STUDY_GUIDES_FILE);

  const collect = await readJson<{ status: string }>(COLLECT_STATUS_FILE);

  // 공식 문서 요약 수 — 폴더를 직접 셉니다.
  let references = 0;
  try {
    for (const subject of await readdir(REFERENCES_DIR)) {
      const files = await readdir(join(REFERENCES_DIR, subject));
      references += files.filter((f) => f.endsWith(".md") && f !== "INDEX.md").length;
    }
  } catch {
    // 아직 6단계를 돌리지 않았으면 폴더가 없습니다. 오류가 아닙니다.
  }

  const documents = learning?.documents ?? [];

  // ── 기준 문서에서 사라진 자료 세기 ──
  //
  // links.json 에 없고, Drive 폴더 안에서 발견된 것도 아니면
  // "기준 문서에서 링크가 빠진 자료" 입니다.
  const links = await readJson<{ resources: Record<string, Array<{ id: string }>> }>(LINKS_FILE);
  const linkedIds = new Set<string>();
  for (const list of Object.values(links?.resources ?? {})) {
    for (const resource of list) linkedIds.add(resource.id);
  }

  const orphans =
    linkedIds.size === 0
      ? 0
      : entries.filter((entry) => !entry.discoveredIn && !linkedIds.has(entry.docId)).length;

  return {
    orphans,
    entries: entries.length,
    materials: entries.filter(
      (e) => e.kind === "document" || e.kind === "published-document" || e.mimeType === "application/pdf",
    ).length,
    zips: entries.filter((e) => isZip(e.mimeType)).length,
    zipSources: entries.reduce((sum, e) => sum + (e.zipSourceCount ?? 0), 0),
    pdfs: entries.filter((e) => e.mimeType === "application/pdf").length,
    inInbox: entries.filter((e) => e.filePath?.includes("materials/_inbox/")).length,
    references,
    relations: relations?.relations.length ?? 0,
    high: relations?.relations.filter((r) => r.confidence === "high").length ?? 0,
    medium: relations?.relations.filter((r) => r.confidence === "medium").length ?? 0,
    low: relations?.relations.filter((r) => r.confidence === "low").length ?? 0,
    learningDocuments: documents.length,
    practiceLinks: documents.reduce((sum, d) => sum + d.practice.length, 0),
    sourceFiles: documents.reduce(
      (sum, d) => sum + d.practice.reduce((n, p) => n + p.sourceFiles.length, 0),
      0,
    ),
    referenceLinks: documents.reduce((sum, d) => sum + d.references.length, 0),
    collectStatus: collect?.status ?? "-",
    studyGuides: study?.guides?.length ?? 0,
    studyToReview: (study?.materials ?? []).filter((material) => material.priority !== "KEEP").length,
  };
}

/**
 * 학습 데이터 전체를 최신 상태로 갱신합니다.
 */
export async function refresh(options: RefreshOptions = {}): Promise<RefreshSummary> {
  /** 화면에 보여줄 전체 단계 수 */
  const TOTAL_STEPS = 10;

  const steps: StepResult[] = [];
  const before = await takeSnapshot();

  let order = 0;
  let stopped = false;

  // 공식 문서를 어떻게 가져왔는지 — 뒤 단계가 이것을 봅니다. (16단계)
  let enrichStatus: StepStatus | null = null;
  let enrichSummary: EnrichSummary | null = null;

  /** 단계 하나를 기록하며 실행합니다. */
  const runStep = async (
    name: string,
    body: () => Promise<{ detail: string; changed: boolean; status?: StepStatus } | null>,
  ): Promise<StepResult> => {
    order++;
    log.step(`[${order}/${TOTAL_STEPS}] ${name}`);

    try {
      const outcome = await body();

      // null 을 돌려주면 "할 일이 없어서 건너뛰었다"는 뜻입니다.
      const result: StepResult = outcome
        ? {
            order,
            name,
            status: outcome.status ?? "완료",
            detail: outcome.detail,
            changed: outcome.changed,
          }
        : { order, name, status: "건너뜀", detail: "할 일이 없습니다", changed: false };

      steps.push(result);
      // 바깥에서 못 받아온 것은 경고로 알립니다. 조용히 지나가면 성공처럼 보입니다.
      if (result.status === "이전 데이터 사용") log.warn(`→ ${result.status}: ${result.detail}`);
      else log.detail(`→ ${result.status}: ${result.detail}`);
      return result;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      const result: StepResult = { order, name, status: "실패", detail: reason, changed: false };
      steps.push(result);
      log.error(`→ 실패: ${reason.slice(0, 120)}`);
      return result;
    }
  };

  /** 건너뛴 단계를 기록만 합니다. */
  const skipStep = (name: string, reason: string): void => {
    order++;
    steps.push({ order, name, status: "건너뜀", detail: reason, changed: false });
    log.step(`[${order}/${TOTAL_STEPS}] ${name}`);
    log.detail(`→ 건너뜀: ${reason}`);
  };

  // ─────────────────────────────────────────────
  // 1. 기준 문서 링크 목록
  //
  // 강사님이 기준 문서에 새 자료를 링크하면 여기서 발견됩니다.
  // 이것을 건너뛰면 새 자료를 영영 못 봅니다.
  // ─────────────────────────────────────────────
  const previousLinks = await readJson<{ counts: Record<string, number> }>(LINKS_FILE);

  if (options.dryRun) {
    skipStep("기준 문서 링크 목록", "dry-run 을 지원하지 않는 단계입니다 (links.json 을 씁니다)");
  } else if (options.skipCollect) {
    skipStep("기준 문서 링크 목록", "--skip-collect");
  } else {
    await runStep("기준 문서 링크 목록", async () => {
      const result = await extractAndSaveLinks();
      if (!result.ok) throw new Error(result.reason ?? "기준 문서를 가져오지 못했습니다");

      const now = Object.fromEntries(
        [...result.unique.entries()].map(([kind, list]) => [kind, list.length]),
      );
      const previous = previousLinks?.counts ?? {};
      const changedKinds = Object.keys(now).filter((k) => now[k] !== previous[k]);

      return {
        detail:
          `수집 대상 ${result.collectibleTotal}건` +
          (changedKinds.length > 0 ? ` · 종류별 건수가 바뀜: ${changedKinds.join(", ")}` : " · 지난번과 같음"),
        changed: changedKinds.length > 0,
      };
    });
  }

  // ─────────────────────────────────────────────
  // 2~3. Drive 에서 자료 받기
  //
  // 두 단계 모두 같은 인증을 씁니다. 인증이 안 되면 둘 다 못 하므로 함께 다룹니다.
  // 여기서 실패해도 아래의 로컬 단계는 그대로 진행합니다.
  // 이미 받아둔 자료로 다시 엮는 것은 언제나 안전하기 때문입니다.
  // ─────────────────────────────────────────────
  let driveDown = false;

  if (options.dryRun) {
    skipStep("Google 문서 수집", "dry-run 을 지원하지 않는 단계입니다");
    skipStep("파일·폴더·게시형 문서 수집", "dry-run 을 지원하지 않는 단계입니다");
  } else if (options.skipCollect) {
    skipStep("Google 문서 수집", "--skip-collect");
    skipStep("파일·폴더·게시형 문서 수집", "--skip-collect");
  } else {
    let client: Awaited<ReturnType<typeof authorize>> | null = null;

    try {
      client = await authorize();
    } catch (e) {
      driveDown = true;
      const reason = e instanceof AuthError ? `${e.message} ${e.hint}` : String(e);
      order++;
      steps.push({ order, name: "Google 문서 수집", status: "실패", detail: reason, changed: false });
      log.step(`[${order}/${TOTAL_STEPS}] Google 문서 수집`);
      log.error(`→ 실패: 인증하지 못했습니다`);
      log.detail(reason.slice(0, 160));
      skipStep("파일·폴더·게시형 문서 수집", "인증에 실패해 함께 건너뜁니다");
    }

    if (client) {
      const drive = client;
      const documents = await runStep("Google 문서 수집", async () => {
        const summary = await collect(drive, {});
        return {
          detail:
            `새로 ${summary.created} · 갱신 ${summary.updated} · 변경 없음 ${summary.unchanged} · 실패 ${summary.failed}`,
          changed: summary.created + summary.updated > 0,
        };
      });

      if (documents.status === "실패") {
        driveDown = true;
        skipStep("파일·폴더·게시형 문서 수집", "앞 단계가 실패해 함께 건너뜁니다");
      } else {
        await runStep("파일·폴더·게시형 문서 수집", async () => {
          const summary = await collectFiles(drive, {});
          return {
            detail:
              `내려받음 ${summary.downloaded} (${formatBytes(summary.bytesDownloaded)}) · ` +
              `목록만 ${summary.listedOnly} · 변경 없음 ${summary.unchanged} · 실패 ${summary.failed}`,
            changed: summary.downloaded + summary.listedOnly > 0,
          };
        });
      }
    }
  }

  // ─────────────────────────────────────────────
  // 4. 과목 분류
  //
  // 새로 받은 자료는 `_inbox` 에 쌓입니다. 그것을 과목 폴더로 보내야
  // 뒤의 단계(공식문서 매칭·연결)가 과목을 기준으로 일할 수 있습니다.
  // 옮길 것이 없으면 건드리지 않습니다.
  // ─────────────────────────────────────────────
  await runStep("과목 분류", async () => {
    const plan = await planClassification();

    const toMove = plan.items.filter(
      (item) =>
        (item.entry.filePath && item.entry.filePath !== item.targetPath) ||
        (item.entry.downloadPath &&
          item.targetDownloadPath &&
          item.entry.downloadPath !== item.targetDownloadPath),
    );

    if (toMove.length === 0) return null; // 건너뜀

    if (options.dryRun) {
      return { detail: `옮길 자료 ${toMove.length}건 (dry-run 이라 옮기지 않았습니다)`, changed: false };
    }

    const applied = await applyClassification(plan);
    return {
      detail: `${toMove.length}건을 과목 폴더로 옮겼습니다` +
        (applied.errors.length > 0 ? ` · 실패 ${applied.errors.length}건` : ""),
      changed: true,
    };
  });

  // ─────────────────────────────────────────────
  // 5. 압축파일 내용 확인
  //
  // 새로 받은 zip 은 수집할 때 이미 안을 읽습니다. (8단계에서 그렇게 만들었습니다)
  // 그러니 여기서는 **아직 안을 못 읽은 zip 이 남아 있을 때만** 일합니다.
  // 그런 경우가 없으면 115건을 공연히 다시 읽지 않습니다.
  // ─────────────────────────────────────────────
  await runStep("압축파일 내용 확인", async () => {
    const index = await loadIndex();
    const pending = Object.values(index.entries).filter(
      (entry) =>
        (entry.mimeType === "application/zip" || entry.mimeType === "application/x-zip-compressed") &&
        entry.downloadPath &&
        entry.zipSourceCount === undefined,
    );

    if (pending.length === 0) return null; // 건너뜀

    const summary = await refreshZipMaterials({ dryRun: options.dryRun });
    return {
      detail: options.dryRun
        ? `안을 못 읽은 zip ${pending.length}건 (dry-run)`
        : `zip ${summary.refreshed}건을 다시 읽었습니다 · 실패 ${summary.failed}`,
      changed: !options.dryRun && summary.refreshed > 0,
    };
  });

  // ─────────────────────────────────────────────
  // 6. 공식 문서 최신화
  //
  // 이 단계가 12단계의 핵심입니다.
  // 공식 문서를 다시 받아 **내용이 바뀐 것만** 저장합니다.
  // 바뀌지 않은 요약본은 파일을 건드리지 않아 조회일이 그대로 남습니다.
  // ─────────────────────────────────────────────
  if (options.dryRun) {
    skipStep("공식 문서 최신화", "dry-run 을 지원하지 않는 단계입니다 (요약본을 씁니다)");
  } else if (options.skipEnrich) {
    skipStep("공식 문서 최신화", "--skip-enrich");
  } else {
    enrichStatus = (
      await runStep("공식 문서 최신화", async () => {
        const summary = await enrich();
        enrichSummary = summary;

        const changed = summary.totalDocumentChanged + summary.totalCreated;

        // 원문을 못 받은 것이 있으면 함께 적습니다. (17단계)
        // 요약 건수만 보면 "덜 받았다" 는 사실이 드러나지 않습니다.
        const missed = summary.contentAttempted - summary.contentSucceeded + summary.contentSkipped;

        const counts =
          `요약 ${summary.totalSummarized}건 확인 · 문서 바뀜 ${summary.totalDocumentChanged} · ` +
          `새로 생김 ${summary.totalCreated} · 그대로 ${summary.totalUnchanged}` +
          (summary.totalStale > 0 ? ` · 이번에 안 뽑힌 예전 요약본 ${summary.totalStale}` : "") +
          (missed > 0
            ? ` · 원문 ${summary.contentAttempted}건 중 ${missed}건 못 받음`
            : "");

        // ── 못 받아온 것을 성공이라고 하지 않습니다 ── (16단계)
        //
        // 자료를 잃지는 않았습니다. 그러나 **갱신은 못 한 것**이므로
        // 그대로 `완료` 라고 찍으면 사용자가 최신인 줄 압니다.
        if (summary.status === COLLECT_STATUS.FAILED) {
          const why = summary.rateLimited
            ? describeRateLimit({ resetAt: summary.rateLimitResetAt })
            : "공식 문서를 받지 못했습니다";
          throw new Error(`${why} · 쓸 수 있는 예전 요약본도 없습니다`);
        }

        if (summary.status === COLLECT_STATUS.STALE || summary.status === COLLECT_STATUS.PARTIAL) {
          const why = summary.rateLimited
            ? describeRateLimit({ resetAt: summary.rateLimitResetAt })
            : missed > 0
              ? `공식 문서 원문 ${missed}건을 받지 못했습니다`
              : "일부 공식 문서를 받지 못했습니다";

          const which = [...summary.staleSubjects, ...summary.failedSubjects];

          return {
            status: "이전 데이터 사용" as StepStatus,
            detail:
              `${why}. 기존 공식 문서는 그대로 두었습니다` +
              (which.length > 0 ? ` (못 받은 과목: ${which.join(", ")})` : "") +
              ` · ${counts}`,
            // 예전 자료를 그대로 쓴 것이므로 "바뀌었다" 고 하지 않습니다.
            changed: changed > 0,
          };
        }

        return { detail: counts, changed: changed > 0 };
      })
    ).status;
  }

  // ─────────────────────────────────────────────
  // 7. 연결 재계산
  //
  // 자료가 늘거나 바뀌었으면 연결도 다시 따져야 합니다.
  // 이 단계가 실패하면 학습자료를 만들 근거가 흔들리므로 뒤를 멈춥니다.
  // ─────────────────────────────────────────────
  const relateStep = await runStep("설명자료 ↔ 실습코드 연결 재계산", async () => {
    const summary = await relate({ dryRun: options.dryRun });
    const high = summary.relations.filter((r) => r.confidence === "high").length;
    const medium = summary.relations.filter((r) => r.confidence === "medium").length;
    const low = summary.relations.filter((r) => r.confidence === "low").length;

    return {
      detail: `연결 ${summary.relations.length}개 (high ${high} · medium ${medium} · low ${low})`,
      changed:
        summary.relations.length !== before.relations ||
        high !== before.high ||
        medium !== before.medium ||
        low !== before.low,
    };
  });

  // ─────────────────────────────────────────────
  // 8. 통합 학습자료 재생성
  // ─────────────────────────────────────────────
  if (relateStep.status === "실패") {
    stopped = true;
    skipStep("통합 학습자료 재생성", "연결 재계산이 실패해 중단했습니다 (기존 학습자료는 그대로 둡니다)");
  } else {
    await runStep("통합 학습자료 재생성", async () => {
      const summary = await buildLearning({ dryRun: options.dryRun });
      const files = summary.documents.reduce(
        (sum, d) => sum + d.practice.reduce((n, p) => n + p.sourceFiles.length, 0),
        0,
      );
      const practice = summary.documents.reduce((sum, d) => sum + d.practice.length, 0);

      return {
        detail: `학습자료 ${summary.documents.length}편 · 실습 연결 ${practice} · 코드 ${files}개`,
        changed:
          summary.documents.length !== before.learningDocuments ||
          practice !== before.practiceLinks ||
          files !== before.sourceFiles,
      };
    });
  }

  // ─────────────────────────────────────────────
  // 9. 수업 방식 ↔ 공식 문서 비교
  //
  // 매번 전부 다시 견주지 않습니다.
  // 공식 문서가 바뀌었는지 먼저 확인하고, **바뀐 것이 있을 때만** 다시 견줍니다.
  // 아무것도 안 바뀌었으면 "다시 볼 것 없음" 만 알립니다.
  // ─────────────────────────────────────────────
  if (stopped) {
    skipStep("수업 방식 ↔ 공식 문서 비교", "앞 단계가 실패해 건너뜁니다");
  } else if (options.dryRun) {
    await runStep("수업 방식 ↔ 공식 문서 비교", async () => {
      const summary = await compare({ dryRun: true });
      return { detail: `비교 ${summary.items.length}건 (dry-run)`, changed: false };
    });
  } else {
    await runStep("수업 방식 ↔ 공식 문서 비교", async () => {
      const existing = await loadComparisons();

      // 아직 한 번도 견주지 않았으면 전부 견줍니다.
      if (!existing) {
        const summary = await compare();
        return {
          status: enrichStatus === "이전 데이터 사용" ? ("이전 데이터 사용" as StepStatus) : undefined,
          detail:
            (enrichStatus === "이전 데이터 사용" ? "예전 공식 문서를 기준으로 " : "") +
            `처음 견주었습니다 — ${summary.items.length}건`,
          changed: true,
        };
      }

      // 공식 문서가 바뀌었는지부터 봅니다.
      const checked = await markStaleComparisons();

      const learningChanged = steps.some(
        (step) => step.name.includes("학습자료") && step.changed,
      );

      // 공식 문서가 **새로 생겼으면** 다시 견줍니다. (17단계)
      //
      // 예전에는 "이미 견준 문서가 바뀌었나" 만 봤습니다. 그래서 새 문서가 들어와도
      // 아무 일도 일어나지 않았습니다 — 견줄 대상이 늘었는데 결과는 그대로였습니다.
      // (17단계에서 한국어 본문이 없던 문서 2건을 영어로 되찾자 이것이 드러났습니다)
      const newDocs = enrichSummary?.totalCreated ?? 0;

      if (checked.stale === 0 && !learningChanged && newDocs === 0) {
        return {
          detail: `공식 문서가 그대로라 다시 견주지 않았습니다 (${checked.checked}건 확인)`,
          changed: false,
        };
      }

      const summary = await compare();

      // 공식 문서를 새로 못 받아왔다면, 이 결과는 **예전 문서를 보고 낸 것**입니다.
      // 그 사실을 여기서 알려 두지 않으면 최신 판정으로 오해합니다. (16단계)
      const onStaleDocs = enrichStatus === "이전 데이터 사용";

      return {
        status: onStaleDocs ? ("이전 데이터 사용" as StepStatus) : undefined,
        detail:
          (onStaleDocs ? "예전 공식 문서를 기준으로 견주었습니다 — " : "") +
          (newDocs > 0 ? `공식 문서 ${newDocs}건이 새로 생기고 ` : "") +
          `${checked.stale}건이 바뀌어 다시 견주었습니다 — ` +
          `${summary.items.length}건 (${[...summary.byStatus.entries()]
            .map(([status, count]) => `${status} ${count}`)
            .join(" · ")})`,
        changed: true,
      };
    });
  }

  // ─────────────────────────────────────────────
  // 10. 견준 결과를 학습 설명으로 (15단계)
  //
  // 설명은 비교 결과에서만 나옵니다. 그러니 비교가 그대로면 설명도 그대로입니다.
  // `buildStudy` 가 `comparisons.json` 의 `generatedAt` 을 견주어 스스로 건너뜁니다.
  // ─────────────────────────────────────────────
  if (stopped) {
    skipStep("학습 설명 만들기", "앞 단계가 실패해 건너뜁니다");
  } else if (options.dryRun) {
    await runStep("학습 설명 만들기", async () => {
      const summary = await buildStudy({ dryRun: true });
      if (!summary) return { detail: "아직 견준 결과가 없습니다 (dry-run)", changed: false };
      return {
        detail: `학습 설명 ${summary.data.guides.length}건 (dry-run)`,
        changed: false,
      };
    });
  } else {
    await runStep("학습 설명 만들기", async () => {
      const summary = await buildStudy();
      if (!summary) return null; // 견준 결과가 없으면 할 일이 없습니다

      if (!summary.rebuilt) {
        return {
          detail: `견준 결과가 그대로라 다시 만들지 않았습니다 (${summary.data.guides.length}건)`,
          changed: false,
        };
      }

      const order = ["REPLACE", "RELEARN", "CHECK", "KEEP"] as const;
      const parts = order
        .filter((priority) => summary.byPriority.get(priority))
        .map((priority) => `${priority} ${summary.byPriority.get(priority)}`);

      return {
        detail: `학습 설명 ${summary.data.guides.length}건 (${parts.join(" · ")})`,
        changed: true,
      };
    });
  }

  const after = await takeSnapshot();

  return {
    steps,
    before,
    after,
    changed: steps.some((step) => step.changed),
    stopped,
    dryRun: Boolean(options.dryRun),
  };
}
