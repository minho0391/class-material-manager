/**
 * URL 정규화 — 이 프로그램에서 가장 먼저, 가장 자주 쓰이는 부품입니다.
 *
 * ■ 왜 필요한가
 *
 * 같은 수업자료가 문서 안에서 여러 가지 모습으로 등장합니다.
 *
 *   https://docs.google.com/document/d/AAA/edit?tab=t.0#bookmark=id.xyz
 *   https://docs.google.com/document/d/AAA/edit
 *   https://www.google.com/url?q=https://docs.google.com/document/d/AAA/edit&sa=D&source=...
 *
 * 셋 다 "AAA 라는 문서 하나"를 가리키지만, 문자열로만 비교하면 서로 다른 링크로 보입니다.
 * 그대로 두면 같은 자료를 세 번 저장하게 됩니다.
 *
 * 그래서 모든 링크를 여기에 통과시켜
 *   ① 구글 리다이렉트 래퍼를 벗겨내고
 *   ② 종류(문서/시트/PDF/폴더/외부)를 판별하고
 *   ③ 고유 ID를 뽑아냅니다.
 *
 * 이후 코드는 URL 문자열이 아니라 이 ID로 자료를 구분합니다.
 */

/**
 * 링크의 종류.
 *
 * 종류마다 가져오는 방법이 다르기 때문에 구분이 필요합니다.
 * 예를 들어 document 는 export URL 로 본문을 받을 수 있지만,
 * drive-folder 는 export 자체가 불가능해서 Drive API 를 써야 합니다.
 */
export type ResourceKind =
  /** 일반 Google 문서. export 로 본문을 받을 수 있다. */
  | "document"
  /** "웹에 게시"된 Google 문서 (/document/d/e/…/pub). ID 체계가 다르다. */
  | "published-document"
  /** Google 스프레드시트 */
  | "spreadsheet"
  /** Google 슬라이드 */
  | "presentation"
  /** Google 설문 */
  | "form"
  /** Drive 에 올라온 파일 (이 프로젝트에서는 대부분 PDF) */
  | "drive-file"
  /** Drive 폴더. export 불가 → 내용을 나열하려면 API 가 필요하다. */
  | "drive-folder"
  /** 구글 밖의 외부 사이트 (MDN, codepen, github 등) */
  | "external"
  /** 문서 안 앵커(#…), mailto:, tel: 등 수집 대상이 아닌 것 */
  | "ignored";

/** 정규화를 마친 링크 하나. */
export interface NormalizedLink {
  /** 링크 종류 */
  kind: ResourceKind;
  /**
   * 고유 식별자.
   * Google 리소스면 문서 ID, 외부 사이트면 정규화된 URL 자체를 쓴다.
   * ignored 인 경우에는 null.
   */
  id: string | null;
  /** 정규화된 URL (중복 판정과 사람이 눈으로 확인하는 용도) */
  url: string;
  /** 문서에 실제로 적혀 있던 원본 href (문제 추적용으로 남겨둔다) */
  raw: string;
}

/**
 * ① 구글 리다이렉트 래퍼 벗기기
 *
 * Google Docs 를 HTML 로 내보내면 외부 링크가 이런 모양으로 감싸집니다.
 *   https://www.google.com/url?q=<진짜주소>&sa=D&source=editors&ust=…
 *
 * 실제로 기준 문서에는 이 래퍼가 수백 개 들어 있습니다.
 * 벗겨내지 않으면 모든 외부 링크가 "google.com" 하나로 뭉뚱그려집니다.
 *
 * 래퍼가 중첩될 수도 있으므로 더 이상 벗겨지지 않을 때까지 반복합니다.
 */
export function unwrapRedirect(url: string): string {
  let current = url;

  // 안전장치: 혹시 모를 무한 반복을 막기 위해 최대 5번까지만 벗긴다.
  for (let i = 0; i < 5; i++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return current; // URL 로 해석되지 않으면 그대로 돌려준다
    }

    const isGoogleRedirect =
      (parsed.hostname === "www.google.com" || parsed.hostname === "google.com") &&
      parsed.pathname === "/url";

    if (!isGoogleRedirect) return current;

    const target = parsed.searchParams.get("q") ?? parsed.searchParams.get("url");
    if (!target) return current;

    current = target;
  }

  return current;
}

/**
 * ② 외부 사이트 URL 정규화
 *
 * 같은 페이지인데 주소가 조금씩 다른 경우를 하나로 모읍니다.
 *   - 호스트 이름 소문자로 (Developer.Mozilla.org → developer.mozilla.org)
 *   - 광고 추적 파라미터(utm_*, fbclid 등) 제거
 *   - 끝의 슬래시 정리
 *   - #프래그먼트 제거 (같은 페이지의 다른 위치일 뿐이므로)
 */
export function normalizeExternalUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";

  // 추적용 파라미터는 내용과 무관하므로 지운다.
  const trackingPrefixes = ["utm_", "fbclid", "gclid", "mc_", "ref_"];
  for (const key of [...parsed.searchParams.keys()]) {
    if (trackingPrefixes.some((p) => key.toLowerCase().startsWith(p))) {
      parsed.searchParams.delete(key);
    }
  }

  // 경로 끝의 슬래시를 없앤다. 단 루트("/")는 그대로 둔다.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

// ─────────────────────────────────────────────────────────────
// ③ 종류 판별에 쓰는 패턴들
//
// ★ 순서가 중요합니다.
//   "웹에 게시"된 문서는 /document/d/e/<긴ID>/pub 형태라서,
//   일반 문서 패턴 /document/d/<ID> 를 먼저 검사하면
//   ID 를 "e" 라고 잘못 읽습니다. 실제로 조사 중에 겪은 버그입니다.
//   그래서 published 패턴을 반드시 먼저 검사합니다.
// ─────────────────────────────────────────────────────────────

/** Google 문서 ID 에 쓰이는 문자들 */
const ID_CHARS = "[A-Za-z0-9_-]+";

const PATTERNS: ReadonlyArray<{ kind: ResourceKind; regex: RegExp }> = [
  // ★ 게시형을 가장 먼저 (위 설명 참고)
  { kind: "published-document", regex: new RegExp(`docs\\.google\\.com/document/d/e/(${ID_CHARS})`) },
  { kind: "document", regex: new RegExp(`docs\\.google\\.com/document/d/(${ID_CHARS})`) },
  { kind: "spreadsheet", regex: new RegExp(`docs\\.google\\.com/spreadsheets/d/(${ID_CHARS})`) },
  { kind: "presentation", regex: new RegExp(`docs\\.google\\.com/presentation/d/(${ID_CHARS})`) },
  { kind: "form", regex: new RegExp(`docs\\.google\\.com/forms/d/(${ID_CHARS})`) },
  { kind: "drive-folder", regex: new RegExp(`drive\\.google\\.com/drive/folders/(${ID_CHARS})`) },
  { kind: "drive-file", regex: new RegExp(`drive\\.google\\.com/file/d/(${ID_CHARS})`) },
  // drive.google.com/open?id=… 형태도 파일을 가리킨다.
  { kind: "drive-file", regex: new RegExp(`drive\\.google\\.com/open\\?id=(${ID_CHARS})`) },
  { kind: "drive-file", regex: new RegExp(`drive\\.google\\.com/uc\\?[^"]*id=(${ID_CHARS})`) },
];

/**
 * ④ 링크 하나를 정규화해서 종류와 ID 를 붙여 돌려줍니다.
 *
 * 이 프로그램에서 링크를 다루는 모든 코드는 이 함수를 거칩니다.
 *
 * @param raw 문서에 적혀 있던 href 값 그대로
 */
export function classifyUrl(raw: string): NormalizedLink {
  const trimmed = raw.trim();

  // 수집 대상이 아닌 것들을 먼저 걸러낸다.
  //   #… → 문서 안의 다른 위치로 가는 앵커
  //   mailto:, tel: → 연락처
  //   about:, javascript: → 링크가 아님
  if (
    trimmed === "" ||
    trimmed.startsWith("#") ||
    /^(mailto|tel|about|javascript|data):/i.test(trimmed)
  ) {
    return { kind: "ignored", id: null, url: trimmed, raw };
  }

  // 구글 리다이렉트 래퍼를 벗긴다.
  const unwrapped = unwrapRedirect(trimmed);

  // http/https 가 아니면 다루지 않는다.
  if (!/^https?:\/\//i.test(unwrapped)) {
    return { kind: "ignored", id: null, url: unwrapped, raw };
  }

  // Google 리소스인지 패턴을 순서대로 확인한다.
  for (const { kind, regex } of PATTERNS) {
    const match = unwrapped.match(regex);
    if (match?.[1]) {
      return {
        kind,
        id: match[1],
        url: canonicalGoogleUrl(kind, match[1]),
        raw,
      };
    }
  }

  // 여기까지 왔으면 외부 사이트다.
  const normalized = normalizeExternalUrl(unwrapped);
  return { kind: "external", id: normalized, url: normalized, raw };
}

/**
 * ⑤ Google 리소스의 대표 URL을 만든다.
 *
 * ID 만 있으면 항상 같은 모양의 주소를 만들 수 있으므로,
 * ?tab=… #bookmark=… /edit 같은 꼬리표가 붙은 여러 주소가 하나로 합쳐집니다.
 */
export function canonicalGoogleUrl(kind: ResourceKind, id: string): string {
  switch (kind) {
    case "document":
      return `https://docs.google.com/document/d/${id}/edit`;
    case "published-document":
      return `https://docs.google.com/document/d/e/${id}/pub`;
    case "spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${id}/edit`;
    case "presentation":
      return `https://docs.google.com/presentation/d/${id}/edit`;
    case "form":
      return `https://docs.google.com/forms/d/${id}/viewform`;
    case "drive-file":
      return `https://drive.google.com/file/d/${id}/view`;
    case "drive-folder":
      return `https://drive.google.com/drive/folders/${id}`;
    default:
      return id;
  }
}

/**
 * ⑥ 이 종류가 "본문을 가져와 저장할 수집 대상"인지 알려줍니다.
 *
 * external 은 나중에 6단계(공식 문서 보충)에서 따로 다루므로 여기서는 제외합니다.
 */
export function isCollectible(kind: ResourceKind): boolean {
  return (
    kind === "document" ||
    kind === "published-document" ||
    kind === "spreadsheet" ||
    kind === "presentation" ||
    kind === "drive-file" ||
    kind === "drive-folder"
  );
}
