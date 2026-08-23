/**
 * "웹에 게시"된 Google 문서를 가져오는 부분.
 *
 * ■ 이것만 왜 따로 다루는가
 *
 * 보통 문서 주소는 이렇게 생겼습니다.
 *   https://docs.google.com/document/d/{문서ID}/edit
 *
 * 그런데 딱 한 건, 이런 주소가 있었습니다.
 *   https://docs.google.com/document/d/e/2PACX-1vQncLW…/pub
 *
 * `/d/e/` 뒤의 값은 **문서 ID 가 아니라 "게시 주소"** 입니다.
 * 그래서 Drive API 로는 조회할 수 없고, 게시된 웹페이지를 직접 읽어야 합니다.
 *
 * (참고: 이 형태 때문에 1단계에서 정규식이 문서 ID 를 "e" 로 잘못 읽는 문제가 있었습니다.
 *  url-normalizer.ts 에서 이 패턴을 가장 먼저 검사해 해결했습니다)
 */
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type { ApiResult } from "./drive-api.ts";

/** 가져온 게시 문서 */
export interface PublishedDoc {
  /** 문서 제목 */
  title: string;
  /** Markdown 으로 바꾼 본문 */
  markdown: string;
}

/**
 * 게시된 문서를 가져와 Markdown 으로 바꿉니다.
 *
 * 이 페이지는 로그인 없이도 누구나 볼 수 있으므로 인증이 필요 없습니다.
 */
export async function fetchPublishedDoc(publishId: string): Promise<ApiResult<PublishedDoc>> {
  const url = `https://docs.google.com/document/d/e/${publishId}/pub`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });

    if (!response.ok) {
      return {
        ok: false,
        code: "publishedFetchFailed",
        reason: `게시 문서를 가져오지 못했습니다 (HTTP ${response.status})`,
        status: response.status,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $("title").text().trim() || "제목 없는 게시 문서";

    // 본문은 #contents 안에 있습니다.
    // 다만 그 안에 <style> 태그도 함께 들어 있어서, 지우지 않으면
    // CSS 코드가 본문인 것처럼 딸려 나옵니다. (실제로 확인한 문제입니다)
    const contents = $("#contents");
    contents.find("style, script").remove();

    const contentHtml = contents.html();
    if (!contentHtml) {
      return {
        ok: false,
        code: "publishedEmpty",
        reason: "게시 문서에서 본문(#contents)을 찾지 못했습니다.",
        status: 200,
      };
    }

    const turndown = new TurndownService({
      headingStyle: "atx", // # 제목 형식
      codeBlockStyle: "fenced", // ``` 코드블록 형식
      bulletListMarker: "-",
    });

    const markdown = turndown.turndown(contentHtml).replace(/\n{3,}/g, "\n\n").trim();

    return { ok: true, value: { title, markdown } };
  } catch (e) {
    return {
      ok: false,
      code: "network",
      reason: e instanceof Error ? e.message : String(e),
      status: 0,
    };
  }
}
