/**
 * 9단계 연결 판정에 쓰는 낱말 사전.
 *
 * ■ 이 파일 하나만 고치면 연결 판정이 바뀝니다
 *
 * "이 설명자료와 이 실습파일이 같은 주제인가"를 판단하려면
 * 두 자료에서 같은 것을 가리키는 낱말을 찾아야 합니다.
 * 그 낱말 목록을 여기 한곳에 모아 둡니다.
 *
 * ■ 낱말의 무게는 여기서 정하지 않습니다
 *
 * `useState` 는 React 실습파일 대부분에 나오므로 근거로 삼기 약하고,
 * `useDebounce` 는 한두 개에만 나오므로 아주 강한 근거입니다.
 *
 * 그런데 무엇이 흔한지는 **자료를 세어 봐야 압니다.**
 * 그래서 무게는 이 파일에 적지 않고, 실행할 때 실제 자료에서 세어 정합니다.
 * (relator.ts 의 `weighByRarity`)
 *
 * ■ 정규식으로 적는 이유
 *
 * 그냥 문자열로 찾으면 엉뚱한 것이 걸립니다.
 * 예를 들어 `type` 을 문자열로 찾으면 HTML 의 `type="text"` 가 전부 걸려서
 * 실습파일 108개 중 103개에 "TypeScript 낱말이 있다"는 엉터리 결과가 나옵니다.
 * (실제로 측정해 보고 알았습니다)
 */

/** 낱말 하나 */
export interface TechKeyword {
  /** 사람에게 보여줄 이름 */
  label: string;
  /** 본문·코드에서 찾을 때 쓰는 규칙 */
  pattern: RegExp;
}

/**
 * 기술 낱말 목록.
 *
 * 실제 수업자료 342건(설명 234 + 실습 108)에서 한 번이라도 쓰인 것만 남겼습니다.
 * 아무 데서도 안 쓰이는 낱말은 판정에 보탬이 안 되면서 검사 시간만 늘립니다.
 */
export const TECH_KEYWORDS: readonly TechKeyword[] = [
  // ── React ──
  { label: "useState", pattern: /\buseState\b/ },
  { label: "useEffect", pattern: /\buseEffect\b/ },
  { label: "useMemo", pattern: /\buseMemo\b/ },
  { label: "useCallback", pattern: /\buseCallback\b/ },
  { label: "useRef", pattern: /\buseRef\b/ },
  { label: "useContext", pattern: /\buseContext\b/ },
  { label: "useReducer", pattern: /\buseReducer\b/ },
  { label: "createContext", pattern: /\bcreateContext\b/ },
  { label: "React.memo", pattern: /React\.memo\b/ },
  { label: "useNavigate", pattern: /\buseNavigate\b/ },
  { label: "useParams", pattern: /\buseParams\b/ },
  { label: "BrowserRouter", pattern: /\bBrowserRouter\b/ },
  { label: "Routes/Route", pattern: /<Routes?\b/ },
  { label: "NavLink", pattern: /\bNavLink\b/ },
  { label: "useSelector", pattern: /\buseSelector\b/ },
  { label: "useDispatch", pattern: /\buseDispatch\b/ },
  { label: "createSlice", pattern: /\bcreateSlice\b/ },
  { label: "configureStore", pattern: /\bconfigureStore\b/ },
  { label: "Provider", pattern: /<\w*Provider\b/ },
  { label: "props", pattern: /\bprops\b/ },
  { label: "onClick", pattern: /\bonClick\b/ },
  { label: "onChange", pattern: /\bonChange\b/ },
  { label: "onSubmit", pattern: /\bonSubmit\b/ },
  { label: "key 속성", pattern: /\bkey=\{/ },
  { label: "axios", pattern: /\baxios\b/ },
  { label: "swiper", pattern: /\bswiper\b/i },

  // ── JavaScript ──
  { label: "querySelector", pattern: /\bquerySelector(All)?\b/ },
  { label: "getElementById", pattern: /\bgetElementById\b/ },
  { label: "getElementsByClassName", pattern: /\bgetElementsByClassName\b/ },
  { label: "addEventListener", pattern: /\baddEventListener\b/ },
  { label: "classList", pattern: /\bclassList\b/ },
  { label: "createElement", pattern: /\bcreateElement\b/ },
  { label: "appendChild", pattern: /\bappendChild\b/ },
  { label: "innerHTML", pattern: /\binnerHTML\b/ },
  { label: "textContent", pattern: /\btextContent\b/ },
  { label: "dataset", pattern: /\bdataset\b/ },
  { label: "setTimeout", pattern: /\bsetTimeout\b/ },
  { label: "setInterval", pattern: /\bsetInterval\b/ },
  { label: "requestAnimationFrame", pattern: /\brequestAnimationFrame\b/ },
  { label: "localStorage", pattern: /\blocalStorage\b/ },
  { label: "JSON.parse", pattern: /JSON\.parse\b/ },
  { label: "JSON.stringify", pattern: /JSON\.stringify\b/ },
  { label: "fetch", pattern: /\bfetch\s*\(/ },
  { label: "async/await", pattern: /\basync\s+(function|\(|\w+\s*=>)|\bawait\s+/ },
  { label: "Promise", pattern: /\bPromise\b/ },
  { label: "preventDefault", pattern: /\bpreventDefault\b/ },
  { label: "getBoundingClientRect", pattern: /\bgetBoundingClientRect\b/ },
  { label: "IntersectionObserver", pattern: /\bIntersectionObserver\b/ },
  { label: "scrollY/scroll 이벤트", pattern: /\bscrollY\b|\bonscroll\b|"scroll"|'scroll'/ },
  { label: "canvas", pattern: /\bgetContext\s*\(|<canvas\b/ },
  { label: "cookie", pattern: /document\.cookie\b/ },
  { label: "FileReader", pattern: /\bFileReader\b/ },
  { label: "FormData", pattern: /\bFormData\b/ },

  // ── CSS ──
  { label: "display:flex", pattern: /display\s*:\s*flex/ },
  { label: "display:grid", pattern: /display\s*:\s*grid/ },
  { label: "grid-template-columns", pattern: /grid-template-columns/ },
  { label: "grid-template-rows", pattern: /grid-template-rows/ },
  { label: "grid-template-areas", pattern: /grid-template-areas/ },
  { label: "flex-direction", pattern: /flex-direction/ },
  { label: "flex-wrap", pattern: /flex-wrap/ },
  { label: "justify-content", pattern: /justify-content/ },
  { label: "align-items", pattern: /align-items/ },
  { label: "position:absolute", pattern: /position\s*:\s*absolute/ },
  { label: "position:fixed", pattern: /position\s*:\s*fixed/ },
  { label: "position:sticky", pattern: /position\s*:\s*sticky/ },
  { label: "@media", pattern: /@media\b/ },
  { label: "@keyframes", pattern: /@keyframes\b/ },
  { label: "animation", pattern: /\banimation\s*:|animation-name/ },
  { label: "transition", pattern: /\btransition\s*:/ },
  { label: "transform", pattern: /\btransform\s*:/ },
  { label: ":hover", pattern: /:hover\b/ },
  { label: "::before/::after", pattern: /::(before|after)\b/ },
  { label: "CSS 변수", pattern: /var\(--/ },
  { label: "object-fit", pattern: /object-fit/ },
  { label: "aspect-ratio", pattern: /aspect-ratio/ },
  { label: "clamp()", pattern: /\bclamp\s*\(/ },
  { label: "container query", pattern: /@container\b|container-type/ },
  { label: "writing-mode", pattern: /writing-mode/ },
  { label: "논리 속성", pattern: /margin-inline|padding-inline|margin-block|padding-block/ },
  { label: "z-index", pattern: /z-index/ },
  { label: "backdrop-filter", pattern: /backdrop-filter/ },

  // ── TypeScript ──
  { label: "interface", pattern: /\binterface\s+[A-Z]/ },
  { label: "type 별칭", pattern: /\btype\s+[A-Z]\w*\s*=/ },
  { label: "제네릭", pattern: /<T(\s+extends\b|,|>)/ },
  { label: "유니언 타입", pattern: /:\s*("[^"]*"|'[^']*'|\w+)(\s*\|\s*("[^"]*"|'[^']*'|\w+))+/ },
  { label: "Partial<>", pattern: /\bPartial</ },
  { label: "Pick<>", pattern: /\bPick</ },
  { label: "Omit<>", pattern: /\bOmit</ },
  { label: "Record<>", pattern: /\bRecord</ },
  { label: "readonly", pattern: /\breadonly\s+\w/ },
  { label: "namespace", pattern: /\bnamespace\s+\w/ },
  { label: "타입 표기", pattern: /:\s*(string|number|boolean)\b/ },
  { label: "unknown/never", pattern: /:\s*(unknown|never)\b/ },

  // ── jQuery · 애니메이션 라이브러리 ──
  { label: "jQuery", pattern: /\bjquery\b/i },
  { label: "$ 선택자", pattern: /\$\(\s*["'#.]/ },
  { label: "$(document).ready", pattern: /\$\(\s*document\s*\)\s*\.\s*ready|\$\(\s*function/ },
  { label: ".on() 이벤트", pattern: /\.on\s*\(\s*["']/ },
  { label: ".css()", pattern: /\.css\s*\(\s*[{"']/ },
  { label: ".animate()", pattern: /\.animate\s*\(/ },
  { label: ".fadeIn/.fadeOut", pattern: /\.fade(In|Out|To)\s*\(/ },
  { label: ".addClass/.removeClass", pattern: /\.(add|remove|toggle)Class\s*\(/ },
  { label: ".attr()", pattern: /\.attr\s*\(/ },
  { label: "ScrollMagic", pattern: /\bScrollMagic\b/ },
  { label: "GSAP/TweenMax", pattern: /\bTweenMax\b|\bgsap\b/i },
  { label: "fullPage.js", pattern: /\bfullpage\b/i },
  { label: "wow.js", pattern: /\bwow(\.js|\.min)\b|new\s+WOW\b/i },

  // ── 낡았을 수 있는 기법 (14단계) ──
  //
  // 여기 있다고 "낡았다"는 뜻이 아닙니다. **공식 문서에 물어볼 대상**일 뿐입니다.
  // 판정은 MDN 이 front matter 에 적어 둔 `status:` 가 합니다.
  // 실제로 이 목록을 넣고 확인해 보니 document.write·substr·keyCode·clip 이 deprecated 였고,
  // zoom 은 아무 표시가 없어 그대로 두었습니다.
  { label: "document.write", pattern: /document\.write\s*\(/ },
  { label: "substr", pattern: /\.substr\s*\(/ },
  { label: "keyCode", pattern: /\.keyCode\b/ },
  { label: "clip", pattern: /\bclip\s*:\s*rect/ },
  { label: "zoom", pattern: /\bzoom\s*:\s*[\d.]/ },
  { label: "execCommand", pattern: /execCommand\s*\(/ },
  { label: "escape", pattern: /[^.\w]escape\s*\(/ },
  { label: "unescape", pattern: /unescape\s*\(/ },
  { label: "getYear", pattern: /\.getYear\s*\(/ },
  { label: "attachEvent", pattern: /attachEvent\s*\(/ },

  // ── HTML ──
  { label: "시맨틱 태그", pattern: /<(section|article|aside|figure)\b/ },
  { label: "header/footer/nav", pattern: /<(header|footer|nav)\b/ },
  { label: "form/input", pattern: /<(form|input|label|select|textarea)\b/ },
  { label: "table", pattern: /<table\b/ },
  { label: "video/audio", pattern: /<(video|audio)\b/ },
  { label: "iframe", pattern: /<iframe\b/ },
  { label: "datalist", pattern: /<datalist\b/ },
  { label: "dialog", pattern: /<dialog\b/ },
  { label: "접근성(aria/role)", pattern: /\baria-\w+|\brole\s*=/ },
  { label: "대체 텍스트(alt)", pattern: /\balt\s*=\s*["']/ },
];

/**
 * 제목에서 걸러낼 낱말.
 *
 * 실제 자료를 세어 보고 정했습니다. `base` 는 실습파일 46개, `final` 은 29개 제목에 들어 있어서
 * 이런 낱말이 겹쳤다고 연결하면 같은 과목 자료가 전부 서로 연결되어 버립니다.
 */
export const TITLE_STOPWORDS: ReadonlySet<string> = new Set([
  // 실습파일 이름 관례
  "base", "final", "basic", "ex", "example", "examples", "sample", "samples",
  "mission", "project", "start", "starter", "begin", "end", "test", "demo",
  "src", "dist", "main", "app", "index", "code", "source", "file", "files",
  "new", "old", "copy", "완성", "예제", "실습", "기초", "시작", "자료", "파일",
  // 버전 표기
  "v", "ver", "version", "rv", "f", "the", "with", "and", "for", "my", "a", "an", "of",
  "zip", "pdf", "md", "html", "css", "js", "jsx", "ts", "tsx",
]);

/**
 * 한글 용어 → 영어 낱말.
 *
 * ■ 왜 필요한가
 *
 * 설명자료 제목은 한글인데 실습파일 안의 폴더·파일 이름은 영어입니다.
 * TypeScript 강의가 딱 그렇습니다. 두 목록이 1:1 로 대응하는데도 글자가 달라 못 잇습니다.
 *
 *   05. 유니언 타입과 타입 가드   ↔   05-union-type/union.ts
 *   06. 제네릭(Generic)          ↔   06-generic/generic.ts
 *   08. 모듈과 네임스페이스        ↔   08-module/namespace.ts
 *
 * 그래서 한글 낱말을 영어 낱말로도 함께 세어 줍니다.
 *
 * ■ 아무 말이나 넣지 않습니다
 *
 * 여기 넣은 낱말은 연결의 근거가 됩니다.
 * "만들기", "기초" 같은 흔한 말을 넣으면 오히려 엉뚱한 연결이 늘어납니다.
 * **실습파일의 폴더·파일 이름으로 실제로 쓰일 만한 기술 용어만** 넣습니다.
 *
 * ■ 한 낱말이 여러 영어 낱말을 뜻할 때
 *
 * 공백으로 나눠 적으면 전부 담습니다.
 *
 *   멀티미디어: "media audio video"   →  audio_video_base/ 폴더와 이어집니다
 *
 * 실제로 "8. HTML5 멀티미디어 활용하기" 가 `A/audio_video_base/` 를 못 찾고 있었습니다.
 */
export const KOREAN_TERM_ALIASES: Readonly<Record<string, string>> = {
  // 타입 시스템
  유니언: "union",
  인터페이스: "interface",
  제네릭: "generic",
  네임스페이스: "namespace",
  유틸리티: "utility",
  열거형: "enum",
  // 언어 기본
  함수: "function",
  클래스: "class",
  모듈: "module",
  객체: "object",
  배열: "array",
  문자열: "string",
  변수: "variable",
  상수: "constant",
  반복문: "loop",
  조건문: "condition",
  // 웹·DOM
  멀티미디어: "media audio video",
  하이퍼링크: "anchor link",
  이벤트: "event",
  애니메이션: "animation",
  쿠키: "cookie",
  캔버스: "canvas",
  슬라이드: "slide",
  슬라이더: "slider",
  갤러리: "gallery",
  탭: "tab",
  아코디언: "accordion",
  모달: "modal",
  드롭다운: "dropdown",
  캐러셀: "carousel",
  네비게이션: "navigation",
  스크롤: "scroll",
  // 레이아웃
  그리드: "grid",
  플렉스: "flex",
  레이아웃: "layout",
  반응형: "responsive",
  // 기능·화면
  게시판: "board",
  로그인: "login",
  회원가입: "signup",
  장바구니: "cart",
  검색: "search",
  정렬: "sort",
  필터: "filter",
  지도: "map",
  달력: "calendar",
  차트: "chart",
  포트폴리오: "portfolio",
  // React 계열
  라우터: "router",
  라우팅: "routing",
  훅: "hook",
  리덕스: "redux",
  컨텍스트: "context",
  상태: "state",
  라이프사이클: "lifecycle",
  // 그 밖
  타이머: "timer",
  업로드: "upload",
  드래그: "drag",
  스켈레톤: "skeleton",
};

/** 여러 실습파일에 공통으로 들어 있어 근거가 되지 못하는 파일 이름 */
export const COMMON_SOURCE_NAMES: ReadonlySet<string> = new Set([
  "index.html", "style.css", "main.css", "index.css", "app.css", "reset.css",
  "normalize.css", "default.css", "common.css", "script.js", "main.js", "app.js",
  "app.jsx", "main.jsx", "index.js", "index.jsx", "readme.md", "license.txt",
  "package.json", "package-lock.json", "vite.config.js", "vite.config.ts",
  ".oxlintrc.json", "eslint.config.js", "tsconfig.json", ".gitignore",
]);

/**
 * 설정·문서 파일. 실습 코드로 보여줄 가치가 낮습니다.
 *
 * 완전히 빼지는 않고 순위만 뒤로 밀어, 다른 후보가 없을 때만 나오게 합니다.
 */
export const LOW_VALUE_SOURCE_NAMES: ReadonlySet<string> = new Set([
  "package.json", "package-lock.json", "vite.config.js", "vite.config.ts",
  ".oxlintrc.json", "eslint.config.js", "tsconfig.json", "readme.md",
  "license.txt", ".gitignore", "normalize.css", "reset.css",
]);

/**
 * 실습파일 제목이 "나는 이 주제다"라고 선언하는 낱말.
 *
 * ■ 어디에 쓰는가
 *
 * 10단계에서 medium 연결을 학습자료에 넣을지 말지 가릴 때 씁니다.
 *
 *   01_CSS GRID 핵심  ↔  flexbox_base_202604_f.zip
 *
 * 이 짝은 9단계에서 medium 이 나왔습니다. 그 zip 안에 `05_image-grid-BASE/` 폴더가
 * 실제로 있어서 근거 자체는 사실입니다. 하지만 **zip 이 스스로 flexbox 라고 말하고 있고**
 * 설명자료는 grid 를 다룹니다. 주제가 어긋납니다.
 *
 * 그래서 zip 제목이 내건 주제가 설명자료 제목에 하나도 없으면 학습자료에서 뺍니다.
 *
 * ■ 무엇을 넣는가
 *
 * **기술·UI 패턴 이름만** 넣습니다.
 * `todo`, `portfolio`, `shop` 같은 "만드는 물건"의 이름은 넣지 않습니다.
 * 그것은 주제 선언이 아니라 예제의 소재일 뿐이라, 넣으면 멀쩡한 연결이 끊깁니다.
 * (실제로 "개발환경 세팅(Vite + React) ↔ react_vite_todo" 가 끊기는 것을 확인했습니다)
 */
export const LESSON_TOPIC_TERMS: ReadonlySet<string> = new Set([
  // 레이아웃
  "grid", "flexbox", "flex", "container", "layout", "logical", "masonry", "positioning",
  // 움직임
  "animation", "animations", "transition", "transform", "keyframes", "parallax", "scroll",
  // UI 패턴
  "slide", "slideshow", "slider", "swiper", "carousel", "gallery", "accordion", "tab",
  "modal", "dropdown", "tooltip", "navigation", "pagination", "marquee", "skeleton",
  "hover", "sprite", "sprites", "typography",
  // React 계열
  "hook", "hooks", "router", "routing", "redux", "context", "lifecycle",
  // 그 밖의 기술
  "ajax", "chart", "cookie", "sass", "less", "canvas", "svg", "drag", "storage",
]);

/** 실습파일 안에서 흔한 폴더 이름 (경로 낱말 근거에서 제외) */
export const COMMON_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  "src", "css", "js", "img", "images", "image", "assets", "public", "dist",
  "components", "component", "pages", "page", "styles", "style", "scripts",
  "fonts", "font", "data", "lib", "utils", "a", "b", "c", "d", "e",
]);
