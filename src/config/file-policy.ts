/**
 * 파일 종류별 처리 방침.
 *
 * ■ 왜 방침을 따로 두는가
 *
 * 수업자료 링크를 열어보니 "PDF 180건"인 줄 알았던 것이 실제로는 이랬습니다.
 *
 *   zip  113건  471.8 MB   실습 파일 (Figma 예제, UI 디자인 등)
 *   .fig   7건  204.3 MB   Figma 원본 파일
 *   PDF   15건   17.4 MB   진짜 문서
 *   그 외   5건            json, gif, 잘못 분류된 Google 문서
 *
 * 게다가 Drive 폴더 하나에는 **수업영상 mp4 431개, 72.7 GB** 가 들어 있었습니다.
 *
 * 전부 내려받으면 디스크가 남아나지 않고, 그렇다고 전부 버리면 실습 파일을 잃습니다.
 * 그래서 "무엇을 받고 무엇을 목록만 남길지"를 이 파일 한 곳에서 정합니다.
 * 방침을 바꾸고 싶으면 여기만 고치면 됩니다.
 */

/** 파일을 어떻게 다룰지 */
export type FileAction =
  /** 파일을 내려받아 보관한다 */
  | "download"
  /** 내려받지 않고 제목·크기·원본 주소만 기록한다 */
  | "list-only";

/**
 * 내려받을 파일 종류.
 *
 * 기준은 두 가지입니다.
 *   · 학습에 직접 쓰는 자료인가
 *   · 용량이 감당할 만한가
 */
const DOWNLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/json",
  "text/plain",
  "text/csv",
  "text/html",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

/**
 * 내려받지 않고 목록만 남길 종류.
 *
 *   video/*        수업영상. 431개 72.7GB 라 받을 수 없습니다.
 *   application/x-xfig  Figma 원본(.fig). 7건 204MB 인데다 Figma 앱이 있어야 열립니다.
 *
 * 목록만 남겨도 제목·크기·원본 주소가 기록되므로 필요할 때 바로 찾아갈 수 있습니다.
 */
const LIST_ONLY_MIME_TYPES = new Set(["application/x-xfig"]);

/** 이 크기를 넘으면 종류와 무관하게 받지 않습니다. 실수로 거대한 파일을 받는 것을 막는 안전장치입니다. */
export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

/** Google 이 만든 문서 종류인지 (Drive 파일이 아니라 Docs/Sheets/Slides) */
export function isGoogleNativeType(mimeType: string): boolean {
  return mimeType.startsWith("application/vnd.google-apps.");
}

/**
 * 이 파일을 어떻게 다룰지 정합니다.
 *
 * @param mimeType Drive 가 알려준 파일 종류
 * @param sizeBytes 파일 크기. 모르면 undefined.
 */
export function decideAction(
  mimeType: string,
  sizeBytes: number | undefined,
): { action: FileAction; reason: string } {
  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
    return { action: "list-only", reason: "영상·음성 파일은 목록만 남깁니다" };
  }

  if (LIST_ONLY_MIME_TYPES.has(mimeType)) {
    return { action: "list-only", reason: "전용 앱이 있어야 열리는 파일이라 목록만 남깁니다" };
  }

  if (sizeBytes !== undefined && sizeBytes > MAX_DOWNLOAD_BYTES) {
    const mb = (sizeBytes / 1024 / 1024).toFixed(0);
    return { action: "list-only", reason: `${mb}MB 로 상한(100MB)을 넘어 목록만 남깁니다` };
  }

  if (DOWNLOAD_MIME_TYPES.has(mimeType)) {
    return { action: "download", reason: "" };
  }

  return { action: "list-only", reason: `아직 방침이 정해지지 않은 종류입니다 (${mimeType})` };
}

/**
 * 파일 종류에 맞는 확장자.
 *
 * 파일 이름에서 확장자를 알아내지 못할 때 씁니다.
 */
const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "application/json": ".json",
  "application/x-xfig": ".fig",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/html": ".html",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
};

/** 실제로 확장자로 쓰이는 것들. 이 목록에 없으면 확장자가 아니라고 봅니다. */
const KNOWN_EXTENSIONS = new Set([
  "pdf", "zip", "json", "fig", "txt", "csv", "html", "htm", "md",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico",
  "mp4", "mov", "avi", "mp3", "wav",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp",
  "js", "ts", "jsx", "tsx", "css", "scss", "less", "xml", "yml", "yaml",
  "rar", "7z", "tar", "gz", "psd", "ai", "sketch",
]);

/**
 * 파일에 붙일 확장자를 정합니다.
 *
 * Drive 가 알려주는 이름에 보통 확장자가 붙어 있으므로 그것을 먼저 봅니다.
 * 다만 이름이 `WSP_02_CSS_01_BASIC_v2019.2` 처럼 **버전 번호로 끝나는 경우**가 있어서,
 * 점 뒤의 글자를 무조건 확장자로 믿으면 `.2` 같은 엉뚱한 이름이 만들어집니다.
 * (실제로 겪은 문제입니다)
 *
 * 그래서 알려진 확장자 목록과 대조하고, 아니면 파일 종류(mimeType)로 정합니다.
 */
export function extensionOf(fileName: string, mimeType?: string): string {
  const match = fileName.match(/\.([A-Za-z0-9]{1,8})$/);
  const candidate = match?.[1]?.toLowerCase();

  if (candidate && KNOWN_EXTENSIONS.has(candidate)) return `.${candidate}`;
  if (mimeType && MIME_EXTENSIONS[mimeType]) return MIME_EXTENSIONS[mimeType];

  return ".bin";
}
