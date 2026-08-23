/**
 * 자료 안에 **바깥에 내보내면 위험한 문자열**이 있는지 살펴보는 자리.
 *
 * ■ 왜 필요한가
 *
 * 16단계에서 강사님 수업자료 안에 GitHub 토큰처럼 생긴 문자열이 있는 것을 발견했습니다.
 * 지금은 `data/` 가 git 추적 대상이 아니라 새어 나가지 않지만,
 * 앞으로 다른 자료를 넣어 쓸 수도 있고, 언젠가 자료를 옮길 수도 있습니다.
 *
 * 그때 "괜찮겠지" 하고 넘기지 않도록 **미리 훑어보는 눈**을 하나 둡니다.
 *
 * ■ 지키는 것 셋
 *
 *   1. **값을 보여주지 않습니다.** 어디에 있는지만 알려 줍니다.
 *      찾아낸 비밀을 화면과 로그에 다시 뿌리면, 막으려던 것을 우리가 하는 셈입니다.
 *
 *   2. **"유출 확정" 이라고 말하지 않습니다.** 규칙으로 찾는 일에는 오탐이 따릅니다.
 *      `ghp_example_not_a_real_token` 같은 예시 문자열도 모양은 똑같습니다.
 *      그래서 "의심" 이라고만 말하고, 판단은 사람에게 맡깁니다.
 *
 *   3. **아무것도 고치지 않습니다.** 원본 수업자료를 자동으로 지우거나 바꾸지 않습니다.
 *      강사님 자료를 우리가 임의로 손대는 것은 다른 종류의 사고입니다.
 */

/** 무엇처럼 보이는가 */
export interface SecretPattern {
  id: string;
  /** 사람에게 보여줄 이름 */
  label: string;
  pattern: RegExp;
  /** 얼마나 확실한가 — 확실한 것부터 보여 줍니다 */
  confidence: "high" | "medium";
}

/**
 * 찾아볼 것들.
 *
 * **확실한 것만 넣습니다.** "password" 라는 낱말이 들어갔다고 다 잡으면
 * 수업자료가 온통 경고투성이가 되고, 그러면 아무도 보지 않게 됩니다.
 * (14·15단계에서 배운 것과 같습니다 — 과한 경고는 경고가 아닙니다)
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  {
    id: "github-token",
    label: "GitHub 토큰",
    // ghp_·gho_·ghu_·ghs_·ghr_ + 영숫자 36자. 밑줄이 없어야 진짜 모양입니다.
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g,
    confidence: "high",
  },
  {
    id: "github-pat",
    label: "GitHub 세밀 권한 토큰",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g,
    confidence: "high",
  },
  {
    id: "aws-access-key",
    label: "AWS 액세스 키",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    confidence: "high",
  },
  {
    id: "openai-key",
    label: "OpenAI API 키",
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/g,
    confidence: "high",
  },
  {
    id: "anthropic-key",
    label: "Anthropic API 키",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    confidence: "high",
  },
  {
    id: "slack-token",
    label: "Slack 토큰",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    confidence: "high",
  },
  {
    id: "google-api-key",
    label: "Google API 키",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    confidence: "high",
  },
  {
    id: "private-key",
    label: "개인 키 블록",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    confidence: "high",
  },
  {
    id: "google-oauth-secret",
    label: "Google OAuth 클라이언트 비밀",
    pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g,
    confidence: "high",
  },
  {
    id: "credential-assignment",
    label: "자격증명처럼 보이는 대입문",
    // api_key = "……" 처럼 **값이 실제로 채워진** 경우만 봅니다.
    // 빈 값(`GITHUB_TOKEN=`)은 `.env.example` 의 정상 모습이라 잡지 않습니다.
    pattern:
      /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key|password|passwd)\b\s*[:=]\s*["'][^"'\s]{12,}["']/gi,
    confidence: "medium",
  },
];

/**
 * 이 표시가 든 줄은 건너뜁니다.
 *
 * ■ 왜 이런 것이 필요한가
 *
 * 이 검사기 자신을 시험하려면 **진짜처럼 생긴 가짜 값**이 있어야 합니다.
 * 그런데 진짜처럼 생겼으니 검사기가 그것을 잡습니다. 당연한 일입니다.
 *
 * 그렇다고 규칙을 느슨하게 만들면 진짜도 놓칩니다.
 * 그래서 규칙은 그대로 두고, **"이건 일부러 넣은 가짜다" 라고 사람이 적어 둔 줄**만
 * 건너뜁니다. 흔한 도구들이 쓰는 방식입니다.
 *
 * ■ 숨기는 데 쓰이지 않게
 *
 * 건너뛴 줄이 **몇 개인지 반드시 세어서 알립니다.**
 * 조용히 넘어가면 이 표시가 진짜를 감추는 데 쓰일 수 있습니다.
 */
export const ALLOW_MARKER = "cmm-allow-secret";

/** 찾아낸 것 하나 */
export interface SecretFinding {
  /** 어느 파일에서 */
  file: string;
  /** 몇 번째 줄에서 */
  line: number;
  patternId: string;
  label: string;
  confidence: "high" | "medium";
  /**
   * 값을 알아볼 수 있게 가린 형태 — `ghp_****…****`.
   *
   * **원래 값은 어디에도 담지 않습니다.** 이 칸에 담기는 것은
   * 앞 네 글자와 길이뿐입니다. 그것만으로도 사람이 "아, 그거" 하고 알아봅니다.
   */
  masked: string;
}

/**
 * 값을 가립니다.
 *
 * 앞 4글자만 남기고 나머지는 길이만 알립니다.
 * 앞 4글자는 `ghp_`·`AKIA` 같은 종류 표시라 그 자체로는 비밀이 아닙니다.
 */
export function mask(value: string): string {
  const head = value.slice(0, 4);
  const hidden = Math.max(0, value.length - 4);
  return `${head}${"*".repeat(Math.min(hidden, 8))}${hidden > 8 ? `…(${hidden}자 숨김)` : ""}`;
}

/**
 * 글 한 덩어리를 훑습니다.
 *
 * @param text 살펴볼 글
 * @param file 어느 파일인지 (결과에 적을 이름)
 */
export function scanText(text: string, file: string): SecretFinding[] {
  return scanTextDetailed(text, file).findings;
}

/** 훑은 결과 — 건너뛴 줄 수까지 함께 */
export interface ScanResult {
  findings: SecretFinding[];
  /** 사람이 "일부러 넣은 가짜" 라고 표시해 건너뛴 줄 수 */
  allowlisted: number;
}

/** 글 한 덩어리를 훑고, 건너뛴 줄 수도 함께 돌려줍니다. */
export function scanTextDetailed(text: string, file: string): ScanResult {
  const findings: SecretFinding[] = [];
  const lines = text.split(NEWLINE);

  const allowed = new Set<number>();
  for (let index = 0; index < lines.length; index++) {
    if (lines[index]?.includes(ALLOW_MARKER)) allowed.add(index);
  }

  for (const pattern of SECRET_PATTERNS) {
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line) continue;
      if (allowed.has(index)) continue;

      // 정규식이 `g` 라 이전 자리를 기억합니다. 줄마다 처음부터 봅니다.
      pattern.pattern.lastIndex = 0;

      for (const match of line.matchAll(pattern.pattern)) {
        findings.push({
          file,
          line: index + 1,
          patternId: pattern.id,
          label: pattern.label,
          confidence: pattern.confidence,
          masked: mask(match[0]),
        });
      }
    }
  }

  return { findings, allowlisted: allowed.size };
}

const NEWLINE = String.fromCodePoint(10);

/**
 * 찾아낸 것들을 한 줄 요약으로.
 *
 * **여기서도 값을 내보내지 않습니다.**
 */
export function summarize(findings: SecretFinding[]): {
  total: number;
  high: number;
  medium: number;
  byLabel: Array<{ label: string; count: number }>;
} {
  const byLabel = new Map<string, number>();
  for (const finding of findings) {
    byLabel.set(finding.label, (byLabel.get(finding.label) ?? 0) + 1);
  }

  return {
    total: findings.length,
    high: findings.filter((finding) => finding.confidence === "high").length,
    medium: findings.filter((finding) => finding.confidence === "medium").length,
    byLabel: [...byLabel.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}
