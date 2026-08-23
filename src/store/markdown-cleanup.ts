/**
 * 받아온 Markdown 을 읽기 좋게 다듬는 부분.
 *
 * ■ 무엇이 문제인가
 *
 * 강사님이 Google Docs 에서 코드 예시를 **1칸짜리 표 안에** 넣어 두셨습니다.
 * 이걸 Markdown 으로 내보내면 이런 모양이 됩니다.
 *
 *   | var plusTen \= function () {⋮  var num1 \= prompt('숫자1', '');⋮}; |
 *   | :---- |
 *
 * Markdown 표는 칸 안에 줄바꿈을 담을 수 없어서, 원래 여러 줄이던 코드가
 * 한 줄로 뭉쳐 버립니다. 내용이 사라진 건 아니지만 코드를 공부하기엔 읽기 어렵습니다.
 *
 * ■ 줄바꿈은 어디로 갔는가
 *
 * 실제 파일을 뜯어보니 줄바꿈이 **VT(수직 탭, U+000B)** 라는 잘 안 쓰는 글자로 남아 있었습니다.
 * (탭이 아닙니다. 탭은 들여쓰기로 그대로 남아 있습니다)
 * 그래서 이 글자를 진짜 줄바꿈으로 되돌리면 원래 모양을 복원할 수 있습니다.
 *
 * ■ 왜 1칸짜리 표만 건드리는가
 *
 * 실제 자료를 세어보니 1칸 표가 109개, 2칸 이상 표가 19개였습니다.
 * 2칸 이상은 진짜 데이터 표(용어 설명, 비교표 등)이고,
 * **1칸짜리는 표가 아니라 "박스"** 입니다. 코드나 예시를 담는 용도로만 쓰였습니다.
 *
 * 그래서 2칸 이상 표는 **절대 손대지 않습니다.**
 * 진짜 표가 코드블록으로 잘못 바뀔 여지를 아예 없애기 위한 기준입니다.
 */

/** Google Docs 가 칸 안의 줄바꿈을 표현하는 데 쓰는 글자 (수직 탭) */
const VERTICAL_TAB = "\u000B";

/** 표의 구분선 줄인지 확인합니다. 예: `| :---- |`, `| --- | --- |` */
function isSeparatorRow(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}

/** 구분선 줄을 보고 표가 몇 칸짜리인지 셉니다. */
function countColumns(separatorRow: string): number {
  return (separatorRow.match(/\|/g) ?? []).length - 1;
}

/**
 * Markdown 이 붙여 놓은 역슬래시를 걷어냅니다.
 *
 * Markdown 으로 내보낼 때 `=` `<` `[` 같은 글자 앞에 `\` 가 붙습니다.
 * 글로 읽을 때는 화면에 안 보이지만, 코드블록 안에서는 그대로 보여서 방해가 됩니다.
 *
 *   var a \= 1;  →  var a = 1;
 *
 * 영문자·숫자 앞의 역슬래시는 남겨둡니다.
 * `\n`, `\t`, `\d` 처럼 코드에서 진짜 의미가 있는 것들이기 때문입니다.
 */
function unescapeMarkdown(text: string): string {
  return text.replace(/\\([^A-Za-z0-9\s])/g, "$1");
}

/** 변환 결과와 함께, 무엇을 바꾸고 무엇을 남겼는지 알려줍니다. */
export interface CleanupResult {
  text: string;
  /** 코드블록으로 바꾼 1칸 표의 개수 */
  converted: number;
  /** 1칸 표지만 줄바꿈이 없어서 그대로 둔 개수 */
  keptSingle: number;
  /** 2칸 이상이라 손대지 않은 표의 개수 */
  keptTable: number;
}

/**
 * 1칸짜리 표 중 **여러 줄이 뭉쳐 있는 것만** 코드블록으로 되돌립니다.
 *
 * 바꾸는 조건은 두 가지를 모두 만족할 때뿐입니다.
 *   1. 표가 1칸짜리다 (2칸 이상이면 진짜 표이므로 손대지 않는다)
 *   2. 칸 안에 VT 가 있다 (= 원래 여러 줄이었다는 증거)
 *
 * 조건에 맞지 않으면 원본 그대로 둡니다.
 */
export function convertBoxedContent(markdown: string): CleanupResult {
  const lines = markdown.split("\n");
  const output: string[] = [];

  let converted = 0;
  let keptSingle = 0;
  let keptTable = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const next = lines[i + 1];

    const isTableStart = line.trim().startsWith("|") && next !== undefined && isSeparatorRow(next);

    if (!isTableStart) {
      output.push(line);
      continue;
    }

    // 2칸 이상이면 진짜 표다. 손대지 않는다.
    if (countColumns(next) !== 1) {
      keptTable++;
      output.push(line);
      continue;
    }

    const cell = line.trim().replace(/^\|/, "").replace(/\|$/, "").trim();

    // 줄바꿈이 없으면 원래도 한 줄이었다는 뜻이다. 굳이 바꿀 이유가 없다.
    if (!cell.includes(VERTICAL_TAB)) {
      keptSingle++;
      output.push(line);
      continue;
    }

    // ── 여기부터가 실제 변환 ──
    const body = unescapeMarkdown(cell)
      .split(VERTICAL_TAB)
      .map((row) => row.replace(/\s+$/, ""))
      .join("\n")
      .trim();

    output.push("```");
    output.push(body);
    output.push("```");

    converted++;

    // 구분선 줄(| :---- |)은 표의 일부이므로 함께 건너뜁니다.
    i++;
  }

  return { text: output.join("\n"), converted, keptSingle, keptTable };
}
