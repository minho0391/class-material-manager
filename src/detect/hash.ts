/**
 * 내용 지문(fingerprint) 만들기.
 *
 * ■ 왜 해시를 쓰는가
 *
 * "이 문서가 지난번과 같은 내용인가?"를 알아내려면 본문 전체를 비교해야 합니다.
 * 하지만 236건의 본문을 통째로 보관하고 매번 대조하는 건 낭비입니다.
 *
 * 해시는 아무리 긴 글이라도 항상 같은 길이의 짧은 문자열로 바꿔줍니다.
 * 글자 하나만 달라져도 완전히 다른 값이 나오므로,
 * 이 64글자만 비교하면 내용이 같은지 알 수 있습니다.
 *
 * ■ 왜 Google 이 주는 체크섬을 안 쓰는가
 *
 * Drive API 에는 md5Checksum, sha256Checksum 필드가 있지만
 * 공식 문서에 **바이너리 파일 전용**이라고 명시되어 있습니다.
 * Google 문서 같은 네이티브 파일에는 값이 들어오지 않습니다.
 * 그래서 우리가 직접 계산합니다.
 */
import { createHash } from "node:crypto";

/**
 * 글의 SHA-256 해시를 구합니다.
 *
 * 결과에 `sha256:` 을 붙이는 이유는, 나중에 다른 방식으로 바꾸더라도
 * 저장된 값만 보고 어떤 방식으로 만든 것인지 알 수 있게 하기 위해서입니다.
 *
 * @example
 *   contentHash("안녕") // → "sha256:8f9c1d..."
 */
export function contentHash(text: string): string {
  const digest = createHash("sha256").update(text, "utf8").digest("hex");
  return `sha256:${digest}`;
}
