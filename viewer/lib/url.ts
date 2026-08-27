/**
 * 외부 링크 URL 을 `<a href>` 에 넣기 전 스킴을 확인합니다.
 *
 * React 는 `href` 값을 sanitize 하지 않습니다 — `javascript:` 나 `data:` URL 이 들어오면
 * 클릭 시 실행될 수 있습니다. 여기 담긴 URL(수업자료 `source_url`, 근거의 `where` 등)은
 * 우리 파이프라인이 만든 값이라 위험도가 낮지만, DB/파일 어느 쪽에서 오든 렌더 직전에
 * 한 번 더 거릅니다. sync 쪽(`src/sync/build-references.ts:sanitizeUrl`)에서도 같은 허용
 * 목록으로 저장 시 검증합니다 (이중 방어).
 *
 * 허용: http, https, mailto. 그 외(상대경로·빈 값·javascript: 등)는 undefined 를 돌려
 * 주고, 호출부는 링크 대신 그냥 텍스트로 보여 줍니다.
 */
export function safeHref(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  const scheme = parsed.protocol.toLowerCase();
  return scheme === "http:" || scheme === "https:" || scheme === "mailto:" ? parsed.href : undefined;
}

/**
 * 마크다운 본문 링크·이미지 URL 용. react-markdown 에 `urlTransform` 으로 넘겨,
 * 본문 안의 링크도 앱 정책(http/https/mailto + 상대경로·#앵커만)에 맞춥니다.
 * react-markdown 기본값은 irc:·xmpp: 등도 허용하므로 여기서 좁힙니다.
 * 허용 안 되는 스킴은 빈 문자열을 돌려 링크를 무력화합니다.
 */
export function safeMarkdownUrl(url: string): string {
  if (!url) return "";
  const colon = url.indexOf(":");
  if (colon === -1) return url; // 스킴 없음 — 상대경로·#앵커·쿼리
  const firstSep = Math.min(
    ...["/", "?", "#"].map((c) => url.indexOf(c)).filter((i) => i !== -1),
  );
  if (Number.isFinite(firstSep) && firstSep < colon) return url; // 콜론이 경로 안 (스킴 아님)
  const scheme = url.slice(0, colon).toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "mailto" ? url : "";
}
