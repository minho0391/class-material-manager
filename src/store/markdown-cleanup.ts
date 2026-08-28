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
 * ■ 줄바꿈은 어디로 갔는가 — 두 가지 경우가 있습니다
 *
 * 표 칸 안에서 **줄바꿈 키(Shift+Enter)** 로 줄을 나눴다면, 줄바꿈이
 * **VT(수직 탭, U+000B)** 라는 잘 안 쓰는 글자로 그대로 남아 있습니다.
 * (탭이 아닙니다. 탭은 들여쓰기로 그대로 남아 있습니다) 이 글자를 진짜 줄바꿈으로
 * 되돌리면 원래 모양을 **정확히** 복원할 수 있습니다. 아래 `convertBoxedContent` 의
 * VT 경로가 하는 일입니다.
 *
 * 반면 칸 안에서 **문단을 나눠(그냥 Enter)** 줄을 나눴다면, Google 이 애초에
 * 내보내는 Markdown 자체에 줄바꿈 흔적이 전혀 없습니다 — 문단 사이 공백 한 칸으로
 * 뭉개져 나옵니다. (직접 재수집해 원본 export 를 떠서 확인했습니다: VT 도, 다른 표식도 없습니다)
 * 이 경우는 어떤 후처리로도 "몇 번째 글자 뒤에 원래 줄바꿈이 있었는지"를 되살릴 수 없습니다.
 * 그래서 **줄바꿈을 추측하지 않습니다.** 코드라는 확신이 서면(`looksLikeCode`) 원문의
 * 문자 순서와 공백을 **한 글자도 바꾸지 않고** 그대로 코드펜스(```)로만 감쌉니다.
 * 긴 한 줄이 화면에서 읽기 어려운 문제는 뷰어가 CSS 자동 줄바꿈(`white-space: pre-wrap`)
 * 으로 풉니다 — 저장되는 텍스트에는 개행을 넣지 않습니다.
 * (예전엔 구조를 추측해 다시 줄을 나누는 `reflowSquashedCode` 가 있었으나, regex·주석·
 *  JSX·TS 타입 등에서 원본 의미를 바꿀 수 있어 제거했습니다. Codex 리뷰 2026-08-28.)
 *
 * ■ 왜 1칸짜리 표만 건드리는가
 *
 * 2칸 이상은 진짜 데이터 표(용어 설명, 비교표 등)이고,
 * **1칸짜리는 대부분 표가 아니라 "박스"** 입니다. 코드나 명령어, 가끔은 순수 안내문을
 * 담는 용도로 쓰였습니다. (안내문·산문을 코드로 오판하지 않도록 `looksLikeCode` 가
 * 보수적으로 — 코드 키워드/대입/호출/CSS 규칙 같은 뚜렷한 신호가 있을 때만 — 통과시킵니다)
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

/**
 * VT 없이 한 줄로 뭉쳐진 1칸 박스가 **코드인지** 보수적으로 판단합니다.
 *
 * 참이면 그 박스는 (줄 재구성 없이) 원문 그대로 코드펜스로 감싸집니다. 그러므로
 * 오판 비용은 "일반 산문이 코드블록처럼 보이는 것" 입니다. 그래서 기준을 넉넉히
 * 잡지 않고, **프로즈에는 거의 없는 신호가 뚜렷할 때만** 코드로 봅니다.
 *
 *   1. Markdown 이스케이프를 걷어낸 길이가 80자를 넘고
 *   2. 세미콜론이 "문장 종결"로 2번 이상 쓰였고
 *      (`; 그리고…` 처럼 세미콜론 뒤에 한글/일반 단어가 오는 프로즈는 세지 않음)
 *   3. 그리고 다음 중 하나:
 *      - JS 키워드(const/let/var/function/return/class/import/export/new …)나 화살표(`=>`)가
 *        있으면서, 대입(`=`)·화살표·함수 호출 형태 중 하나가 함께 있다
 *      - CSS 규칙 블록(`… { 속성: 값; … }`) 형태다
 *
 * 세미콜론 없는 안내문("public/ 만 남기고 …"), 짧은 명령어 한 줄(`npm install …`),
 * 세미콜론을 문장부호로 쓰는 영어/한국어 산문, `;` 없는 JSON 은 모두 걸러져 표로 남습니다.
 */
export function looksLikeCode(cell: string): boolean {
  const text = unescapeMarkdown(cell);
  if (text.length <= 80) return false;

  // 세미콜론이 문장 종결로 쓰인 횟수: 뒤에 코드 토큰이 오거나(다음 문장 시작) 문자열이 끝남.
  // 프로즈의 "…다; 그리고…"(뒤에 한글·공백)는 여기서 제외된다.
  const statementEnds = (text.match(/;(?:\s*$|\s+(?=[A-Za-z_$}\])'"`]))/g) ?? []).length;
  if (statementEnds < 2) return false;

  const jsKeyword =
    /\b(?:const|let|var|function|return|class|import|export|new|typeof|instanceof|await|yield)\b/.test(
      text,
    );
  const arrow = text.includes("=>");
  // 비교(`==` `<=` `>=` `!=`)나 화살표가 아닌 순수 대입 `=`.
  const assignment = /(?:^|[^=!<>+\-*/%&|^~])=(?![=>])/.test(text);
  const callForm = /[A-Za-z_$][\w$]*\s*\([^)]*\)\s*[;{]/.test(text);
  const cssRule = /\{[^{}]*[A-Za-z-]+\s*:\s*[^;{}]+;[^{}]*\}/.test(text);

  return ((jsKeyword || arrow) && (assignment || arrow || callForm)) || cssRule;
}

/** 변환 결과와 함께, 무엇을 바꾸고 무엇을 남겼는지 알려줍니다. */
export interface CleanupResult {
  text: string;
  /** 코드블록으로 바꾼 1칸 표의 개수 */
  converted: number;
  /** 1칸 표지만 코드가 아니어서(또는 VT·코드 신호가 없어서) 그대로 둔 개수 */
  keptSingle: number;
  /** 2칸 이상이라 손대지 않은 표의 개수 */
  keptTable: number;
}

/**
 * 1칸짜리 표 중 **코드를 담은 것만** 코드블록으로 되돌립니다.
 *
 *   1. 표가 1칸짜리다 (2칸 이상이면 진짜 표이므로 손대지 않는다)
 *   2. 그리고 둘 중 하나:
 *      - 칸 안에 VT 가 있다 → 원래 여러 줄. VT 를 진짜 줄바꿈으로 되돌려 정확히 복원한다.
 *      - VT 는 없지만 `looksLikeCode` 가 참이다 → 원래 줄 위치를 알 수 없으므로 줄을
 *        나누지 않고, 원문(문자·공백)을 그대로 둔 채 코드펜스로만 감싼다.
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

    if (!cell.includes(VERTICAL_TAB)) {
      // 줄바꿈 표식(VT)이 없습니다. 원래도 한 줄이었을 수도 있고, 문단으로 나뉜
      // 여러 줄이 표식 없이 뭉쳐졌을 수도 있습니다 (위 파일 설명 참고). 뒤엣것이라도
      // 원래 줄 위치는 알 수 없으므로 **추측하지 않고**, 코드가 뚜렷하면 원문의
      // 문자·공백을 그대로 둔 채 코드펜스로만 감쌉니다. (화면 줄바꿈은 뷰어 CSS 담당)
      if (looksLikeCode(cell)) {
        output.push("```");
        output.push(unescapeMarkdown(cell));
        output.push("```");
        converted++;
        i++;
        continue;
      }

      keptSingle++;
      output.push(line);
      continue;
    }

    // ── 여기부터가 VT 를 이용한 실제 변환 ──
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
