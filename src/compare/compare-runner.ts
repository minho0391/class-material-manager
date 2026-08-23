/**
 * 13단계 — 수업 때 배운 방식과 지금 공식 문서를 견줍니다.
 *
 * ■ 두 갈래로 견줍니다
 *
 *   1. 문법·API   실습 코드가 쓴 기능을 공식 문서가 어떻게 말하고 있는가
 *   2. 패키지 버전 실습 package.json 의 버전이 지금 것과 얼마나 벌어졌는가
 *
 * ■ 지어내지 않습니다
 *
 * 판단의 근거는 둘뿐입니다.
 *
 *   · 공식 문서가 front matter 에 직접 적어 둔 `status:` (deprecated 등)
 *   · package.json 에 적혀 있는 버전 숫자
 *
 * 요약 글에서 "deprecated" 같은 낱말을 찾는 방식은 쓰지 않습니다.
 * 그렇게 했더니 `justify-content` 문서의 "더 이상 사용할 수 있는 공간이 없다"가
 * 사용 중단으로 잡혔습니다. 낱말은 근거가 되지 못합니다.
 *
 * 근거가 모자라면 확정하지 않고 `REVIEW_REQUIRED` 로 남깁니다.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../config/paths.ts";
import { loadIndex, type IndexEntry } from "../store/index-store.ts";
import { loadLearning } from "../store/learning-store.ts";
import {
  COMPARISON_STATUS,
  loadComparisons,
  saveComparisons,
  type ComparisonData,
  type ComparisonItem,
  type ComparisonStatus,
  type Evidence,
  type UsageSite,
} from "../store/comparison-store.ts";
import { TECH_KEYWORDS } from "../config/tech-keywords.ts";
import { analyze } from "./change-analyzer.ts";
import { lookupMissingDocs, loadLookups, type LookupResult } from "./doc-lookup.ts";
import { loadReferences, type ReferenceSummary } from "../learn/reference-index.ts";
import { isVendorPath, looksMinified } from "../relate/relator.ts";
import { readPracticeCode } from "../learn/practice-reader.ts";
import {
  collectPackageUses,
  compareVersions,
  majorOf,
  readProjectVersions,
} from "./package-versions.ts";
import * as log from "../utils/logger.ts";

export interface CompareOptions {
  /** 특정 과목만 */
  only?: string;
  /** 결과만 보여주고 파일은 쓰지 않습니다 */
  dryRun?: boolean;
  /** 공식 문서를 새로 찾아보지 않고, 이미 찾아둔 것만 씁니다 (네트워크 안 씀) */
  skipLookup?: boolean;
}

export interface CompareSummary {
  items: ComparisonItem[];
  byStatus: Map<ComparisonStatus, number>;
  officialDocs: number;
  practiceZips: number;
  /** 공식 문서가 바뀌어 다시 봐야 하는 항목 */
  needsReview: number;
  partial: boolean;
}

/**
 * 공식 문서 제목이 코드 안에 **낱말 단위로** 쓰였는지 봅니다.
 *
 * 그냥 포함 여부만 보면 `Array` 가 `ArrayBuffer` 에도 걸립니다.
 * 앞뒤가 영문자·숫자·밑줄이 아닐 때만 인정합니다.
 */
function usesTerm(code: string, search: SearchTerm): boolean {
  const escaped = search.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // 태그는 여는 꺾쇠까지 붙여 찾고, 뒤에 공백·>·/ 가 와야 진짜 태그입니다.
  if (search.kind === "element") return new RegExp(`${escaped}[\\s>/]`, "i").test(code);

  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}($|[^A-Za-z0-9_])`).test(code);
}

/** 코드에서 찾을 낱말 하나 */
interface SearchTerm {
  /** 찾을 글자 */
  term: string;
  /** element = HTML 태그 (`<font` 로 찾습니다) · plain = 낱말 그대로 */
  kind: "element" | "plain";
}

/**
 * 공식 문서 제목에서 **코드에서 찾을 낱말**을 뽑아냅니다.
 *
 * MDN 제목은 사람이 읽으라고 지은 것이라 그대로는 코드에 나오지 않습니다.
 *
 *   `<font>` HTML font element     →  <font   (태그)
 *   animation-name CSS property    →  animation-name
 *   html: HTML 문서 / 루트 요소      →  html
 *   useState                       →  useState
 *
 * 처음에는 "공백이 든 제목은 버린다"고 했더니, 그것만으로 201건 중 64건이 빠졌습니다.
 * 하필 그 안에 deprecated 인 `<font>` 가 들어 있었습니다.
 *
 * ■ 태그를 따로 다루는 이유
 *
 * `<font>` 요소를 그냥 `font` 로 찾으면 CSS 의 `font:` `font-family` 가 전부 걸립니다.
 * 전혀 다른 것이므로 태그는 `<font` 로 찾습니다.
 */
function searchTermOf(title: string): SearchTerm | null {
  const cleaned = title.trim();

  // `<font>` HTML font element → 태그
  const tag = cleaned.match(/^`?<([A-Za-z][\w-]*)>`?/);
  if (tag?.[1]) return { term: `<${tag[1]}`, kind: "element" };

  // "html: HTML 문서 / 루트 요소" 처럼 콜론 뒤는 설명입니다.
  const beforeColon = cleaned.split(/[:：]/)[0]?.trim() ?? cleaned;

  // "animation-name CSS property" 의 첫 낱말이 실제 이름입니다.
  const first = beforeColon.split(/\s+/)[0]?.replace(/^`|`$/g, "") ?? "";

  // 너무 짧은 낱말은 코드 어디에나 걸려서 근거가 되지 못합니다. (in, of, type …)
  if (first.length < 4) return null;
  // 낱말이 아닌 것(문장 부호만 남은 경우)도 버립니다.
  if (!/^[A-Za-z][\w.-]*$/.test(first)) return null;

  return { term: first, kind: "plain" };
}

/** 코드에서 그 낱말이 쓰인 줄을 하나 찾아 근거로 씁니다. */
function findUsageLine(code: string, search: SearchTerm): string | undefined {
  for (const line of code.split("\n")) {
    if (!usesTerm(line, search)) continue;
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.slice(0, 200);
  }
  return undefined;
}

/** 공식 문서가 밝힌 상태에서 비교 결과를 정합니다. */
function statusFromDoc(reference: ReferenceSummary): { status: ComparisonStatus; reason: string } {
  if (reference.docStatus.includes("deprecated") || reference.docStatus.includes("obsolete")) {
    return {
      status: COMPARISON_STATUS.DEPRECATED,
      reason: "공식 문서가 이 기능을 더 이상 쓰지 말라고 밝혔습니다",
    };
  }

  if (reference.docStatus.includes("experimental") || reference.docStatus.includes("non-standard")) {
    return {
      status: COMPARISON_STATUS.UNSTABLE,
      reason: `공식 문서가 ${reference.docStatus.join("·")} 이라고 밝혔습니다`,
    };
  }

  return {
    status: COMPARISON_STATUS.CURRENT,
    reason: "공식 문서에서 확인되며, 문서가 따로 경고를 달지 않았습니다",
  };
}

/** 코드를 이어 붙일 때 쓰는 줄바꿈 */
const NEWLINE = String.fromCodePoint(10);

/** 같은 갈래 과목인지 (javascript ↔ javascript/jquery) */
function sameFamily(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/**
 * 비교를 실행합니다.
 */
export async function compare(options: CompareOptions = {}): Promise<CompareSummary> {
  const index = await loadIndex();
  const entries = Object.values(index.entries);

  const inScope = (subject: string): boolean =>
    !options.only || subject === options.only || subject.startsWith(`${options.only}/`);

  const isZip = (entry: IndexEntry): boolean =>
    (entry.mimeType === "application/zip" || entry.mimeType === "application/x-zip-compressed") &&
    (entry.zipSourceCount ?? 0) > 0 &&
    Boolean(entry.filePath);

  const zips = entries.filter(isZip).filter((zip) => inScope(zip.subject ?? ""));
  const references = (await loadReferences()).filter((reference) => inScope(reference.subject));

  log.detail(`실습파일 ${zips.length}건 · 공식 문서 ${references.length}건`);

  // ── 근거가 하나도 없으면 만들지 않습니다 ── (16단계)
  //
  // 공식 문서가 한 건도 없으면 견줄 대상이 없습니다.
  // 그런데 그대로 밀고 나가면 실습 코드에서 뽑은 이름들이 전부
  // `NOT_FOUND` 로 잡혀, **"확인해 봤더니 없더라"** 처럼 보이는 결과가 만들어집니다.
  // 사실은 확인 자체를 못 한 것입니다.
  //
  // 게다가 그 결과를 저장하면 멀쩡하던 예전 비교 결과를 덮어씁니다.
  // 그래서 아무것도 하지 않고 물러납니다. 예전 결과는 그대로 남습니다.
  if (references.length === 0) {
    const existing = await loadComparisons();
    throw new Error(
      "공식 문서가 한 건도 없어 견줄 수 없습니다. " +
        (existing
          ? `예전 비교 결과 ${existing.items.length}건은 그대로 두었습니다. `
          : "") +
        "`node src/index.ts enrich` 로 공식 문서를 먼저 받아 주세요.",
    );
  }

  // ── 수업 설명자료를 되찾기 위한 표 ──
  //
  // 10단계 learning.json 에 "이 설명자료 ↔ 이 실습파일" 이 이미 있습니다.
  // 그것을 거꾸로 훑어, 실습파일에서 설명자료로 되돌아갈 수 있게 합니다.
  const learning = await loadLearning();
  const lessonsByZip = new Map<string, Array<{ materialId: string; title: string; path: string }>>();

  for (const document of learning?.documents ?? []) {
    for (const practice of document.practice) {
      const list = lessonsByZip.get(practice.zipId) ?? [];
      list.push({ materialId: document.materialId, title: document.title, path: document.materialPath });
      lessonsByZip.set(practice.zipId, list);
    }
  }

  const now = new Date().toISOString();
  const items: ComparisonItem[] = [];

  // ─────────────────────────────────────────────
  // 1. 문법·API 비교
  // ─────────────────────────────────────────────
  log.step("실습 코드가 쓴 기능을 공식 문서와 견줍니다");

  // 실습파일마다 코드를 한 번만 읽습니다.
  const codeByZip = new Map<string, Map<string, string>>();
  let done = 0;

  for (const zip of zips) {
    const codes = await readPracticeCode(zip.filePath);
    const perFile = new Map<string, string>();
    for (const [path, file] of codes) perFile.set(path, file.code);
    codeByZip.set(zip.docId, perFile);

    done++;
    log.progress(done, zips.length, "실습파일");
  }
  log.endProgress();

  // 제목에서 코드에서 찾을 낱말을 뽑습니다. 뽑히지 않는 문서는 견줄 방법이 없습니다.
  // ── 강사 설명자료 본문도 읽어 둡니다 ──
  const explanatory = entries
    .filter(
      (entry) =>
        (entry.kind === "document" ||
          entry.kind === "published-document" ||
          entry.mimeType === "application/pdf") &&
        Boolean(entry.filePath),
    )
    .filter((entry) => inScope(entry.subject ?? ""));

  const materialText = new Map<string, string>();
  for (const material of explanatory) {
    try {
      materialText.set(material.docId, await readFile(join(DATA_DIR, material.filePath), "utf8"));
    } catch {
      // 한 건을 못 읽어도 나머지로 견줍니다.
    }
  }
  log.detail(`설명자료 ${materialText.size}건도 함께 봅니다`);

  const comparable: Array<{ reference: ReferenceSummary; search: SearchTerm }> = [];
  for (const reference of references) {
    const search = searchTermOf(reference.title);
    if (search) comparable.push({ reference, search });
  }

  for (const { reference, search } of comparable) {
    const usedIn: UsageSite[] = [];
    const taughtIn: ComparisonItem["taughtIn"] = [];
    const evidence: Evidence[] = [];

    // ── 강사 설명자료에서 가르쳤는가 ──
    //
    // 실습 코드에만 기대면 놓치는 것이 있습니다.
    // `<font>` 는 실습 zip 어디에도 없지만 강사님 HTML 슬라이드(PDF)에는 들어 있습니다.
    // "수업에서 배운 것"을 따지는 자리이므로 설명자료도 함께 봐야 합니다.
    for (const material of explanatory) {
      if (!sameFamily(material.subject ?? "", reference.subject)) continue;

      const body = materialText.get(material.docId);
      if (!body || !usesTerm(body, search)) continue;

      taughtIn.push({
        materialId: material.docId,
        title: material.title,
        path: material.filePath,
        line: findUsageLine(body, search),
      });
    }

    for (const zip of zips) {
      if (!sameFamily(zip.subject ?? "", reference.subject)) continue;

      const files = codeByZip.get(zip.docId);
      if (!files) continue;

      // 남의 라이브러리 코드는 세지 않습니다.
      //
      // AOS·jQuery 같은 번들 안에도 옛 문법이 그대로 들어 있습니다.
      // 그러나 그것은 **수업에서 가르친 방식이 아니라** 가져다 쓴 라이브러리의 사정입니다.
      // 이것을 "수업 때 쓴 것" 으로 세면, 고칠 수 없는 것을 고치라고 말하게 됩니다.
      const hits: string[] = [];
      for (const [path, code] of files) {
        if (isVendorPath(path) || looksMinified(code)) continue;
        if (usesTerm(code, search)) hits.push(path);
      }

      if (hits.length === 0) continue;

      usedIn.push({ zipId: zip.docId, zipTitle: zip.title, files: hits.slice(0, 8) });

      // 근거는 처음 두 곳만 담습니다. 목록이 아니라 확인용이기 때문입니다.
      if (evidence.length < 2) {
        const firstFile = hits[0];
        const line = firstFile ? findUsageLine(files.get(firstFile) ?? "", search) : undefined;
        if (line) {
          evidence.push({
            source: "실습 코드",
            text: line,
            where: `${zip.title} → ${firstFile}`,
          });
        }
      }
    }

    // 실습에도 없고 설명자료에도 없으면 이 수업과 상관없는 문서입니다.
    if (usedIn.length === 0 && taughtIn.length === 0) continue;

    const judged = statusFromDoc(reference);

    evidence.unshift({
      source: "공식 문서 상태",
      text:
        reference.docStatus.length > 0
          ? `status: ${reference.docStatus.join(", ")}` +
            (reference.docStatusNote ? ` — ${reference.docStatusNote}` : "")
          : "문서에 상태 표시가 없습니다 (경고 없음)",
      where: reference.sourceUrl,
    });

    // 설명자료에서 찾은 줄도 근거로 남깁니다.
    for (const taught of taughtIn.slice(0, 2)) {
      if (!taught.line) continue;
      evidence.push({ source: "수업 설명자료", text: taught.line, where: taught.path });
    }

    const lessons = new Map<string, { materialId: string; title: string; path: string }>();
    for (const site of usedIn) {
      for (const lesson of lessonsByZip.get(site.zipId) ?? []) lessons.set(lesson.materialId, lesson);
    }

    const analysis = analyze({
      docStatus: reference.docStatus,
      docStatusNote: reference.docStatusNote,
      docMissing: false,
      code: usedIn
        .flatMap((site) => [...(codeByZip.get(site.zipId)?.values() ?? [])])
        .join(NEWLINE),
      subject: reference.subject,
    });
    for (const item of analysis.evidence) {
      if (!evidence.some((existing) => existing.text === item.text)) evidence.push(item);
    }

    items.push({
      changeType: analysis.changeType,
      severity: analysis.severity,
      oldPattern: analysis.oldPattern,
      currentPattern: analysis.currentPattern,
      recommendedAlternative: analysis.recommendedAlternative,
      id: `api:${reference.subject}/${reference.slug}`,
      subject: reference.subject,
      // 화면에 보일 이름은 찾은 낱말 그대로가 낫습니다.
      // ("animation-name CSS property" 보다 "animation-name" 이 알아보기 쉽습니다)
      topic: search.kind === "element" ? `${search.term}>` : search.term,
      kind: "api",
      status: judged.status,
      reason: judged.reason,
      lessons: [...lessons.values()],
      taughtIn,
      usedIn,
      official: {
        subject: reference.subject,
        slug: reference.slug,
        title: reference.title,
        sourceUrl: reference.sourceUrl,
        fetchedAt: reference.fetchedAt,
        contentHash: reference.contentHash,
        docStatus: reference.docStatus,
      },
      evidence,
      lastComparedAt: now,
    });
  }

  // ─────────────────────────────────────────────
  // 1-2. 공식 문서를 못 찾은 기술
  //
  // 우리가 가진 공식 문서는 **과목당 40건**뿐입니다. (6단계 상한)
  // 그러니 "우리 목록에 없다"는 것은 "없어졌다"는 뜻이 전혀 아닙니다.
  // 그런데도 이것을 적어 두는 이유는, **확인하지 못한 것을 확인한 척하지 않기 위해서**입니다.
  // ─────────────────────────────────────────────
  // ── 어느 과목 폴더에 있든 "코퍼스에 있다"로 봅니다 ──
  //
  // 과목별로만 찾았더니 `useState`·`align-items` 까지 "공식문서 없음" 으로 잡혔습니다.
  // css/align-items.md 와 react/useState.md 가 멀쩡히 있는데도요.
  // 여기서 답하려는 질문은 "이 기술을 다룬 공식 문서를 우리가 가지고 있는가" 하나뿐이므로,
  // 폴더를 가리지 않고 찾는 것이 맞습니다.
  const covered = new Set(
    (await loadReferences())
      .map((reference) => searchTermOf(reference.title)?.term.toLowerCase())
      .filter((term): term is string => Boolean(term)),
  );

  // 기술 하나에 항목 하나로 모읍니다.
  //
  // 과목별로 따로 만들었더니 `addEventListener` 하나가 6개 과목에 각각 잡혀
  // 158건이 되었습니다. 정작 사실은 "이 기술을 다룬 공식 문서가 하나도 없다" 는 것 하나뿐입니다.
  const missing = new Map<string, { subject: string; sites: UsageSite[]; line?: string }>();

  for (const zip of zips) {
    const files = codeByZip.get(zip.docId);
    if (!files) continue;

    // 남의 라이브러리 코드는 빼고 봅니다. 수업에서 가르친 방식만 따지는 자리입니다.
    const ownFiles = [...files].filter(([path, code]) => !isVendorPath(path) && !looksMinified(code));
    if (ownFiles.length === 0) continue;

    const subject = zip.subject ?? "";

    for (const keyword of TECH_KEYWORDS) {
      // 공식 문서 제목과 견줄 수 있는 것(식별자처럼 생긴 것)만 봅니다.
      if (!/^[A-Za-z][\w.-]{3,}$/.test(keyword.label)) continue;

      // 공식 문서가 이 이름을 다루고 있으면 이미 위에서 견줬습니다.
      if (covered.has(keyword.label.toLowerCase())) continue;

      // **실제로 걸린 파일만** 적습니다.
      //
      // 예전에는 zip 의 앞 세 파일을 그대로 적었습니다. 그래서 `substr` 이 `js/aos.js` 에서
      // 걸렸는데도 `css/main.css` 를 가리켰습니다. 사람이 열어 봐도 아무것도 없는 자리였습니다.
      const hits: string[] = [];
      for (const [path, code] of ownFiles) {
        keyword.pattern.lastIndex = 0;
        if (keyword.pattern.test(code)) hits.push(path);
      }
      if (hits.length === 0) continue;

      const firstHit = hits[0];
      const entry = missing.get(keyword.label) ?? {
        subject,
        sites: [],
        line: firstHit
          ? findUsageLine(files.get(firstHit) ?? "", { term: keyword.label, kind: "plain" })
          : undefined,
      };
      if (entry.sites.length < 8) {
        entry.sites.push({ zipId: zip.docId, zipTitle: zip.title, files: hits.slice(0, 3) });
      }
      missing.set(keyword.label, entry);
    }
  }

  // ── 확인하지 못한 것들의 공식 문서를 따로 찾아봅니다 (14단계) ──
  //
  // 6단계는 "많이 언급된 상위 40건" 만 요약합니다. 그래서 `document.write` 처럼
  // **공식 문서가 버젓이 있는데도** 확인 못 한 것으로 남는 일이 생깁니다.
  // 여기서는 그 이름들만 콕 집어 MDN 의 정해진 자리를 짚어 봅니다.
  //
  // dry-run 일 때는 찾아보지 않습니다. 이미 찾아 둔 것만 씁니다.
  // 찾아보면 `data/doc-lookup.json` 이 새로 쓰이는데, 그러면
  // **"바꾸지 않겠다"고 말해 놓고 바꾸는 것**이 됩니다.
  const lookups = options.skipLookup || options.dryRun
    ? await loadLookups()
    : (
        await lookupMissingDocs(
          [...missing.entries()].map(([label, found]) => ({ term: label, subject: found.subject })),
        )
      ).results;

  for (const [label, found] of missing) {
    const looked: LookupResult | undefined = lookups.get(label);
    const code = found.sites
      .flatMap((site) => [...(codeByZip.get(site.zipId)?.values() ?? [])])
      .join(NEWLINE);

    const analysis = analyze({
      docStatus: looked?.docStatus ?? [],
      docStatusNote: looked?.docStatusNote,
      docMissing: !looked?.found,
      code,
      subject: found.subject,
    });

    // 문서를 찾아냈으면 더 이상 "확인 못 함" 이 아닙니다.
    const status = !looked?.found
      ? COMPARISON_STATUS.NOT_FOUND
      : looked.docStatus?.length
        ? looked.docStatus.includes("deprecated") || looked.docStatus.includes("obsolete")
          ? COMPARISON_STATUS.DEPRECATED
          : COMPARISON_STATUS.UNSTABLE
        : COMPARISON_STATUS.CURRENT;

    const evidence: Evidence[] = [
      { source: "실습 코드", text: found.line ?? label, where: found.sites[0]?.zipTitle },
      ...analysis.evidence,
    ];

    if (!looked?.found) {
      evidence.push({
        source: "확인하지 못한 까닭",
        text: `MDN 의 있을 법한 자리 ${looked?.tried ?? 0}군데를 짚어 봤지만 없었습니다. 서드파티 라이브러리나 MDN 이 다루지 않는 것일 수 있습니다.`,
      });
    }

    items.push({
      id: `gap:${label}`,
      subject: found.subject,
      topic: label,
      kind: "api",
      status,
      reason: analysis.summary,
      changeType: analysis.changeType,
      severity: analysis.severity,
      oldPattern: analysis.oldPattern,
      currentPattern: analysis.currentPattern,
      recommendedAlternative: analysis.recommendedAlternative,
      lessons: found.sites.flatMap((site) => lessonsByZip.get(site.zipId) ?? []).slice(0, 5),
      taughtIn: [],
      usedIn: found.sites,
      official: looked?.found
        ? {
            subject: found.subject,
            slug: label,
            title: label,
            sourceUrl: looked.pageUrl ?? "",
            fetchedAt: looked.checkedAt.slice(0, 10),
            contentHash: looked.contentHash ?? "",
            docStatus: looked.docStatus ?? [],
            source: "lookup",
          }
        : undefined,
      evidence,
      lastComparedAt: now,
    });
  }

  // ─────────────────────────────────────────────
  // 2. 패키지 버전 비교
  // ─────────────────────────────────────────────
  log.step("실습 package.json 의 버전을 견줍니다");

  const uses = await collectPackageUses(zips);
  const projectVersions = await readProjectVersions();

  // 같은 패키지를 쓰는 수업자료 중 가장 높은 버전
  const latestInCourse = new Map<string, string>();
  for (const use of uses) {
    const current = latestInCourse.get(use.packageName);
    if (!current || compareVersions(use.range, current) > 0) latestInCourse.set(use.packageName, use.range);
  }

  log.detail(`package.json ${new Set(uses.map((u) => u.zipId)).size}건 · 패키지 ${latestInCourse.size}종`);

  for (const use of uses) {
    const newest = latestInCourse.get(use.packageName) ?? null;
    const mine = projectVersions.get(use.packageName) ?? null;

    const usedMajor = majorOf(use.range);
    const newestMajor = newest ? majorOf(newest) : null;
    const mineMajor = mine ? majorOf(mine) : null;

    let status: ComparisonStatus;
    let reason: string;

    if (usedMajor === null) {
      status = COMPARISON_STATUS.REVIEW_REQUIRED;
      reason = `버전 표기(${use.range})를 숫자로 읽지 못했습니다`;
    } else if (newestMajor !== null && newestMajor > usedMajor) {
      status = COMPARISON_STATUS.VERSION_GAP;
      reason = `수업 안에서도 더 높은 메이저 버전(${newest})을 쓴 자료가 있습니다`;
    } else if (mineMajor !== null && mineMajor > usedMajor) {
      status = COMPARISON_STATUS.VERSION_GAP;
      reason = `이 저장소는 더 높은 메이저 버전(${mine})을 쓰고 있습니다`;
    } else if (newest === null && mine === null) {
      status = COMPARISON_STATUS.REVIEW_REQUIRED;
      reason = "견줄 다른 버전이 없어 최신 여부를 알 수 없습니다";
    } else {
      status = COMPARISON_STATUS.CURRENT;
      reason = "확인 가능한 범위에서 메이저 버전 차이가 없습니다";
    }

    const evidence: Evidence[] = [
      {
        source: "실습 package.json",
        text: `"${use.packageName}": "${use.range}"`,
        where: `${use.zipTitle} → ${use.path}`,
      },
    ];

    if (newest && newest !== use.range) {
      evidence.push({ source: "수업자료 안의 최신 버전", text: `${use.packageName} ${newest}` });
    }
    if (mine) {
      evidence.push({ source: "이 저장소가 쓰는 버전", text: `${use.packageName} ${mine}`, where: "package.json" });
    }

    const lessons = lessonsByZip.get(use.zipId) ?? [];

    const comparedTo = newest && newestMajor !== null && usedMajor !== null && newestMajor > usedMajor
      ? newest
      : (mine ?? newest ?? "");

    const analysis = analyze({
      docStatus: [],
      docMissing: false,
      versionGap: {
        atLesson: use.range,
        comparedTo,
        majorDiffers: status === COMPARISON_STATUS.VERSION_GAP,
      },
      code: [...(codeByZip.get(use.zipId)?.values() ?? [])].join(NEWLINE),
      subject: use.subject,
    });
    for (const item of analysis.evidence) {
      if (!evidence.some((existing) => existing.text === item.text)) evidence.push(item);
    }

    items.push({
      changeType: analysis.changeType,
      severity: analysis.severity,
      oldPattern: analysis.oldPattern,
      currentPattern: analysis.currentPattern,
      recommendedAlternative: analysis.recommendedAlternative,
      id: `pkg:${use.zipId}:${use.packageName}`,
      subject: use.subject,
      topic: use.packageName,
      kind: "package",
      status,
      reason,
      lessons,
      taughtIn: [],
      usedIn: [{ zipId: use.zipId, zipTitle: use.zipTitle, files: [use.path] }],
      versions: { atLesson: use.range, latestInCourse: newest, inThisProject: mine },
      evidence,
      lastComparedAt: now,
    });
  }

  // ── 집계 ──
  const byStatus = new Map<ComparisonStatus, number>();
  for (const item of items) byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);

  // ── 저장 ──
  let merged = items;

  if (!options.dryRun) {
    if (options.only) {
      const existing = await loadComparisons();
      const untouched = (existing?.items ?? []).filter((item) => !inScope(item.subject));
      merged = [...untouched, ...items];
    }

    const data: ComparisonData = {
      version: 1,
      generatedAt: now,
      summary: {
        total: merged.length,
        byStatus: Object.fromEntries(
          [...new Set(merged.map((i) => i.status))].map((s) => [
            s,
            merged.filter((i) => i.status === s).length,
          ]),
        ),
        officialDocs: new Set(merged.filter((i) => i.official).map((i) => i.official?.slug)).size,
        practiceZips: new Set(merged.flatMap((i) => i.usedIn.map((u) => u.zipId))).size,
        needsReview: merged.filter((i) => i.needsReview).length,
      },
      items: merged,
    };

    await saveComparisons(data);
  }

  return {
    items: merged,
    byStatus,
    officialDocs: new Set(items.filter((i) => i.official).map((i) => i.official?.slug)).size,
    practiceZips: new Set(items.flatMap((i) => i.usedIn.map((u) => u.zipId))).size,
    needsReview: merged.filter((i) => i.needsReview).length,
    partial: Boolean(options.only),
  };
}

/**
 * 비교한 뒤 공식 문서가 바뀌었는지 확인해 표시만 합니다.
 *
 * `refresh` 가 공식 문서를 다시 받은 뒤 이것을 부릅니다.
 * **다시 비교하지 않습니다.** 무엇이 다시 봐야 하는지 알려 주기만 합니다.
 * 전부 다시 비교하는 것은 낭비고, 바뀐 것만 짚어 주는 편이 쓸모 있습니다.
 */
export async function markStaleComparisons(): Promise<{ checked: number; stale: number }> {
  const data = await loadComparisons();
  if (!data) return { checked: 0, stale: 0 };

  const references = await loadReferences();
  const hashBySlug = new Map(references.map((r) => [`${r.subject}/${r.slug}`, r.contentHash]));

  // 14단계가 따로 찾아낸 문서는 요약 목록에 없습니다. 그쪽 표도 함께 봐야 합니다.
  const lookups = await loadLookups();

  let stale = 0;

  for (const item of data.items) {
    if (!item.official) continue;

    // 어디서 온 문서인지에 따라 볼 표가 다릅니다.
    // 13단계에 만들어진 자료에는 출처가 없으니 요약 목록으로 봅니다.
    const now =
      item.official.source === "lookup"
        ? lookups.get(item.topic)?.contentHash
        : hashBySlug.get(`${item.official.subject}/${item.official.slug}`);

    // 문서가 사라졌거나 지문이 달라졌으면 다시 봐야 합니다.
    //
    // 지문이 아예 비어 있으면 견줄 것이 없습니다. 그때는 "바뀌었다"고 하지 않습니다.
    // 비어 있는 것을 바뀐 것으로 세었더니, 갱신할 때마다 같은 건수가 되풀이됐습니다.
    const comparable = Boolean(now) && Boolean(item.official.contentHash);
    const changed = now === undefined ? true : comparable && now !== item.official.contentHash;

    item.needsReview = changed;
    if (changed) stale++;
  }

  data.summary.needsReview = stale;
  await saveComparisons(data);

  return { checked: data.items.filter((i) => i.official).length, stale };
}

