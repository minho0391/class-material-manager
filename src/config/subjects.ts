/**
 * 과목 분류 규칙 — 이 파일 하나만 고치면 분류가 바뀝니다.
 *
 * ■ 어떤 순서로 판단하는가
 *
 *   1순위  제목에 고유 기술명이 있으면 무조건 그 과목      (섹션보다 우선)
 *   2순위  섹션 → 과목 직접 매핑                          (강사님이 이미 나눠 둔 것)
 *   3순위  섹션이 모호하면 제목 낱말로 판단
 *   4순위  그래도 못 정하면 _unclassified 로 격리
 *
 * ■ 왜 1순위가 섹션보다 위인가
 *
 * 실제 자료를 확인해 보니 Supabase 자료 2건이 "React Basic Mission 7" 섹션에 있었습니다.
 * 섹션만 따르면 react 로 가버립니다.
 * 그래서 **고유 기술명이 제목에 분명히 있으면 그것을 먼저** 봅니다.
 *
 * ■ 왜 섹션을 그다음으로 믿는가
 *
 * 기준 문서의 섹션 제목이 이미 `React`, `Next.js`, `TypeScript`, `CSS GRID` 처럼
 * 기술 이름 그 자체입니다. 강사님이 손수 나눠 둔 것이라 어떤 자동 판정보다 정확합니다.
 */

/** 분류 결과로 나올 수 있는 폴더 경로 */
export const SUBJECTS = {
  html: "html",
  css: "css",
  javascript: "javascript",
  jquery: "javascript/jquery",
  react: "react",
  typescript: "typescript",
  nextjs: "nextjs",
  supabase: "supabase",
  mui: "mui",
  design: "others/design",
  git: "others/git",
  ai: "others/ai",
  deploy: "others/deploy",
  /** 수업 운영 자료 — 강사 소개, 시간표, 과제 제출 안내처럼 기술과 무관한 것들 */
  classInfo: "others/class-info",
  /** 기획·설계 자료 — IA, ERD, 스토리보드, 레퍼런스 조사 */
  planning: "others/planning",
  /** 개발 도구 설정 */
  tools: "others/tools",
  etc: "others/etc",
  unclassified: "_unclassified",
} as const;

/**
 * 1순위 — 제목에 이 낱말이 있으면 섹션을 무시하고 이 과목으로 보냅니다.
 *
 * 다른 기술과 헷갈릴 일이 없는 **고유한 이름**만 넣습니다.
 * 예를 들어 "react" 는 여기 넣지 않습니다. React 섹션이 이미 잘 작동하고,
 * "react-router" 같은 이름이 다른 과목 자료에도 나올 수 있기 때문입니다.
 */
export const PRIORITY_KEYWORDS: ReadonlyArray<{
  pattern: RegExp;
  subject: string;
  label: string;
}> = [
  { pattern: /supabase/i, subject: SUBJECTS.supabase, label: "Supabase" },
  { pattern: /\bmui\b|material[-\s]?ui/i, subject: SUBJECTS.mui, label: "MUI" },
];

/**
 * 2순위 — 섹션 이름 → 과목.
 *
 * 기준 문서에서 실제로 발견된 28개 섹션을 전부 적어 둡니다.
 * 여기 없는 섹션이 새로 생기면 3순위(제목 낱말)로 넘어갑니다.
 */
export const SECTION_MAP: Readonly<Record<string, string>> = {
  // ── React ──
  React: SUBJECTS.react,
  "React Basic Mission 7": SUBJECTS.react,

  // ── Next.js ──
  "Next.js": SUBJECTS.nextjs,

  // ── TypeScript ──
  TypeScript: SUBJECTS.typescript,

  // ── JavaScript ──
  Javascript: SUBJECTS.javascript,
  "Chart JS": SUBJECTS.javascript,
  API: SUBJECTS.javascript, // Weather API, 기상청 날씨, MAP - API → fetch/AJAX
  webpack: SUBJECTS.javascript, // 실제 내용은 module·class 등 JS 문법

  // ── jQuery (JavaScript 하위) ──
  jQuery: SUBJECTS.jquery,
  "jQuery Libraries for Scroll Events": SUBJECTS.jquery,
  "Essential jQuery Libraries": SUBJECTS.jquery,

  // ── CSS ──
  "CSS GRID": SUBJECTS.css,
  "FLEXBOX FLEX 핵심정리": SUBJECTS.css,
  "Essential CSS Libraries": SUBJECTS.css,
  "SVG Animation": SUBJECTS.css,
  rec_imgs: SUBJECTS.css, // 전부 CSS Grid 설명 이미지였습니다

  // ── HTML ──
  웹접근성: SUBJECTS.html, // 시맨틱 마크업 영역

  // ── 기술 학습자료가 아닌 것들 ──
  "UI 디자인": SUBJECTS.design,
  "디자인 참조 코딩하기": SUBJECTS.design,
  "GIT 기본 용어, CLI, GUI": SUBJECTS.git,
  "AI 활용하기": SUBJECTS.ai,
  배포: SUBJECTS.deploy,
  수업영상: SUBJECTS.etc,
  TEMP: SUBJECTS.etc,
};

/**
 * HTML 과 CSS 가 한 섹션에 섞여 있어 제목으로 더 나눠야 하는 섹션들.
 *
 * 강사님이 두 가지를 함께 가르치셔서 한 섹션에 담겨 있습니다.
 * 요구사항은 html 과 css 를 따로 두는 것이므로 제목을 보고 나눕니다.
 */
export const SPLIT_HTML_CSS_SECTIONS: ReadonlySet<string> = new Set([
  "HTML & CSS",
  "HTML5 & CSS3 & Layout",
]);

/**
 * 주제를 알 수 없는 섹션.
 *
 * 문서 맨 앞의 "바로가기"와 "목 차"는 여러 과목의 링크를 모아 둔 곳이라
 * 섹션 이름만으로는 과목을 알 수 없습니다. 제목 낱말로 판단합니다.
 */
export const AMBIGUOUS_SECTIONS: ReadonlySet<string> = new Set(["바로가기", "목 차"]);

/**
 * HTML 쪽으로 볼 낱말.
 *
 * `연결 순서`·`특수문자` 는 실제 자료를 보고 넣었습니다.
 *   · "웹페이지 연결 순서" — 브라우저가 문서를 읽어 들이는 순서
 *   · "특수문자 이름" — HTML 엔티티(&nbsp; 등)
 */
export const HTML_WORDS =
  /html|시맨틱|semantic|마크업|markup|태그\b|tag\b|하이퍼링크|멀티미디어|폼\s*양식|form\b|접근성|웹표준|연결\s*순서|로딩\s*순서|렌더링|특수문자|엔티티|entity|이미지\s*맵|image\s*map|youtube/i;
// `youtube` 만 넣고 `video` 는 넣지 않았습니다.
// video 를 넣으면 `responsive_video_base.zip` 이 CSS 낱말(responsive)과 함께 걸려
// css → html 로 옮겨가 버립니다. 그 자료는 반응형 실습이므로 css 가 맞습니다.

/**
 * CSS 쪽으로 볼 낱말.
 *
 * 뒤쪽의 `button`·`card`·`link`·`효과` 는 실습 파일 이름을 보고 넣었습니다.
 * 강사님이 만드신 CSS 실습 파일이 `03_engaging buttons_base.zip`,
 * `02_Make Ordinary Links Interesting_ex.zip`, `rotate_card.zip` 처럼
 * 정작 "css" 라는 낱말 없이 **무엇을 꾸미는지**로 이름 붙여져 있기 때문입니다.
 */
export const CSS_WORDS =
  /css|flex|grid|레이아웃|layout|반응형|responsive|media\s*quer|sass|scss|less\b|animation|애니메이션|transition|hover|스프라이트|sprite|container\s*quer|logical\s*propert|박스|box|positioning|텍스트\s*효과|button|버튼|card|카드|\blinks?\b|rotate|회전|효과|effect|slideshow|스타일/i;

/**
 * 3순위 — 제목 낱말로 과목 정하기.
 *
 * "바로가기"·"목 차"처럼 주제를 알 수 없는 섹션의 자료에만 씁니다.
 * **위에서부터 순서대로** 검사하므로, 더 구체적인 것을 먼저 적어야 합니다.
 * (예: jQuery 를 javascript 보다 먼저 — "jQuery"에도 "j"가 들어가기 때문이 아니라,
 *  jQuery 자료를 javascript 로 뭉뚱그리지 않기 위해서입니다)
 */
export const TITLE_KEYWORDS: ReadonlyArray<{ pattern: RegExp; subject: string; label: string }> = [
  // ── 기술 자료가 아닌 것들을 먼저 걸러냅니다 ──
  // 이것들을 뒤에 두면 "포트폴리오 발표"가 '디자인' 낱말에 걸려
  // others/design 으로 잘못 가는 문제가 생깁니다. (실제로 겪은 오분류입니다)
  {
    pattern:
      /강사\s*소개|클래스룸|시간표|임시화면|수료|출결|과제\s*제출|주요\s*핵심\s*요약|\bKDT\b|포트폴리오\s*발표|portfolio\s*url|수업영상|\bTEMP\b/i,
    subject: SUBJECTS.classInfo,
    label: "수업 운영",
  },
  {
    pattern:
      /스토리보드|storyboard|information\s*architecture|\bERD\b|레퍼런스|기획|간트|gantt|user\s*flow|\bDFD\b|홈페이지\s*개설/i,
    subject: SUBJECTS.planning,
    label: "기획·설계",
  },
  { pattern: /vs\s?code|비주얼\s*스튜디오/i, subject: SUBJECTS.tools, label: "개발 도구" },

  // ── 기술 과목 ──
  { pattern: /jquery/i, subject: SUBJECTS.jquery, label: "jQuery" },
  { pattern: /next\.?js|\bssr\b/i, subject: SUBJECTS.nextjs, label: "Next.js" },
  { pattern: /typescript|\bts\b/i, subject: SUBJECTS.typescript, label: "TypeScript" },
  { pattern: /react|jsx|hook|usestate/i, subject: SUBJECTS.react, label: "React" },
  { pattern: /javascript|\bjs\b|ajax|\bdom\b|비동기/i, subject: SUBJECTS.javascript, label: "JavaScript" },
  { pattern: /flex|grid|\bcss\b|sass|scss/i, subject: SUBJECTS.css, label: "CSS" },
  { pattern: /\bhtml\b|시맨틱|마크업|특수문자|엔티티/i, subject: SUBJECTS.html, label: "HTML" },
  // '포트폴리오'는 위 수업 운영에서 이미 걸러지므로 여기서는 뺐습니다.
  { pattern: /figma|디자인|design/i, subject: SUBJECTS.design, label: "디자인" },
  { pattern: /\bgit\b|github/i, subject: SUBJECTS.git, label: "GIT" },
];

/**
 * 자료가 없어도 폴더를 만들지 여부.
 *
 * MUI 는 수업자료에서 한 건도 찾지 못했습니다.
 * 빈 폴더를 만들지 않고, 6단계에서 공식 문서 요약을 받을 때 생성합니다.
 */
export const CREATE_EMPTY_SUBJECT_FOLDERS = false;
