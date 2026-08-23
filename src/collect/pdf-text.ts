/**
 * PDF 에서 글자를 뽑아내는 부분.
 *
 * ■ 왜 필요한가
 *
 * PDF 파일만 저장해 두면 "어느 파일에 무슨 내용이 있는지" 찾을 수가 없습니다.
 * 글자를 뽑아 Markdown 으로 함께 저장해 두면
 *   · 과목 분류(5단계)에 쓸 수 있고
 *   · 나중에 내용을 검색할 수 있습니다.
 *
 * ■ unpdf 를 쓰는 이유
 *
 * Mozilla 의 pdf.js 를 Node 에서 쓰기 좋게 감싼 라이브러리입니다.
 * 실제 수업자료로 시험해 보니 한글이 깨지지 않고 잘 나왔습니다.
 *   · NHN 코딩 컨벤션 85쪽 → 56,175자 (한글 16,437자)
 *   · 훈련 시간표 5쪽 → 14,193자
 */
import { extractText, getDocumentProxy } from "unpdf";

/** 추출 결과 */
export interface PdfTextResult {
  ok: boolean;
  /** 뽑아낸 글자 */
  text: string;
  /** 전체 쪽수 */
  pageCount: number;
  /** 실패했을 때의 이유 */
  reason?: string;
}

/**
 * PDF 바이트에서 글자를 뽑습니다.
 *
 * 스캔한 이미지로만 된 PDF 는 글자가 거의 나오지 않습니다.
 * 그런 경우도 오류로 처리하지 않고 빈 글자로 돌려줍니다.
 * (파일 자체는 이미 저장되어 있으므로 잃는 것이 없습니다)
 */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: true });

    return { ok: true, text: normalizePdfText(text), pageCount: totalPages };
  } catch (e) {
    return {
      ok: false,
      text: "",
      pageCount: 0,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 뽑아낸 글자를 읽기 좋게 다듬습니다.
 *
 * PDF 에서 나온 글자는 줄바꿈이 제멋대로라 그대로 두면 읽기 어렵습니다.
 *   · 줄 끝 공백 제거
 *   · 빈 줄이 3줄 이상이면 2줄로
 *   · 문서 전체 앞뒤 공백 제거
 */
function normalizePdfText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
