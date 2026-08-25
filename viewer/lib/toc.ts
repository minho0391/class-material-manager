/**
 * 자료 상세 화면의 "이 페이지" 목차.
 *
 * 강사님 문서는 최상위 제목(`# 1. 프로젝트 시작` 같은 줄)으로 큰 절을 나눕니다.
 * design-mockups-v2 의 목차도 이 최상위 제목만 나열하는 평평한(flat) 목록이라,
 * 여기서도 `#` 한 개짜리 제목만 뽑습니다. 코드블록(``` ) 안의 `#`(주석 등)은
 * 제목이 아니므로 건너뜁니다.
 */

export interface TocHeading {
  id: string;
  text: string;
}

function slugBase(text: string): string {
  return (
    text
      .trim()
      .replace(/[`*_~]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      // 한글·영문·숫자·하이픈만 남깁니다.
      .replace(/[^\w\-가-힣]/g, "") || "section"
  );
}

/** 문서 전체에서 같은 제목이 반복돼도 id 가 겹치지 않게 합니다. */
export function createHeadingIdAssigner(): (text: string) => string {
  const used = new Set<string>();
  return (text: string) => {
    const base = slugBase(text);
    let id = base;
    let i = 2;
    while (used.has(id)) id = `${base}-${i++}`;
    used.add(id);
    return id;
  };
}

/** 마크다운 원문에서 최상위 제목만 뽑아 목차 항목을 만듭니다. */
export function extractTopHeadings(markdown: string): TocHeading[] {
  const assignId = createHeadingIdAssigner();
  const headings: TocHeading[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (!match) continue;

    const text = match[1].trim();
    headings.push({ id: assignId(text), text });
  }

  return headings;
}
