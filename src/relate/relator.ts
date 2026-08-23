/**
 * 설명자료와 실습파일을 이어 붙이는 판정 규칙.
 *
 * ■ 무엇을 하려는 것인가
 *
 *   "React Hooks 설명 문서"  ↔  "react-custom-hooks_v202606.zip 의 useDebounce.js"
 *
 * 이런 짝을 자동으로 찾아냅니다. AI 는 쓰지 않고, 이미 가진 자료만으로 규칙으로 판단합니다.
 *
 * ■ 가장 중요한 원칙 — 애매하면 잇지 않는다
 *
 * 연결을 많이 만드는 것은 쉽습니다. 같은 과목이면 전부 이으면 되니까요.
 * 하지만 그러면 "React 설명자료 109건 × React 실습파일 18건 = 1,962개"의
 * 쓸모없는 연결이 생기고, 정작 맞는 짝이 그 안에 묻힙니다.
 *
 * 그래서 **같은 과목이라는 것만으로는 절대 연결하지 않습니다.**
 * 반드시 그 위에 다른 근거가 하나 이상 있어야 합니다.
 *
 * ■ 흔한 낱말은 근거가 되지 못한다
 *
 * `index.html` 은 실습파일 108개 중 94개에 들어 있습니다.
 * `useState` 는 React 실습파일 대부분에 나옵니다.
 * 이런 것이 겹쳤다고 점수를 주면 전부 서로 연결됩니다.
 *
 * 그래서 **낱말의 무게를 자료에서 세어 정합니다.** 드물수록 무겁습니다.
 * 이 계산이 오탐을 막는 핵심입니다.
 */
import type { MaterialFeature, SourceFileFeature } from "./feature-extractor.ts";
import { LOW_VALUE_SOURCE_NAMES } from "../config/tech-keywords.ts";

// ─────────────────────────────────────────────────────────────
// 조절 값
//
// 실제 자료(설명 234건 · 실습 108건)로 돌려 보며 맞춘 값입니다.
// 연결을 늘리고 싶으면 MIN_SCORE 를, 근거를 더 엄격히 하려면 HIGH_SCORE 를 올리면 됩니다.
// ─────────────────────────────────────────────────────────────

/** 같은 과목일 때 주는 기본 점수. 이 점수만으로는 절대 연결되지 않습니다. */
const SUBJECT_POINTS = 10;

/** 상위·하위 과목일 때 (javascript ↔ javascript/jquery) */
const SUBJECT_KIN_POINTS = 5;

/** 제목 낱말이 겹칠 때 줄 수 있는 최대 점수 */
const MAX_TITLE_POINTS = 60;

/** 기술 낱말이 겹칠 때 줄 수 있는 최대 점수 — 흔한 낱말을 잔뜩 모아 high 가 되는 것을 막습니다 */
const MAX_KEYWORD_POINTS = 26;

/** 소스 파일 이름이 설명자료 제목과 맞아떨어질 때 줄 수 있는 최대 점수 */
const MAX_FILENAME_POINTS = 45;

/** 이 점수를 넘지 못하면 연결하지 않습니다 */
export const MIN_SCORE = 30;

/**
 * 기술 낱말만으로 이어지려면 이 점수가 필요합니다.
 *
 * 제목도 파일 이름도 안 겹치고 "쓰는 기술이 비슷하다"뿐이라면 가장 약한 근거입니다.
 * 실제로 이 문턱이 없을 때 "Javascript와 jQuery 비교 ↔ section_scroll_base.zip" 처럼
 * DOM API 몇 개가 겹쳤다는 이유만의 연결이 만들어졌습니다.
 */
const MIN_SCORE_KEYWORD_ONLY = 42;

/** 이 점수 이상이면 high (근거 조건도 함께 봅니다) */
export const HIGH_SCORE = 55;

/**
 * 이 점수 이상이면 medium.
 *
 * 근거가 한 종류이고 겹친 낱말도 하나뿐이면 점수가 딱 40 이 나옵니다. (10 + 30)
 * 그런 연결은 medium 이라 부르기에 약합니다.
 * 실제로 "01_CSS GRID 핵심 ↔ flexbox_base_2020v.zip" 이 그랬습니다.
 * (그 zip 안에 05_image-grid-BASE 폴더가 있다는 이유만으로 40점)
 */
export const MEDIUM_SCORE = 42;

/** 설명자료 하나에 붙일 수 있는 실습파일 최대 개수 */
export const MAX_ZIPS_PER_MATERIAL = 4;

/** 실습파일 하나에서 골라 보여줄 소스 파일 최대 개수 */
export const MAX_SOURCE_FILES = 6;

// ─────────────────────────────────────────────────────────────
// 낱말의 무게
// ─────────────────────────────────────────────────────────────

/**
 * 낱말이 몇 개의 자료에 나오는지를 세어 무게를 정합니다.
 *
 * 드문 낱말일수록 "이 둘은 같은 주제다"라는 증거가 강합니다.
 *
 *   useDebounce  실습파일 1개에만 등장  → 아주 강한 근거
 *   useState     실습파일 13개에 등장   → 보통
 *   index        거의 모든 곳에 등장     → 근거 아님
 *
 * 검색에서 쓰는 IDF 와 같은 생각인데, 계단식으로 단순하게 만들었습니다.
 * 로그를 쓰면 값이 매끄럽지만, 왜 이 점수가 나왔는지 사람이 설명하기 어려워집니다.
 */
export function weighByRarity(documentFrequency: number, total: number): number {
  if (documentFrequency <= 0) return 0;

  const share = documentFrequency / Math.max(total, 1);

  if (documentFrequency <= 2) return 1;      // 아주 드묾 — 온전한 무게
  if (documentFrequency <= 4) return 0.75;
  if (documentFrequency <= 8) return 0.45;
  if (share <= 0.25) return 0.25;
  if (share <= 0.5) return 0.1;
  return 0;                                   // 절반 넘는 자료에 있으면 근거로 쓰지 않습니다
}

/**
 * **같은 과목 안에서** 얼마나 흔한지에 따라 무게를 깎습니다.
 *
 * 이것이 오탐을 막는 두 번째이자 더 중요한 장치입니다.
 *
 * 전체 342건에서 보면 `useState` 는 13건에만 나오는 "드문" 낱말입니다.
 * 그런데 우리는 **같은 과목끼리만** 견줍니다.
 * React 실습파일 18개 중 17개에 `useState` 가 있다면,
 * React 자료끼리 비교할 때 그 낱말은 아무것도 구별해 주지 못합니다.
 *
 * 처음에 이 장치 없이 돌렸더니 "REACT 핵심정리 ↔ react_vite_todo.zip" 처럼
 * `react`·`useState`·`onClick` 만 겹친 연결이 79건 나왔습니다.
 */
function penalizeIfCommonInSubject(shareInSubject: number, countInSubject: number): number {
  // ── 작은 과목을 위한 예외 ──
  //
  // TypeScript 과목에는 실습파일이 3개뿐입니다.
  // 그 중 하나에만 있는 낱말도 "비율"로 보면 33% 라 흔해 보입니다.
  // 하지만 셋 중 하나에만 있다면 그것은 실제로 드문 것입니다.
  //
  // 이 예외가 없을 때 "06. 제네릭(Generic)" ↔ "06-generic/generic.ts" 처럼
  // 누가 봐도 맞는 짝이 통째로 사라졌습니다.
  if (countInSubject <= 3) return 1;

  if (shareInSubject <= 0.15) return 1;
  if (shareInSubject <= 0.3) return 0.5;
  if (shareInSubject <= 0.5) return 0.2;
  return 0;
}

/** 낱말별 등장 자료 수 */
export type DocumentFrequency = Map<string, number>;

/**
 * 낱말의 흔함을 전체와 과목별로 함께 담아 두는 표.
 */
export interface RarityTable {
  /** 전체 자료 기준 */
  global: DocumentFrequency;
  total: number;
  /** 과목별 기준 */
  bySubject: Map<string, { frequency: DocumentFrequency; total: number }>;
}

/** 낱말 집합 하나 (어느 과목의 자료인지와 함께) */
export interface TokenSet {
  subject: string;
  tokens: Iterable<string>;
}

/** 여러 자료의 낱말 집합에서 "몇 개 자료에 나왔는지"를 전체·과목별로 셉니다. */
export function buildRarityTable(sets: Iterable<TokenSet>): RarityTable {
  const table: RarityTable = { global: new Map(), total: 0, bySubject: new Map() };

  for (const set of sets) {
    table.total++;

    let bucket = table.bySubject.get(set.subject);
    if (!bucket) {
      bucket = { frequency: new Map(), total: 0 };
      table.bySubject.set(set.subject, bucket);
    }
    bucket.total++;

    for (const token of new Set(set.tokens)) {
      table.global.set(token, (table.global.get(token) ?? 0) + 1);
      bucket.frequency.set(token, (bucket.frequency.get(token) ?? 0) + 1);
    }
  }

  return table;
}

/**
 * 이 낱말이 이 과목에서 얼마나 강한 근거인지 (0 이면 근거로 쓰지 않음).
 */
export function weightOf(table: RarityTable, token: string, subject: string): number {
  const base = weighByRarity(table.global.get(token) ?? 0, table.total);
  if (base <= 0) return 0;

  const bucket = table.bySubject.get(subject);
  if (!bucket || bucket.total === 0) return base;

  const count = bucket.frequency.get(token) ?? 0;
  return base * penalizeIfCommonInSubject(count / bucket.total, count);
}

/** 판정에 쓰는 통계 묶음 */
export interface RelateStatistics {
  /** 제목 낱말 (설명자료 + 실습파일) */
  titleTokens: RarityTable;
  /** 실습 코드에 쓰인 기술 낱말 */
  zipKeywords: RarityTable;
  /** 소스 파일 경로 낱말 */
  pathTokens: RarityTable;
}

// ─────────────────────────────────────────────────────────────
// 과목 비교
// ─────────────────────────────────────────────────────────────

/** 두 과목이 같은 갈래인지. `javascript` 와 `javascript/jquery` 는 친척입니다. */
function subjectRelation(a: string, b: string): "same" | "kin" | "different" {
  if (a === b) return "same";
  if (a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) return "kin";
  return "different";
}

/**
 * 과목 이름 그 자체는 근거가 되지 못합니다.
 *
 * React 자료끼리 견주면서 "둘 다 제목에 react 가 있다"는 것은 아무 정보도 아닙니다.
 * 이미 과목이 같다는 조건으로 걸러 낸 뒤이기 때문입니다.
 *
 *   others/design → design
 *   javascript/jquery → javascript, jquery
 *
 * ■ 버전 숫자가 붙은 것도 마찬가지입니다
 *
 * `html5` 는 `html` 과 정보량이 똑같습니다. HTML 자료끼리 견주는 중이니까요.
 * 그런데 이것을 막지 않았더니 이런 일이 있었습니다.
 *
 *   "8. HTML5 멀티미디어 활용하기"  ↔  HTML_BASIC_FINAL.zip
 *      관련 코드 1위: A/08_form_html5.html   ← 이름에 html5 가 있다는 이유로 40점
 *      관련 코드 3위: A/audio_video_base/index.html  ← 진짜 멀티미디어 코드인데 12점
 *
 * 그래서 낱말 끝의 숫자를 떼고 과목 이름과 견줍니다. (html5 → html, css3 → css)
 */
function isSubjectNameToken(token: string, subject: string): boolean {
  // 끝에 붙은 버전 숫자를 떼어냅니다.
  const bare = token.replace(/\d+$/, "");

  for (const part of subject.split("/")) {
    const lower = part.toLowerCase();
    if (lower === "others" || lower === "_unclassified") continue;

    if (bare === lower) return true;
    // nextjs → next, typscript 같은 표기 흔들림까지 함께 막습니다.
    if (bare === lower.replace(/js$/, "")) return true;
    if (bare === lower.replace(/script$/, "")) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// 판정
// ─────────────────────────────────────────────────────────────

/** 골라낸 소스 파일 하나 */
export interface PickedSourceFile {
  path: string;
  reason: string;
}

/** 판정 결과 */
export interface RelationCandidate {
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  sourceFiles: PickedSourceFile[];
  /** 과목 말고 다른 근거가 몇 종류 있었는지 */
  evidenceKinds: number;
}

/** 소수점 한 자리까지만 남깁니다. (점수가 길어지면 읽기 나쁩니다) */
const round = (value: number): number => Math.round(value * 10) / 10;

/**
 * 남이 만든 라이브러리 파일인지.
 *
 * 실습파일 안에는 강사님이 쓴 코드와 내려받아 넣어둔 라이브러리가 섞여 있습니다.
 * "이 수업 내용의 실습 코드"를 보여주는 자리에 jQuery 원본이 올라오면 안 됩니다.
 *
 * 파일 이름만 보면 놓칩니다. 실제로 `animation.gsap.js` 라는 파일이
 * "animation 이라는 이름이 겹친다"는 근거로 잡혀 엉뚱한 연결을 만들었습니다.
 * 그래서 **경로 전체**를 봅니다 — `plugins/`, `vendor/`, `uncompressed/` 안에 있으면
 * 이름이 무엇이든 남의 코드입니다.
 */
const NEWLINE = String.fromCodePoint(10);

const VENDOR_NAMES =
  /\b(jquery|bootstrap|swiper|gsap|tweenmax|tweenlite|velocity|scrollmagic|modernizr|wow|slick|owl|aos|animate|fullpage|lodash|moment|chartjs|three|popper|normalize|prefixfree|easing)\b/i;

const VENDOR_DIRECTORIES = new Set([
  "plugins", "plugin", "vendor", "vendors", "libs", "library", "libraries",
  "node_modules", "uncompressed", "minified", "min", "dist", "build", "bower_components",
  // `js/lib/iscroll-probe.js` 처럼 `lib` 한 글자만 쓰는 자리도 흔합니다.
  // libs·library 만 넣어 두었더니 이쪽이 통째로 새어 나갔습니다.
  "lib",
]);

export function isVendorPath(path: string): boolean {
  const segments = path.split("/");

  for (const segment of segments.slice(0, -1)) {
    if (VENDOR_DIRECTORIES.has(segment.toLowerCase())) return true;
  }

  const baseName = segments[segments.length - 1] ?? path;

  // `.min.` 말고도 배포용 묶음에 붙는 이름들이 있습니다 (`highlight.pack.js` · `app.bundle.js`).
  return VENDOR_NAMES.test(baseName) || /\.(min|pack|bundle)\.(js|css)$/i.test(baseName);
}

/**
 * 기계가 압축해 낸 코드인지 생김새로 봅니다.
 *
 * 이름만으로는 다 걸러지지 않습니다. 남이 만든 묶음 파일에 아무 이름이나 붙을 수 있기 때문입니다.
 * 그런데 압축된 코드에는 지울 수 없는 특징이 하나 있습니다 — **줄이 터무니없이 깁니다.**
 * 사람이 손으로 쓴 코드에는 한 줄이 이렇게 길어지는 일이 없습니다.
 */
export function looksMinified(code: string): boolean {
  const LONGEST_HUMAN_LINE = 500;

  for (const line of code.split(NEWLINE)) {
    if (line.length > LONGEST_HUMAN_LINE) return true;
  }
  return false;
}

/**
 * 설명자료 하나와 실습파일 하나를 견주어 봅니다.
 *
 * 연결할 만하지 않으면 null 을 돌려줍니다.
 */
export function evaluate(
  material: MaterialFeature,
  zip: MaterialFeature,
  statistics: RelateStatistics,
): RelationCandidate | null {
  const relation = subjectRelation(material.subject, zip.subject);
  if (relation === "different") return null;

  const reasons: string[] = [];
  let score = relation === "same" ? SUBJECT_POINTS : SUBJECT_KIN_POINTS;

  reasons.push(
    relation === "same"
      ? `과목 일치: ${material.subject}`
      : `과목 계열 일치: ${material.subject} ↔ ${zip.subject}`,
  );

  let evidenceKinds = 0;
  const subject = material.subject;
  const isSubjectName = (token: string): boolean => isSubjectNameToken(token, subject);

  // ── 1. 제목 낱말 ──
  //
  // 가장 믿을 만한 근거입니다.
  // "jQuery_01_hover_button_1.pdf" 와 "jQuery_01_hover_button_final.zip" 처럼
  // 강사님이 같은 이름을 붙여 둔 짝이 실제로 있습니다.
  const sharedTitleTokens: Array<{ token: string; weight: number }> = [];

  for (const token of material.titleTokens) {
    if (!zip.titleTokens.has(token)) continue;
    if (isSubjectName(token)) continue;
    const weight = weightOf(statistics.titleTokens, token, subject);
    if (weight > 0) sharedTitleTokens.push({ token, weight });
  }

  if (sharedTitleTokens.length > 0) {
    sharedTitleTokens.sort((a, b) => b.weight - a.weight);
    const points = Math.min(
      MAX_TITLE_POINTS,
      sharedTitleTokens.reduce((sum, item) => sum + item.weight * 34, 0),
    );
    if (points >= 5) {
      score += points;
      evidenceKinds++;
      reasons.push(`제목 낱말 일치: ${sharedTitleTokens.map((t) => t.token).join(", ")}`);
    }
  }

  // ── 2. 기술 낱말 ──
  //
  // 설명자료 본문에 나온 기술과 실습 코드에 쓰인 기술이 겹치는지 봅니다.
  // 흔한 낱말은 무게가 0 이라 아무리 많이 겹쳐도 점수가 오르지 않습니다.
  const sharedKeywords: Array<{ label: string; weight: number }> = [];

  for (const [label, countInMaterial] of material.keywords) {
    if (!zip.keywords.has(label)) continue;
    const weight = weightOf(statistics.zipKeywords, label, zip.subject);
    if (weight <= 0) continue;

    // 설명자료가 그 기술을 여러 번 다루면 조금 더 쳐 줍니다. (지나치지 않게 1.4배까지)
    const emphasis = Math.min(1.4, 1 + (countInMaterial - 1) * 0.08);
    sharedKeywords.push({ label, weight: weight * emphasis });
  }

  if (sharedKeywords.length > 0) {
    sharedKeywords.sort((a, b) => b.weight - a.weight);
    const points = Math.min(
      MAX_KEYWORD_POINTS,
      sharedKeywords.reduce((sum, item) => sum + item.weight * 9, 0),
    );
    if (points >= 4) {
      score += points;
      evidenceKinds++;
      reasons.push(
        `본문·코드 기술 일치: ${sharedKeywords.slice(0, 5).map((k) => k.label).join(", ")}` +
          (sharedKeywords.length > 5 ? ` 외 ${sharedKeywords.length - 5}개` : ""),
      );
    }
  }

  // ── 3. 소스 파일 이름 ──
  //
  // 설명자료 제목이 "useRef" 인데 실습파일 안에 `useRef.jsx` 가 있다면 아주 강한 근거입니다.
  // 흔한 이름(index.html, App.jsx)은 feature-extractor 에서 이미 빠져 있습니다.
  const fileNameHits: Array<{ token: string; path: string; weight: number }> = [];

  for (const file of zip.sourceFiles) {
    // 남의 라이브러리 파일 이름이 겹치는 것은 이 수업에 대한 근거가 아닙니다.
    if (isVendorPath(file.path)) continue;

    for (const token of file.tokens) {
      if (!material.titleTokens.has(token)) continue;
      if (isSubjectName(token)) continue;
      const weight = weightOf(statistics.pathTokens, token, zip.subject);
      if (weight > 0) fileNameHits.push({ token, path: file.path, weight });
    }
  }

  if (fileNameHits.length > 0) {
    // 같은 낱말이 여러 파일에서 걸려도 한 번만 셉니다.
    const bestByToken = new Map<string, { token: string; path: string; weight: number }>();
    for (const hit of fileNameHits) {
      const previous = bestByToken.get(hit.token);
      if (!previous || hit.weight > previous.weight) bestByToken.set(hit.token, hit);
    }

    const points = Math.min(
      MAX_FILENAME_POINTS,
      [...bestByToken.values()].reduce((sum, hit) => sum + hit.weight * 30, 0),
    );

    if (points >= 5) {
      score += points;
      evidenceKinds++;
      reasons.push(
        `소스 파일 이름 일치: ${[...bestByToken.values()].map((h) => `${h.token} (${h.path})`).join(", ")}`,
      );
    }
  }

  // ── 과목만으로는 잇지 않습니다 ──
  if (evidenceKinds === 0) return null;

  score = round(score);
  if (score < MIN_SCORE) return null;

  // 기술 낱말만 겹친 경우에는 더 높은 문턱을 넘어야 합니다.
  const onlyKeywordEvidence = evidenceKinds === 1 && sharedTitleTokens.length === 0 && fileNameHits.length === 0;
  if (onlyKeywordEvidence && score < MIN_SCORE_KEYWORD_ONLY) return null;

  // ── 신뢰도 ──
  //
  // 점수만 보지 않고 "근거가 어떤 것인지"도 함께 봅니다.
  // 한 종류의 약한 근거만으로 high 가 되면, 우연히 겹친 낱말 하나가 확신으로 둔갑합니다.
  //
  // 다만 제목의 드문 낱말이 **둘 이상** 겹치는 경우는 그 자체로 충분히 강합니다.
  //   jQuery_01_hover_button_1.pdf  ↔  jQuery_01_hover_button_final_v202108.zip
  // 이런 짝은 다른 근거가 없어도 사람 눈에 명백합니다.
  const strongTitleMatch = sharedTitleTokens.length >= 2;

  let confidence: RelationCandidate["confidence"];
  if (score >= HIGH_SCORE && (evidenceKinds >= 2 || strongTitleMatch)) confidence = "high";
  else if (score >= MEDIUM_SCORE) confidence = "medium";
  else confidence = "low";

  return {
    score,
    confidence,
    reasons,
    sourceFiles: pickSourceFiles(material, zip, statistics),
    evidenceKinds,
  };
}

/**
 * 이 설명자료와 관련이 깊은 소스 파일을 골라냅니다.
 *
 * 실습파일 전체를 그대로 붙이지 않습니다.
 * jQuery_BASE.zip 은 소스가 37개인데, 그것을 통째로 붙이면
 * "관련 코드"가 아니라 "그냥 목록"이 되어 버립니다.
 */
function pickSourceFiles(
  material: MaterialFeature,
  zip: MaterialFeature,
  statistics: RelateStatistics,
): PickedSourceFile[] {
  const scored: Array<{ file: SourceFileFeature; score: number; reason: string }> = [];

  for (const file of zip.sourceFiles) {
    // 남이 만든 라이브러리는 "수업 코드"가 아니므로 관련 코드로 내놓지 않습니다.
    if (isVendorPath(file.path)) continue;

    let fileScore = 0;
    const notes: string[] = [];

    // 파일 이름·경로가 설명자료 제목과 겹치는가
    for (const token of file.tokens) {
      if (!material.titleTokens.has(token)) continue;
      // 과목 이름(html, html5 …)은 그 실습파일 안의 어떤 파일도 가려내지 못합니다.
      // 이것을 세면 진짜 주제가 맞는 파일이 뒤로 밀립니다.
      if (isSubjectNameToken(token, material.subject)) continue;
      const weight = weightOf(statistics.pathTokens, token, zip.subject);
      if (weight > 0) {
        fileScore += weight * 40;
        notes.push(`제목 낱말 "${token}"`);
      }
    }

    // 이 파일의 코드가 설명자료가 다루는 기술을 쓰는가
    const sharedKeywords: string[] = [];
    for (const label of file.keywords) {
      if (!material.keywords.has(label)) continue;
      const weight = weightOf(statistics.zipKeywords, label, zip.subject);
      if (weight > 0) {
        fileScore += weight * 12;
        sharedKeywords.push(label);
      }
    }
    if (sharedKeywords.length > 0) notes.push(sharedKeywords.slice(0, 3).join(", "));

    // 설정·문서 파일은 뒤로 밀어 둡니다. 아주 낮은 점수를 주어
    // 다른 후보가 없을 때만 나오게 합니다.
    if (LOW_VALUE_SOURCE_NAMES.has(file.baseName)) fileScore *= 0.1;

    // 내용이 거의 없는 파일은 보여줄 가치가 없습니다.
    if (file.length < 120) fileScore *= 0.3;

    if (fileScore <= 0) continue;
    scored.push({ file, score: fileScore, reason: notes.join(" · ") || "관련 기술 사용" });
  }

  scored.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path, "ko"));

  if (scored.length > 0) {
    return scored
      .slice(0, MAX_SOURCE_FILES)
      .map((item) => ({ path: item.file.path, reason: item.reason }));
  }

  // ── 고를 만한 파일이 하나도 없을 때 ──
  //
  // 제목만으로 이어진 짝이 여기 해당합니다.
  //   jQuery_01_hover_button_1.pdf ↔ jQuery_01_hover_button_final_v202108.zip
  // 파일이 index.html 과 style.css 뿐이라 "겹치는 이름"이 없습니다.
  //
  // 그렇다고 관련 코드를 빈칸으로 두면 연결이 반쪽짜리가 됩니다.
  // 이럴 때는 그 실습파일에서 **내용이 실한 파일** 몇 개를 대신 보여줍니다.
  return zip.sourceFiles
    .filter(
      (file) =>
        !isVendorPath(file.path) &&
        !LOW_VALUE_SOURCE_NAMES.has(file.baseName) &&
        file.length >= 200,
    )
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .map((file) => ({ path: file.path, reason: "이 실습파일의 주요 코드" }));
}
