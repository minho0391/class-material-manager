/**
 * Google Docs 문서를 내려받는 부분.
 *
 * ■ export 주소란
 *
 * Google Docs 는 로그인 없이도 아래 주소로 내용을 내려받을 수 있게 해줍니다.
 * (문서가 "링크가 있는 모든 사용자"에게 공개된 경우에만 됩니다)
 *
 *   .../export?format=txt   → 글자만
 *   .../export?format=html  → 서식과 링크까지
 *
 * ■ 왜 두 형식을 다 쓰는가
 *
 *   txt  : 본문 비교(변경 감지)에 쓰기 좋다. 가볍고 서식 잡음이 없다.
 *          그런데 하이퍼링크 주소가 사라진다.
 *   html : 링크 주소가 남아 있다. 다른 수업자료로 이어지는 400여 개의 링크를
 *          뽑으려면 반드시 필요하다.
 *
 * ■ 주의: HTML 은 매우 큽니다
 *
 * 기준 문서의 HTML 은 45.6MB 인데, 그중 45.0MB(98.8%)가 본문에 박혀 있는
 * 이미지(base64) 입니다. 그래서 받자마자 이미지를 지우고 나머지만 씁니다.
 * 지우고 나면 1MB 아래로 줄어듭니다.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { RAW_DIR } from "../config/paths.ts";
import { writeFileAtomic } from "../store/atomic-write.ts";

/**
 * 한 번에 기다릴 최대 시간 (밀리초). 응답이 없으면 포기합니다.
 *
 * 30초로 두었더니 12단계 `refresh` 의 첫 단계가 시간 초과로 실패했습니다.
 * 기준 문서의 HTML 이 **45.6MB** 라, 회선이 조금만 느려도 30초를 넘깁니다.
 * (이미지가 98.8% 인데, 그 이미지는 받은 뒤에야 걷어낼 수 있습니다)
 *
 * 넉넉히 잡아도 잃는 것이 없습니다. 못 받는 문서는 404 처럼 곧바로 실패하지,
 * 시간이 다 갈 때까지 매달려 있지 않습니다.
 */
const TIMEOUT_MS = 120_000;

/** 가져오기 결과 */
export interface FetchResult {
  /** 성공 여부 */
  ok: boolean;
  /** 받아온 내용 (실패하면 빈 문자열) */
  content: string;
  /** HTTP 상태 코드 */
  status: number;
  /**
   * 접근 판정.
   *   "public"  → 로그인 없이 받아졌다
   *   "private" → 권한이 없다 (401/403). 인증을 붙이면 받을 수 있다.
   *   "missing" → 문서가 없다 (404)
   *   "error"   → 네트워크 오류 등
   */
  access: "public" | "private" | "missing" | "error";
  /** 실패한 경우 사람이 읽을 수 있는 이유 */
  reason?: string;
}

/**
 * export 주소를 만듭니다.
 *
 * @param docId 문서 ID
 * @param format "txt" 또는 "html"
 */
export function buildExportUrl(docId: string, format: "txt" | "html"): string {
  return `https://docs.google.com/document/d/${docId}/export?format=${format}`;
}

/**
 * 문서를 내려받습니다.
 *
 * 실패해도 예외를 던지지 않고 결과 객체로 돌려줍니다.
 * 400건이 넘는 자료를 순회할 때 하나가 실패했다고 전체가 멈추면 안 되기 때문입니다.
 */
export async function fetchDocument(
  docId: string,
  format: "txt" | "html",
): Promise<FetchResult> {
  const url = buildExportUrl(docId, format);

  try {
    // AbortSignal.timeout 은 정해진 시간이 지나면 요청을 자동으로 취소해 줍니다.
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        content: "",
        status: response.status,
        access: "private",
        reason: "접근 권한이 없습니다. 인증이 필요합니다.",
      };
    }

    if (response.status === 404) {
      return {
        ok: false,
        content: "",
        status: 404,
        access: "missing",
        reason: "문서를 찾을 수 없습니다.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        content: "",
        status: response.status,
        access: "error",
        reason: `예상하지 못한 응답 코드 ${response.status}`,
      };
    }

    return {
      ok: true,
      content: await response.text(),
      status: response.status,
      access: "public",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, content: "", status: 0, access: "error", reason: message };
  }
}

/**
 * HTML 안에 박혀 있는 base64 이미지를 제거합니다.
 *
 * Google Docs 는 이미지를 이런 모양으로 본문에 통째로 집어넣습니다.
 *   <img src="data:image/png;base64,iVBORw0KGgo…(수십만 글자)…">
 *
 * 링크를 뽑는 데는 전혀 필요 없고 용량만 차지하므로,
 * src 값을 짧은 표시로 바꿔 흔적만 남깁니다.
 * (몇 번째 이미지였는지는 남겨두어야 나중에 필요할 때 찾을 수 있습니다)
 */
export function stripInlineImages(html: string): { html: string; removed: number } {
  let removed = 0;

  const cleaned = html.replace(/src="data:[^"]*"/g, () => {
    removed++;
    return `src="removed-image-${removed}"`;
  });

  return { html: cleaned, removed };
}

/**
 * 이미지를 제거한 HTML 을 캐시 폴더에 저장합니다.
 *
 * 캐시를 남기는 이유는 두 가지입니다.
 *   1. 개발 중에 같은 문서를 반복해서 받지 않아도 된다 (구글 서버에 대한 예의)
 *   2. 파싱이 이상하게 됐을 때 원본을 열어보고 원인을 찾을 수 있다
 */
export async function saveRawHtml(docId: string, html: string): Promise<string> {
  await mkdir(RAW_DIR, { recursive: true });
  const path = join(RAW_DIR, `${docId}.html`);
  await writeFileAtomic(path, html);
  return path;
}

/**
 * 문서 HTML 을 받아 이미지를 지우고 캐시까지 저장하는, 자주 쓰는 묶음 동작.
 */
export async function fetchAndCleanHtml(
  docId: string,
): Promise<FetchResult & { removedImages: number; cachePath?: string }> {
  const result = await fetchDocument(docId, "html");

  if (!result.ok) return { ...result, removedImages: 0 };

  const { html, removed } = stripInlineImages(result.content);
  const cachePath = await saveRawHtml(docId, html);

  return { ...result, content: html, removedImages: removed, cachePath };
}
