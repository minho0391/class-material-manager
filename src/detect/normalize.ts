/**
 * 본문 정규화 — "내용이 정말 바뀌었는가"를 판단하기 위한 준비 작업.
 *
 * ■ 왜 필요한가
 *
 * 같은 문서를 두 번 내려받아도 결과가 글자 하나까지 똑같지는 않습니다.
 * 줄 끝 공백이나 빈 줄 개수가 미세하게 달라질 수 있습니다.
 *
 * 이걸 그대로 비교하면 내용이 하나도 안 바뀌었는데 "변경됨"으로 판정되어
 * 236건을 매번 다시 저장하게 됩니다. 그래서 비교하기 전에 형태를 통일합니다.
 *
 * ■ 주의: 정규화한 결과는 "비교용"입니다
 *
 * 실제로 저장하는 본문은 정규화 전의 것을 씁니다.
 * 정규화는 어디까지나 해시를 계산해 비교할 때만 쓰는 임시 형태입니다.
 */

/**
 * Markdown 안에 박혀 있는 base64 이미지를 제거합니다.
 *
 * Google Docs 를 Markdown 으로 내보내면 이미지가 이런 모양으로 **문서 맨 아래**에 모입니다.
 *
 *   [image59]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUg…(수십만 글자)…>
 *
 * 그리고 본문에서는 `![][image59]` 처럼 이름으로 참조합니다.
 * 실제로 확인해 보니 문서 하나에서 이미지 72개가 2.9MB 를 차지했습니다.
 * (본문 글자는 42,097자뿐인데 말이죠)
 *
 * 참조 정의만 지우면 용량이 1/70 로 줄고, 본문의 `![][image59]` 표시는 남아
 * "여기에 이미지가 있었다"는 사실은 그대로 확인할 수 있습니다.
 */
export function stripBase64Images(markdown: string): { text: string; removed: number } {
  let removed = 0;

  const cleaned = markdown
    .split("\n")
    .filter((line) => {
      // [이름]: <data:image/…> 형태의 참조 정의인지 확인
      const isImageDefinition = /^\[[^\]]+\]:\s*<?data:[^;]+;base64,/.test(line.trim());
      if (isImageDefinition) removed++;
      return !isImageDefinition;
    })
    .join("\n");

  return { text: cleaned, removed };
}

/**
 * 요청할 때마다 값이 달라지는 **일회용 토큰**을 걷어냅니다. (18단계)
 *
 * ■ 무엇이 문제였나
 *
 * 게시형 Google 문서를 받을 때마다 내용 지문이 달라졌습니다.
 * 본문은 한 글자도 안 바뀌었는데도요. 두 군데가 원인이었습니다.
 *
 *   1. Google 이 바깥 링크를 감싸는 주소
 *      https://www.google.com/url?q=https://github.com/new&sa=D&source=editors
 *        &ust=1787481650142548&usg=AOvVaw2KoDLLOaKjvpcjkxIM4ew4
 *
 *      `ust` 은 요청한 시각, `usg` 는 그때 만든 서명입니다. 매번 달라집니다.
 *
 *   2. 문서에 실린 그림 주소
 *      https://docs.google.com/docs-images-rt/ALKuzta6a001q2KDBSHt…=s2048
 *
 *      가운데 토막이 요청마다 새로 발급됩니다.
 *
 * 그래서 `refresh` 를 돌릴 때마다 이 문서 하나가 "바뀌었다" 로 잡혀
 * 다시 저장되고 다시 분류되었습니다.
 *
 * ■ 어떻게 걷어내나 — **뜻은 남기고 껍데기만**
 *
 * 감싼 주소는 **속에 든 진짜 주소로 바꿔 놓습니다.**
 * 그러면 강사님이 링크를 다른 곳으로 바꿨을 때는 지문도 바뀝니다.
 * 껍데기만 버리고 뜻은 그대로 지키는 것입니다.
 *
 * ■ 그림 주소는 뜻을 지킬 수 없습니다
 *
 * 그림 주소는 토큰이 곧 전부라, 안에 남길 것이 없습니다.
 * 그래서 자리표시자로 바꿉니다. 이것은 **그림이 바뀐 것을 이 방법으로는
 * 알아낼 수 없다**는 뜻입니다. 다만 지금까지도 알아내지 못했습니다 —
 * 늘 "바뀌었다" 고만 했으니 쓸 수 있는 신호가 아니었습니다.
 * 잘못된 신호를 없애는 쪽이 낫습니다. (README 의 알려진 한계에 적어 두었습니다)
 */
export function stripVolatileTokens(text: string): string {
  return (
    text
      // 감싼 주소 → 속에 든 진짜 주소
      .replace(
        /https?:\/\/(?:www\.)?google\.com\/url\?q=([^&\s)\]]+)[^\s)\]]*/g,
        (_whole, destination: string) => {
          try {
            return decodeURIComponent(destination);
          } catch {
            // 풀지 못하면 적어도 껍데기의 흔들리는 부분은 뗍니다.
            return destination;
          }
        },
      )
      // 그림 주소 → 자리표시자
      .replace(
        /https?:\/\/(?:docs|lh\d)\.google(?:usercontent)?\.com\/docs-images-rt\/[^\s)\]"']+/g,
        "https://docs.google.com/docs-images-rt/[일회용-토큰]",
      )
      // 그밖에 남은 ust=·usg= 짝 (다른 모양의 주소에 붙어 있을 때)
      .replace(/([?&])(?:ust|usg)=[^&\s)\]"']*/g, "$1")
  );
}

/**
 * 해시를 계산하기 좋은 형태로 본문을 다듬습니다.
 *
 * 하는 일:
 *   1. BOM 제거 — 파일 맨 앞에 눈에 보이지 않게 붙는 표식(﻿).
 *      실제로 Google export 결과 앞에 붙어 있는 것을 확인했습니다.
 *   2. 줄바꿈 통일 — 윈도우(CRLF)와 그 외(LF)의 차이를 없앱니다.
 *   3. 줄 끝 공백 제거 — 눈에 보이지 않지만 해시는 다르게 만듭니다.
 *   4. 빈 줄 정리 — 3줄 이상 연속된 빈 줄을 2줄로 줄입니다.
 *   5. 앞뒤 공백 제거
 */
export function normalizeForHash(text: string): string {
  return stripVolatileTokens(text)
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 저장할 본문을 다듬습니다.
 *
 * 해시용 정규화와 달리, 사람이 읽을 파일이므로 최소한만 손봅니다.
 *   - BOM 제거 (편집기에서 이상한 글자로 보이는 것을 막는다)
 *   - 줄바꿈을 LF 로 통일
 *   - 파일 끝에 줄바꿈 하나 (많은 도구가 이걸 기대합니다)
 */
export function normalizeForStorage(text: string): string {
  const body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trimEnd();
  return `${body}\n`;
}
