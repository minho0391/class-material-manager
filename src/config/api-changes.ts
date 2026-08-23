/**
 * "예전 방식 → 현재 방식" 대응표.
 *
 * ■ 여기 적는 것의 조건
 *
 * **공식 문서가 직접 그렇게 말한 것만** 적습니다.
 * 항목마다 `officialUrl` 이 반드시 있어야 하고, 그 주소를 열면
 * 사람이 바로 확인할 수 있어야 합니다.
 *
 * "요즘은 이렇게 안 쓴다더라" 같은 것은 적지 않습니다.
 * 그런 것을 적으면 이 표가 근거가 아니라 의견이 됩니다.
 *
 * ■ 이 표가 언제 쓰이는가
 *
 * 수업 실습 코드에 `oldPattern` 이 **실제로 들어 있을 때만** 씁니다.
 * 코드에 없으면 아무 말도 하지 않습니다. 버전 숫자만 보고 판정하지 않습니다.
 *
 * ■ 왜 대부분 안 걸리는가
 *
 * 이 수업은 2026년에 React 19 로 진행됐습니다. 실제로 코드를 훑어보니
 * `ReactDOM.render`·클래스 컴포넌트·`Switch`·`useHistory`·`makeStyles` 가 **하나도 없었습니다.**
 * 이미 현재 방식으로 가르쳤다는 뜻입니다.
 *
 * 그래도 표를 두는 이유는, 나중에 옛 자료가 섞여 들어오면 그때 잡히기 때문입니다.
 */

/** 예전 방식 하나 */
export interface ApiChange {
  /** 어느 기술인지 (화면 표시용) */
  technology: string;
  /** 어느 과목의 코드에서 찾을지. 비우면 과목을 가리지 않습니다 */
  subject?: string;

  /** 사람이 읽을 예전 방식 */
  oldPattern: string;
  /** 코드에서 예전 방식을 찾는 규칙 */
  detect: RegExp;

  /** 사람이 읽을 현재 방식 */
  currentPattern: string;
  /**
   * 코드가 이미 현재 방식도 쓰고 있는지 확인하는 규칙.
   * 둘 다 있으면 옮기는 중일 수 있어 판단을 미룹니다.
   */
  currentDetect?: RegExp;

  /** 어떤 변화인지 */
  kind: "removed" | "deprecated" | "recommended";
  /** 공식 문서가 뭐라고 했는지 (그대로 옮겨 적습니다) */
  officialSays: string;
  /** 확인하러 갈 주소 — 반드시 있어야 합니다 */
  officialUrl: string;
}

/**
 * 대응표.
 *
 * 각 항목의 `officialSays` 는 해당 공식 문서에서 그대로 옮긴 문장입니다.
 */
export const API_CHANGES: readonly ApiChange[] = [
  // ── React ──
  {
    technology: "React",
    subject: "react",
    oldPattern: "ReactDOM.render(<App />, container)",
    detect: /ReactDOM\s*\.\s*render\s*\(/,
    currentPattern: "createRoot(container).render(<App />)",
    currentDetect: /createRoot\s*\(/,
    kind: "removed",
    officialSays:
      "React 18 에서 `ReactDOM.render` 는 더 이상 쓰지 않도록 바뀌었고, React 19 에서 제거되었습니다. `createRoot` 를 씁니다.",
    officialUrl: "https://react.dev/reference/react-dom/client/createRoot",
  },
  {
    technology: "React",
    subject: "react",
    oldPattern: "ReactDOM.hydrate(...)",
    detect: /ReactDOM\s*\.\s*hydrate\s*\(/,
    currentPattern: "hydrateRoot(container, <App />)",
    currentDetect: /hydrateRoot\s*\(/,
    kind: "removed",
    officialSays: "React 19 에서 `ReactDOM.hydrate` 가 제거되었습니다. `hydrateRoot` 를 씁니다.",
    officialUrl: "https://react.dev/reference/react-dom/client/hydrateRoot",
  },
  {
    technology: "React",
    subject: "react",
    oldPattern: "class Xxx extends React.Component",
    detect: /class\s+\w+\s+extends\s+(React\.)?(Component|PureComponent)\b/,
    currentPattern: "function Xxx() { … }  (함수 컴포넌트)",
    kind: "recommended",
    officialSays:
      "공식 문서가 컴포넌트를 클래스가 아니라 함수로 정의할 것을 권합니다. (\"We recommend defining components as functions instead of classes.\")",
    officialUrl: "https://react.dev/reference/react/Component",
  },

  // ── React Router ──
  {
    technology: "React Router",
    subject: "react",
    oldPattern: "<Switch>",
    detect: /<Switch[\s>]/,
    currentPattern: "<Routes>",
    currentDetect: /<Routes[\s>]/,
    kind: "removed",
    officialSays: "v6 에서 `Switch` 가 `Routes` 로 바뀌었습니다.",
    officialUrl: "https://reactrouter.com/upgrading/v5",
  },
  {
    technology: "React Router",
    subject: "react",
    oldPattern: "useHistory()",
    detect: /useHistory\s*\(/,
    currentPattern: "useNavigate()",
    currentDetect: /useNavigate\s*\(/,
    kind: "removed",
    officialSays: "v6 에서 `useHistory` 가 `useNavigate` 로 바뀌었습니다.",
    officialUrl: "https://reactrouter.com/upgrading/v5",
  },

  // ── MUI ──
  {
    technology: "MUI",
    oldPattern: "makeStyles / @mui/styles",
    detect: /@mui\/styles|makeStyles\s*\(/,
    currentPattern: "styled() 또는 sx prop",
    kind: "deprecated",
    officialSays: "`@mui/styles` 는 더 이상 쓰지 않습니다. `styled()` 나 `sx` prop 을 씁니다.",
    officialUrl: "https://mui.com/system/styled/",
  },
];

/**
 * 변화 유형.
 *
 * 13단계의 상태(그대로/사용중단/버전차이…)와는 다른 축입니다.
 * 상태가 "어떻게 되었나"라면, 이쪽은 **"내 코드를 고쳐야 하나"** 에 답합니다.
 */
export const CHANGE_TYPE = {
  /** 달라진 것이 확인되지 않았습니다 */
  NONE: "NONE",
  /** 버전은 다른데, 사용법이 달라졌다는 근거는 찾지 못했습니다 */
  VERSION_ONLY: "VERSION_ONLY",
  /** 공식 문서가 다른 방식을 권합니다. 예전 방식도 아직 돌아갑니다 */
  RECOMMENDED_CHANGED: "RECOMMENDED_CHANGED",
  /** 이름·호출 방식·설정 방식이 실제로 달라졌습니다 */
  API_CHANGED: "API_CHANGED",
  /** 공식 문서가 사용 중단을 밝혔습니다 */
  DEPRECATED: "DEPRECATED",
  /** 공식 문서가 제거되었다고 밝혔습니다 */
  REMOVED: "REMOVED",
  /** 근거가 모자라거나 서로 어긋납니다 */
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
} as const;

export type ChangeType = (typeof CHANGE_TYPE)[keyof typeof CHANGE_TYPE];

/**
 * 중요도 — 무엇부터 봐야 하는지.
 *
 * | | 뜻 | 언제 |
 * |---|---|---|
 * | `NONE` | 볼 것 없음 | 그대로 쓸 수 있음 |
 * | `LOW` | 알아만 두기 | 버전은 다른데 사용법 변화 근거 없음 |
 * | `MEDIUM` | 살펴보기 | 권장 방식이 바뀜 |
 * | `HIGH` | 고쳐야 함 | 사용 중단·제거 — 안 돌아갈 수 있음 |
 */
export const SEVERITY = {
  NONE: "NONE",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;

export type Severity = (typeof SEVERITY)[keyof typeof SEVERITY];

/** 변화 유형에서 중요도를 정합니다. 한 곳에서만 정해 화면과 보고가 어긋나지 않게 합니다. */
export function severityOf(changeType: ChangeType): Severity {
  switch (changeType) {
    case CHANGE_TYPE.REMOVED:
    case CHANGE_TYPE.DEPRECATED:
      return SEVERITY.HIGH;
    case CHANGE_TYPE.API_CHANGED:
    case CHANGE_TYPE.RECOMMENDED_CHANGED:
      return SEVERITY.MEDIUM;
    case CHANGE_TYPE.VERSION_ONLY:
    case CHANGE_TYPE.REVIEW_REQUIRED:
      return SEVERITY.LOW;
    default:
      return SEVERITY.NONE;
  }
}
