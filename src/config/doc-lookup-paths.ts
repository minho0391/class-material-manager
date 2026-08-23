/**
 * 공식 문서가 어디에 있는지 찾아보는 자리 목록.
 *
 * ■ 왜 필요한가
 *
 * 13단계에서 `addEventListener`·`localStorage`·`document.write` 같은 것이
 * `NOT_FOUND` 로 남았습니다. 없어진 게 아니라 **우리가 안 받아왔을 뿐**입니다.
 * 6단계가 과목당 상위 40건만 요약하는데, 그 40건 안에 들지 못한 것들입니다.
 *
 * ■ 어떻게 찾는가
 *
 * MDN 문서는 GitHub 저장소에 **자리가 정해져 있습니다.**
 *
 *   web/api/eventtarget/addeventlistener/index.md
 *   web/api/document/write/index.md
 *   web/javascript/reference/global_objects/json/parse/index.md
 *
 * 그래서 이름만 알면 있을 법한 자리를 몇 군데 짚어 보면 됩니다.
 * 있으면 받고, 없으면 그대로 `NOT_FOUND` 로 둡니다. **억지로 다른 문서를 붙이지 않습니다.**
 *
 * ■ 왜 검색 API 를 쓰지 않는가
 *
 * 검색은 "비슷해 보이는 것"을 돌려줍니다. 그것을 그대로 믿으면
 * 엉뚱한 문서를 근거로 삼게 됩니다. 자리를 정확히 짚어 **맞으면 맞고 아니면 아닌** 쪽이 낫습니다.
 */

/** 웹 API 가 어느 인터페이스에 속하는지 — 짚어 볼 순서 */
const WEB_API_INTERFACES = [
  "eventtarget",
  "element",
  "document",
  "window",
  "node",
  "htmlelement",
  "event",
  "keyboardevent",
  "mouseevent",
  "navigator",
  "location",
  "history",
  "storage",
];

/**
 * JavaScript 표준 객체의 메서드가 어디 붙어 있는지.
 *
 * `substr` 은 `String.prototype.substr` 이라 `global_objects/string/substr` 에 있습니다.
 * 이 목록이 없으면 `global_objects/substr` 만 짚어 보고 못 찾습니다. (실제로 놓쳤습니다)
 */
const JS_OWNERS = ["string", "array", "number", "object", "date", "json", "math", "regexp"];

/** 이름 그 자체가 인터페이스인 것들 (IntersectionObserver 등) */
function looksLikeInterface(name: string): boolean {
  return /^[A-Z][A-Za-z]+$/.test(name);
}

/**
 * 이 이름의 공식 문서가 있을 법한 자리들을 만들어 냅니다.
 *
 * 앞에 오는 것부터 짚어 보고, 처음 찾은 것을 씁니다.
 *
 * @param term  찾을 이름 (addEventListener · document.write · object-fit · datalist …)
 * @param subject 과목 — 어느 갈래부터 짚을지 정하는 데 씁니다
 */
export function candidatePaths(term: string, subject: string): string[] {
  const lower = term.toLowerCase();
  const paths: string[] = [];

  const css = (name: string): string => `files/en-us/web/css/reference/properties/${name}/index.md`;
  const html = (name: string): string => `files/en-us/web/html/reference/elements/${name}/index.md`;
  const api = (path: string): string => `files/en-us/web/api/${path}/index.md`;
  const js = (path: string): string => `files/en-us/web/javascript/reference/global_objects/${path}/index.md`;

  // `document.write` 처럼 점이 든 이름은 그대로 자리로 바뀝니다.
  if (lower.includes(".")) {
    const [head, ...rest] = lower.split(".");
    const tail = rest.join("/");
    if (head) {
      paths.push(api(`${head}/${tail}`));
      paths.push(js(`${head}/${tail}`));
    }
  }

  // 과목에 따라 먼저 짚을 갈래를 정합니다.
  if (subject.startsWith("css")) {
    paths.push(css(lower));
  }
  if (subject.startsWith("html")) {
    paths.push(html(lower));
  }

  // 그다음은 갈래를 가리지 않고 짚어 봅니다.
  paths.push(css(lower), html(lower));

  // 이름 자체가 인터페이스인 경우 (IntersectionObserver, FormData …)
  if (looksLikeInterface(term)) paths.push(api(lower));

  // 웹 API 멤버 — 흔한 인터페이스부터
  for (const interfaceName of WEB_API_INTERFACES) paths.push(api(`${interfaceName}/${lower}`));

  // JavaScript 표준 객체 — 그 자체이거나, 어떤 객체의 메서드이거나
  paths.push(js(lower));
  for (const owner of JS_OWNERS) paths.push(js(`${owner}/${lower}`));

  // 같은 자리를 두 번 짚지 않습니다.
  return [...new Set(paths)];
}

/** GitHub 원문 주소로 바꿉니다. */
export function mdnRawUrl(path: string): string {
  return `https://raw.githubusercontent.com/mdn/content/main/${path}`;
}

/** 사람이 볼 MDN 주소로 바꿉니다. */
export function mdnPageUrl(path: string): string {
  const slug = path.replace(/^files\/en-us\//, "").replace(/\/index\.md$/, "");
  return `https://developer.mozilla.org/en-US/docs/${slug
    .split("/")
    .map((part) => part)
    .join("/")}`;
}

/** 한 번 찾을 때 짚어 볼 자리 수 상한 — 요청이 지나치게 늘지 않게 합니다. */
export const MAX_CANDIDATES_PER_TERM = 22;

/** 요청 사이에 쉬는 시간 */
export const LOOKUP_DELAY_MS = 150;
