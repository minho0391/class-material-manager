/**
 * 자료 하나를 보고 어느 과목인지 정하는 부분.
 *
 * 판단 근거를 함께 돌려주는 것이 이 코드의 핵심입니다.
 * "왜 이 자료가 react 로 갔는지"를 알 수 있어야
 * 규칙이 잘못됐을 때 어디를 고칠지 찾을 수 있기 때문입니다.
 */
import {
  AMBIGUOUS_SECTIONS,
  CSS_WORDS,
  HTML_WORDS,
  PRIORITY_KEYWORDS,
  SECTION_MAP,
  SPLIT_HTML_CSS_SECTIONS,
  SUBJECTS,
  TITLE_KEYWORDS,
} from "../config/subjects.ts";
import type { IndexEntry } from "../store/index-store.ts";

/** 어떤 규칙으로 결정됐는지 */
export type ClassifyRule =
  /** 1순위: 제목의 고유 기술명 */
  | "priority-keyword"
  /** 2순위: 섹션 매핑 */
  | "section"
  /** 2순위 변형: HTML/CSS 섞인 섹션을 제목으로 나눔 */
  | "section-split"
  /** 3순위: 제목 낱말 */
  | "title-keyword"
  /** 4순위: 판단 실패 */
  | "unclassified";

export interface ClassifyResult {
  /** 저장될 폴더 경로 (예: "javascript/jquery") */
  subject: string;
  /** 어떤 규칙으로 정해졌는지 */
  rule: ClassifyRule;
  /** 사람이 읽을 수 있는 판단 근거 */
  reason: string;
  /**
   * 얼마나 믿을 만한지.
   *   high   — 섹션이 하나뿐이고 그 섹션이 기술 이름 그대로인 경우
   *   medium — 여러 섹션에 걸쳐 있거나 제목 낱말로 판단한 경우
   *   low    — 판단하지 못한 경우
   */
  confidence: "high" | "medium" | "low";
}

/**
 * 자료에서 판단에 쓸 글자를 모읍니다.
 *
 * 제목만으로는 부족한 경우가 있어, 문서에 적혀 있던 링크 글자도 함께 봅니다.
 * (예: 제목은 "00_FLEX_SUMMARY" 인데 링크 글자가 "FLEX 핵심정리")
 */
function textOf(entry: IndexEntry): string {
  const linkTexts = (entry.occurrences ?? []).map((o) => o.text).join(" ");
  return `${entry.title ?? ""} ${linkTexts}`;
}

/**
 * 이 자료가 속한 섹션들을 뽑습니다.
 *
 * "바로가기"·"목 차"처럼 주제를 알 수 없는 섹션은 **뒤로 미룹니다.**
 * 한 자료가 두 섹션에 걸쳐 있을 때 구체적인 쪽을 쓰기 위해서입니다.
 * (예: "SQL 핵심정리" → 바로가기 + React → React 를 씁니다)
 */
function sectionsOf(entry: IndexEntry): { specific: string[]; ambiguous: string[] } {
  const all = [...new Set((entry.occurrences ?? []).map((o) => o.section).filter(Boolean))];

  return {
    specific: all.filter((s) => s !== null && !AMBIGUOUS_SECTIONS.has(s)) as string[],
    ambiguous: all.filter((s) => s !== null && AMBIGUOUS_SECTIONS.has(s)) as string[],
  };
}

/**
 * HTML 과 CSS 가 섞인 섹션의 자료를 제목으로 나눕니다.
 *
 * 실제로 45건을 검사해 보니 이런 분포였습니다.
 *   CSS 낱말만  24건
 *   HTML 낱말만  8건
 *   둘 다 있음   1건   (마크업 코딩 컨벤션 → HTML 로 봅니다)
 *   둘 다 없음  12건   (sprites, hover 효과 등 — 격리해서 직접 확인)
 */
function splitHtmlCss(text: string): ClassifyResult | null {
  const hasCss = CSS_WORDS.test(text);
  const hasHtml = HTML_WORDS.test(text);

  // 둘 다 있으면 마크업 쪽으로 봅니다.
  // (HTML/CSS 를 함께 다루는 문서는 대개 마크업 규약이었습니다)
  if (hasHtml && hasCss) {
    return {
      subject: SUBJECTS.html,
      rule: "section-split",
      reason: "HTML·CSS 낱말이 모두 있어 마크업 쪽으로 보냈습니다",
      confidence: "medium",
    };
  }

  if (hasCss) {
    return {
      subject: SUBJECTS.css,
      rule: "section-split",
      reason: "제목에 CSS 관련 낱말이 있습니다",
      confidence: "high",
    };
  }

  if (hasHtml) {
    return {
      subject: SUBJECTS.html,
      rule: "section-split",
      reason: "제목에 HTML 관련 낱말이 있습니다",
      confidence: "high",
    };
  }

  // 어느 쪽 낱말도 없으면 여기서 정하지 않습니다.
  return null;
}

/**
 * 자료 하나의 과목을 정합니다.
 */
export function classify(entry: IndexEntry): ClassifyResult {
  const text = textOf(entry);
  const { specific, ambiguous } = sectionsOf(entry);

  // ── 1순위: 제목의 고유 기술명 (섹션보다 우선) ──
  for (const { pattern, subject, label } of PRIORITY_KEYWORDS) {
    if (pattern.test(text)) {
      return {
        subject,
        rule: "priority-keyword",
        reason: `제목에 "${label}" 이(가) 있어 섹션보다 우선 적용했습니다`,
        confidence: "high",
      };
    }
  }

  // ── 2순위: 섹션 매핑 ──
  for (const section of specific) {
    // HTML/CSS 가 섞인 섹션은 제목으로 한 번 더 나눕니다.
    if (SPLIT_HTML_CSS_SECTIONS.has(section)) {
      const split = splitHtmlCss(text);
      if (split) {
        return {
          ...split,
          reason: `섹션 "${section}" → ${split.reason}`,
          confidence: specific.length > 1 ? "medium" : split.confidence,
        };
      }
      // 나누지 못하면 다음 섹션을 봅니다. (없으면 아래 3순위로)
      continue;
    }

    const mapped = SECTION_MAP[section];
    if (mapped) {
      return {
        subject: mapped,
        rule: "section",
        reason:
          specific.length > 1
            ? `섹션 "${section}" (다른 섹션에도 있음: ${specific.filter((s) => s !== section).join(", ")})`
            : `섹션 "${section}"`,
        confidence: specific.length > 1 ? "medium" : "high",
      };
    }
  }

  // ── 3순위: 제목 낱말 ──
  for (const { pattern, subject, label } of TITLE_KEYWORDS) {
    if (pattern.test(text)) {
      const from = specific.length > 0 ? specific.join(", ") : ambiguous.join(", ");
      return {
        subject,
        rule: "title-keyword",
        reason: `섹션(${from})으로는 알 수 없어 제목의 "${label}" 낱말로 판단했습니다`,
        confidence: "medium",
      };
    }
  }

  // ── 4순위: 판단 실패 ──
  const from = [...specific, ...ambiguous].join(", ") || "섹션 없음";
  return {
    subject: SUBJECTS.unclassified,
    rule: "unclassified",
    reason: `섹션(${from})과 제목 모두로 판단하지 못했습니다`,
    confidence: "low",
  };
}
