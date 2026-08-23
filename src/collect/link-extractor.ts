/**
 * 문서 HTML 에서 링크를 뽑아내는 부분.
 *
 * ■ 무엇을 뽑는가
 *
 * 단순히 주소만 모으는 게 아니라, 각 링크가 **문서의 어느 섹션 아래에 있었는지**도 함께 기록합니다.
 * 나중에 과목을 분류할 때 이 정보가 가장 강력한 단서가 되기 때문입니다.
 *
 * 예를 들어 "PART 5 최상급" 섹션 아래에 있던 문서라면, 제목에 React 라는 말이 없어도
 * React 쪽 자료일 가능성이 높습니다.
 *
 * ■ 섹션을 어떻게 알아내는가
 *
 * 기준 문서를 실제로 확인해 보니 제목이 전부 <h1> 태그였습니다. (34개, 계층 없이 평면)
 * 그래서 문서를 위에서 아래로 훑으면서
 *   - <h1> 을 만나면 "지금 섹션"을 그것으로 바꾸고
 *   - <a> 를 만나면 "지금 섹션"과 함께 기록
 * 하는 방식으로 처리합니다.
 */
import * as cheerio from "cheerio";
import { classifyUrl, type NormalizedLink, type ResourceKind } from "./url-normalizer.ts";

/** 문서에서 찾아낸 링크 하나 (등장 위치 정보 포함) */
export interface ExtractedLink extends NormalizedLink {
  /** 링크에 적혀 있던 글자 (예: "HTML & CSS 핵심 정리") */
  text: string;
  /** 이 링크가 속한 섹션 제목. 문서 맨 앞이라 섹션이 없으면 null */
  section: string | null;
}

/** 중복을 제거한 자료 하나 */
export interface UniqueResource {
  kind: ResourceKind;
  /** 문서 ID 또는 정규화된 외부 URL */
  id: string;
  /** 대표 주소 */
  url: string;
  /**
   * 이 자료가 문서에서 등장한 모든 위치.
   * 같은 자료가 여러 섹션에 링크되어 있어도 파일은 하나만 만들고, 위치만 여기에 쌓습니다.
   */
  occurrences: Array<{ section: string | null; text: string }>;
}

/** 추출 결과 전체 */
export interface LinkInventory {
  /** 문서에서 발견한 섹션 제목 목록 (등장 순서) */
  sections: string[];
  /** 등장한 순서 그대로의 링크 목록 (중복 포함) */
  links: ExtractedLink[];
  /** 종류별로 묶고 중복을 제거한 자료 목록 */
  unique: Map<ResourceKind, UniqueResource[]>;
}

/**
 * HTML 에서 가져온 글자를 사람이 읽기 좋게 다듬습니다.
 *
 * - &nbsp;(줄바꿈 없는 공백)를 보통 공백으로
 * - 연속된 공백을 하나로
 * - 앞뒤 공백 제거
 * - 기준 문서의 제목마다 붙어 있는 "top↑"(맨 위로 가는 링크) 꼬리표 제거
 */
function cleanText(raw: string): string {
  return raw
    .replace(/ /g, " ")
    .replace(/top\s*↑/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 문서 HTML 에서 링크를 전부 뽑아냅니다.
 *
 * @param html 이미지를 제거한 뒤의 문서 HTML
 */
export function extractLinks(html: string): LinkInventory {
  const $ = cheerio.load(html);

  const sections: string[] = [];
  const links: ExtractedLink[] = [];

  // "지금 어느 섹션을 지나고 있는지" 기억하는 변수.
  // 문서를 위에서 아래로 훑는 동안 <h1> 을 만날 때마다 바뀝니다.
  let currentSection: string | null = null;

  // h1 과 a 를 문서에 나온 순서대로 함께 훑습니다.
  // (cheerio 는 선택 결과를 문서 순서대로 돌려줍니다)
  $("h1, a[href]").each((_index, element) => {
    const node = $(element);
    const tagName = (element as { tagName?: string }).tagName?.toLowerCase();

    if (tagName === "h1") {
      const title = cleanText(node.text());
      // 빈 제목은 섹션으로 치지 않습니다.
      if (title) {
        currentSection = title;
        sections.push(title);
      }
      return;
    }

    // 여기부터는 <a> 태그
    const href = node.attr("href");
    if (!href) return;

    const normalized = classifyUrl(href);

    // 앵커·mailto 처럼 수집 대상이 아닌 것은 버립니다.
    if (normalized.kind === "ignored") return;

    links.push({
      ...normalized,
      text: cleanText(node.text()),
      section: currentSection,
    });
  });

  return { sections, links, unique: buildUniqueMap(links) };
}

/**
 * 링크 목록에서 중복을 제거하고 종류별로 묶습니다.
 *
 * 중복 판정은 **ID 기준**입니다. 주소 문자열이 달라도 ID 가 같으면 같은 자료입니다.
 * 이것이 "이미 수집한 자료는 중복 저장하지 않는다"는 요구사항의 출발점입니다.
 */
function buildUniqueMap(links: ExtractedLink[]): Map<ResourceKind, UniqueResource[]> {
  // 1단계: ID 를 열쇠로 삼아 하나로 합친다.
  const byId = new Map<string, UniqueResource>();

  for (const link of links) {
    if (link.id === null) continue;

    // 종류가 다른데 ID 가 같을 일은 없지만, 만약을 대비해 종류까지 열쇠에 넣는다.
    const key = `${link.kind}:${link.id}`;
    const existing = byId.get(key);

    if (existing) {
      existing.occurrences.push({ section: link.section, text: link.text });
    } else {
      byId.set(key, {
        kind: link.kind,
        id: link.id,
        url: link.url,
        occurrences: [{ section: link.section, text: link.text }],
      });
    }
  }

  // 2단계: 종류별로 나눠 담는다.
  const byKind = new Map<ResourceKind, UniqueResource[]>();
  for (const resource of byId.values()) {
    const list = byKind.get(resource.kind) ?? [];
    list.push(resource);
    byKind.set(resource.kind, list);
  }

  return byKind;
}
