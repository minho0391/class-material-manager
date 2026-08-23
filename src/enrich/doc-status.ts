/**
 * 공식 문서가 스스로 밝힌 "이 기능의 현재 상태"를 읽어내는 부분.
 *
 * ■ 왜 필요한가
 *
 * 13단계의 목표는 "수업 때 배운 방식이 지금도 맞는가"를 따지는 것입니다.
 * 그런데 그 판단을 우리가 지어내면 안 됩니다. **공식 문서가 직접 말한 것만** 근거로 삼아야 합니다.
 *
 * 다행히 MDN 원문에는 그 답이 front matter 에 기계가 읽을 수 있는 형태로 들어 있습니다.
 *
 *   ---
 *   title: "`<font>` HTML font element"
 *   status:
 *     - deprecated
 *   ---
 *
 * ■ 왜 요약본을 보면 안 되는가
 *
 * 6단계 요약은 첫 문단만 뽑아 옵니다. 그래서 `<font>` 요약에는
 * "글꼴 크기와 색을 정한다"만 남고 **deprecated 표시가 통째로 사라집니다.**
 * 실제로 그렇게 되어 있었습니다.
 *
 * 그리고 요약 글에서 낱말로 찾으면 엉뚱한 것이 걸립니다.
 * `justify-content` 문서의 "더 이상 사용할 수 있는 공간이 없기 때문에" 가
 * "더 이상 사용" 이라는 이유로 deprecated 로 잡혔습니다. (실제로 겪은 오탐입니다)
 *
 * 그래서 **원문을 받은 그 자리에서** 공식 표시를 붙잡아 둡니다.
 */

/** 공식 문서가 밝힌 상태 */
export interface DocStatus {
  /** deprecated · experimental · non-standard 중 발견된 것들 */
  flags: string[];
  /** 문서가 직접 적어 둔 경고 문장 (근거로 보여줍니다) */
  note?: string;
}

/** 이 값들만 인정합니다. 문서가 쓰지 않은 말을 만들어내지 않기 위해서입니다. */
const KNOWN_FLAGS = new Set(["deprecated", "experimental", "non-standard", "obsolete"]);

/**
 * MDN front matter 의 `status:` 목록을 읽습니다.
 *
 *   status:
 *     - deprecated
 *     - non-standard
 */
function readMdnStatus(frontMatter: string): string[] {
  const block = frontMatter.match(/^status:\s*\n((?:\s*-\s*\S+\s*\n?)+)/m);
  if (!block?.[1]) return [];

  return block[1]
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").trim().toLowerCase())
    .filter((value) => KNOWN_FLAGS.has(value));
}

/**
 * 문서의 **머리말**만 잘라 냅니다 — 첫 소제목(`##`) 앞까지.
 *
 * ■ 왜 이렇게까지 하는가
 *
 * 공식 문서 한 페이지에는 여러 API 가 함께 실립니다.
 * `react.dev` 의 `Component` 페이지가 그렇습니다. 페이지 아래쪽
 * `### componentWillMount` 절에 `<Deprecated>` 가 붙어 있습니다.
 * **그 절 하나가 옛것이라는 말**이지, `Component` 자체가 옛것이라는 말이 아닙니다.
 *
 * 그런데 페이지 전체에서 표시를 찾으면 그 둘을 구분하지 못합니다.
 * 실제로 `Component` 가 통째로 사용 중단으로 잡혔고, 수업에서 클래스형 컴포넌트를
 * 가르쳤다는 이유로 "당장 고쳐야 함" 이 되었습니다. 사실이 아닙니다.
 *
 * 문서가 **자기 자신**을 두고 하는 말은 언제나 머리말에 옵니다.
 * 그래서 머리말만 봅니다. 이것은 `<table>` 의 `### Deprecated attributes` 를
 * 걸러낸 것과 똑같은 규칙입니다 — 소제목 아래의 말은 그 소제목의 사정입니다.
 */
function introOf(body: string): string {
  const heading = body.match(/^##\s/m);
  return heading?.index === undefined ? body : body.slice(0, heading.index);
}

/**
 * 문서 맨 앞의 경고 상자를 찾습니다.
 *
 *   > [!WARNING]
 *   > Do not use this element. Use the CSS Fonts properties to style text.
 *
 * 이것이 "그럼 무엇을 대신 쓰라는 것인가"에 대한 공식 답입니다.
 */
function readCallout(body: string): string | undefined {
  // WARNING·CAUTION 만 봅니다. NOTE 는 "표가 복잡하면 headers 속성을 쓰세요" 같은
  // 사용 안내인 경우가 많아, 이것을 근거로 붙이면 엉뚱한 문장이 실립니다.
  const match = body.match(/^>\s*\[!(WARNING|CAUTION)\]\s*\n((?:^>.*\n?)+)/m);
  if (!match?.[2]) return undefined;

  const text = match[2]
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return text.length > 0 ? text.slice(0, 400) : undefined;
}

/**
 * React·Next.js 문서에서 쓰는 표시.
 *
 * MDN 처럼 정해진 칸이 없어서, **문서가 대놓고 선언한 경우만** 인정합니다.
 * 본문에 deprecated 라는 낱말이 지나가듯 나오는 것은 세지 않습니다.
 */
function readDeclaredMarkers(body: string): { flags: string[]; note?: string } {
  // ■ 여기서는 아주 인색하게 굽니다
  //
  // 처음에는 `## Deprecated` 같은 제목도 인정했습니다. 그랬더니
  // `<table>`·`<script>`·`<iframe>` 이 전부 deprecated 로 잡혔습니다.
  // 그 문서들에 있는 **`### Deprecated attributes`** (속성 중 일부가 옛것이라는 절) 때문입니다.
  // 요소 자체가 옛것이라는 말과 전혀 다른데 구분하지 못했습니다.
  //
  // 그래서 "문서가 이 기능 자체를 두고 못박은 것"만 인정합니다.
  // react.dev 문서가 쓰는 <Deprecated> 태그가 그렇습니다.
  // 나머지는 표시가 없는 것으로 둡니다 — 없는 근거를 만드는 것보다 낫습니다.
  const declared = body.match(/^<Deprecated>/m);
  if (!declared) return { flags: [] };

  const after = body.slice(declared.index ?? 0, (declared.index ?? 0) + 500);
  const note = after
    .replace(/<\/?Deprecated>/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[0];

  return { flags: ["deprecated"], note: note?.slice(0, 400) };
}

/**
 * 원문 Markdown 에서 공식 상태를 읽어냅니다.
 *
 * 아무 표시도 없으면 빈 목록을 돌려줍니다. 그것은 "정상"이라는 뜻이 아니라
 * **"문서가 아무 말도 하지 않았다"** 는 뜻입니다. 판정은 부르는 쪽에서 합니다.
 */
export function readDocStatus(markdown: string): DocStatus {
  const end = markdown.startsWith("---") ? markdown.indexOf("\n---", 3) : -1;
  const frontMatter = end === -1 ? "" : markdown.slice(3, end);
  const body = end === -1 ? markdown : markdown.slice(end + 4);

  // 머리말만 봅니다. 소제목 아래의 표시는 그 소제목의 사정입니다.
  const intro = introOf(body);

  const flags = new Set(readMdnStatus(frontMatter));
  let note = readCallout(intro);

  const declared = readDeclaredMarkers(intro);
  for (const flag of declared.flags) flags.add(flag);
  if (!note) note = declared.note;

  // 경고 상자는 deprecated 문서가 아니어도 있을 수 있습니다.
  // 상태 표시가 하나도 없으면 경고 문장도 남기지 않습니다. (근거 없는 불안을 만들지 않기 위해)
  if (flags.size === 0) return { flags: [] };

  return { flags: [...flags].sort(), note };
}
