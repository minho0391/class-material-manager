/**
 * Google 계정 인증 — 비공개 수업자료를 읽기 위한 열쇠를 관리합니다.
 *
 * ■ 전체 흐름
 *
 *   1. credentials.json  ← Google Cloud Console 에서 받은 "이 프로그램의 신분증"
 *   2. 브라우저가 열림   ← 회원님이 "읽어도 좋다"고 직접 동의
 *   3. data/token.json   ← 동의 결과로 받은 열쇠(refresh token)를 저장
 *   4. 이후 실행         ← 브라우저 없이 token.json 만으로 바로 사용
 *
 * ■ 비밀번호는 어디에도 없습니다
 *
 * 이 프로그램은 회원님의 아이디도 비밀번호도 보지 못합니다.
 * 로그인은 전부 브라우저 안에서 Google 이 처리하고, 프로그램은 결과로 받은 토큰만 씁니다.
 * 그래서 token.json 이 유출돼도 비밀번호가 새는 것은 아니지만,
 * Drive 를 읽을 수 있는 열쇠이므로 똑같이 조심해야 합니다.
 *
 * ■ 권한은 하나뿐입니다
 *
 * drive.readonly 하나로 문서 본문·PDF·폴더 목록·변경 시각을 전부 읽을 수 있습니다.
 * 권한은 적을수록 좋으므로 이것만 요청합니다. (읽기 전용이라 무엇도 수정되지 않습니다)
 */
import { authenticate } from "@google-cloud/local-auth";
import { UserRefreshClient } from "google-auth-library";
import { mkdir, readFile } from "node:fs/promises";
import { CREDENTIALS_FILE, DATA_DIR, TOKEN_FILE } from "../../config/paths.ts";
import { writeJsonAtomic } from "../../store/atomic-write.ts";

/**
 * 요청할 권한 범위.
 *
 * readonly 가 붙어 있으므로 이 프로그램은 회원님의 Drive 를 **읽기만** 할 수 있습니다.
 * 파일을 지우거나 고치는 것은 애초에 불가능합니다.
 */
export const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

/** credentials.json 안에서 우리가 쓰는 항목만 추린 모양 */
interface ClientSecrets {
  client_id: string;
  client_secret: string;
}

/** data/token.json 에 저장하는 모양 */
interface SavedToken {
  type: "authorized_user";
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

/**
 * 인증이 실패했을 때, 왜 실패했는지 사람이 읽을 수 있게 담아 던지는 오류.
 *
 * 참고: 생성자 괄호 안에 `readonly hint: string` 처럼 쓰는 문법(파라미터 프로퍼티)은
 * 타입만 지워서는 실행될 수 없어서 Node 가 직접 실행하지 못합니다.
 * 그래서 필드를 따로 선언하고 생성자 안에서 대입합니다.
 */
export class AuthError extends Error {
  /** 회원님이 무엇을 하면 되는지 알려주는 안내 문구 */
  readonly hint: string;

  constructor(message: string, hint: string) {
    super(message);
    this.name = "AuthError";
    this.hint = hint;
  }
}

/**
 * credentials.json 을 읽습니다.
 *
 * Desktop app 으로 만들면 내용이 { "installed": { ... } } 모양이고,
 * Web 유형으로 잘못 만들면 { "web": { ... } } 가 됩니다.
 * 둘 다 읽되, 잘못된 유형이면 알려줍니다.
 */
async function loadClientSecrets(): Promise<ClientSecrets> {
  let raw: string;
  try {
    raw = await readFile(CREDENTIALS_FILE, "utf8");
  } catch {
    throw new AuthError(
      "credentials.json 을 찾을 수 없습니다.",
      `Google Cloud Console 에서 받은 JSON 파일을 credentials.json 으로 이름을 바꿔\n` +
        `  ${CREDENTIALS_FILE}\n  위치에 넣어주세요. 자세한 절차는 docs/OAUTH-SETUP.md 를 보세요.`,
    );
  }

  const parsed: unknown = JSON.parse(raw);
  const root = parsed as { installed?: ClientSecrets; web?: ClientSecrets };
  const key = root.installed ?? root.web;

  if (!key?.client_id || !key?.client_secret) {
    throw new AuthError(
      "credentials.json 의 형식이 올바르지 않습니다.",
      "Google Cloud Console 의 Clients 화면에서 Application type 을 'Desktop app' 으로 만들어 다시 받아주세요.",
    );
  }

  if (!root.installed) {
    throw new AuthError(
      "credentials.json 이 'Desktop app' 유형이 아닙니다.",
      "Clients 화면에서 Application type 을 'Desktop app' 으로 선택해 새로 만들어주세요.",
    );
  }

  return { client_id: key.client_id, client_secret: key.client_secret };
}

/**
 * 이전에 저장해 둔 토큰이 있으면 그것으로 클라이언트를 만듭니다.
 *
 * 없거나 읽을 수 없으면 null 을 돌려줍니다. (오류로 취급하지 않습니다 —
 * 처음 실행할 때는 당연히 토큰이 없기 때문입니다)
 */
async function loadSavedClient(): Promise<UserRefreshClient | null> {
  try {
    const raw = await readFile(TOKEN_FILE, "utf8");
    const saved = JSON.parse(raw) as SavedToken;

    if (!saved.refresh_token) return null;

    return new UserRefreshClient(saved.client_id, saved.client_secret, saved.refresh_token);
  } catch {
    return null;
  }
}

/**
 * 브라우저 동의로 받은 토큰을 파일에 저장합니다.
 *
 * refresh_token 은 "다음부터 브라우저 없이 들어갈 수 있는 열쇠"입니다.
 * 이게 없으면 매번 브라우저를 열어야 하므로 반드시 저장해 둡니다.
 */
async function saveToken(secrets: ClientSecrets, refreshToken: string): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const payload: SavedToken = {
    type: "authorized_user",
    client_id: secrets.client_id,
    client_secret: secrets.client_secret,
    refresh_token: refreshToken,
  };

  await writeJsonAtomic(TOKEN_FILE, payload);
}

/**
 * 인증된 클라이언트를 얻습니다. 이 프로그램의 인증은 전부 이 함수를 거칩니다.
 *
 * @param options.interactive
 *   true  → 저장된 토큰이 없으면 브라우저를 열어 동의를 받습니다.
 *   false → 저장된 토큰이 없으면 그냥 오류를 냅니다.
 *           (자료를 수집하는 도중에 갑자기 브라우저가 뜨면 곤란하므로,
 *            수집 명령에서는 false 로 씁니다)
 */
export async function authorize(
  options: { interactive?: boolean } = {},
): Promise<UserRefreshClient> {
  const { interactive = false } = options;

  // 1) 저장된 토큰이 있으면 그대로 쓴다.
  const saved = await loadSavedClient();
  if (saved) return saved;

  // 2) 없는데 브라우저를 열 수 없는 상황이면 안내하고 멈춘다.
  if (!interactive) {
    throw new AuthError(
      "아직 인증하지 않았습니다.",
      "먼저 `node src/index.ts auth` 를 실행해 브라우저에서 한 번 동의해주세요.",
    );
  }

  // 3) 브라우저를 열어 동의를 받는다.
  //    authenticate() 는 잠깐 로컬 서버를 띄우고 브라우저를 연 뒤,
  //    회원님이 '허용'을 누르면 그 결과를 받아옵니다.
  const secrets = await loadClientSecrets();

  const client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_FILE,
  });

  const refreshToken = client.credentials.refresh_token;
  if (!refreshToken) {
    throw new AuthError(
      "동의는 되었지만 refresh token 을 받지 못했습니다.",
      "이미 동의한 적이 있어 생략된 경우입니다.\n" +
        "  https://myaccount.google.com/permissions 에서 이 앱의 권한을 삭제한 뒤 다시 시도해주세요.",
    );
  }

  await saveToken(secrets, refreshToken);

  return new UserRefreshClient(secrets.client_id, secrets.client_secret, refreshToken);
}

/**
 * 인증을 붙여서 요청을 보냅니다.
 *
 * 앞으로 Google API 를 부르는 모든 코드가 이 함수를 씁니다.
 * 토큰이 만료되면 라이브러리가 알아서 새로 받아오므로 신경 쓰지 않아도 됩니다.
 *
 * @param client authorize() 로 얻은 클라이언트
 * @param url    부를 주소
 */
export async function authorizedFetch(
  client: UserRefreshClient,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let token: string | null | undefined;

  try {
    const result = await client.getAccessToken();
    token = result.token;
  } catch (e) {
    // refresh token 이 만료되면 여기서 invalid_grant 오류가 납니다.
    // Testing 상태의 프로젝트는 7일마다 만료되므로 흔히 겪는 상황입니다.
    const message = e instanceof Error ? e.message : String(e);

    if (message.includes("invalid_grant")) {
      throw new AuthError(
        "인증이 만료되었습니다.",
        "`node src/index.ts auth` 를 다시 실행해 브라우저에서 동의해주세요.\n" +
          "  (7일마다 반복되는 것이 번거로우면 docs/OAUTH-SETUP.md 의 '7일 만료 없애기' 를 참고하세요)",
      );
    }
    throw e;
  }

  if (!token) {
    throw new AuthError(
      "액세스 토큰을 받지 못했습니다.",
      "`node src/index.ts auth` 를 다시 실행해주세요.",
    );
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(url, { ...init, headers });
}

/**
 * Google API 가 돌려준 오류 응답을 사람이 읽을 수 있는 안내로 바꿉니다.
 *
 * Google 의 오류 응답에는 대부분 "무엇을 하면 되는지"가 이미 들어 있습니다.
 * 특히 API 가 꺼져 있을 때는 **프로젝트 번호가 박힌 활성화 링크**를 함께 줍니다.
 * 그 링크를 쓰면 콘솔에서 프로젝트를 잘못 고르는 실수를 아예 피할 수 있으므로,
 * 우리가 만든 일반적인 안내문보다 훨씬 쓸모가 있습니다.
 */
function describeApiError(status: number, body: string): string {
  // 응답이 JSON 이 아닐 수도 있으므로 실패해도 넘어간다.
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return `응답 (HTTP ${status}): ${body.slice(0, 300)}`;
  }

  const error = (parsed as { error?: Record<string, unknown> }).error;
  if (!error) return `응답 (HTTP ${status}): ${body.slice(0, 300)}`;

  const message = typeof error.message === "string" ? error.message : "";

  // details 안에 활성화 링크(activationUrl)가 들어 있는지 찾아본다.
  const details = Array.isArray(error.details) ? error.details : [];
  let activationUrl: string | undefined;
  let serviceTitle: string | undefined;

  for (const detail of details) {
    const metadata = (detail as { metadata?: Record<string, unknown> }).metadata;
    if (typeof metadata?.activationUrl === "string") activationUrl = metadata.activationUrl;
    if (typeof metadata?.serviceTitle === "string") serviceTitle = metadata.serviceTitle;
  }

  if (activationUrl) {
    return (
      `${serviceTitle ?? "이 API"} 가 아직 켜져 있지 않습니다.\n` +
      `  아래 주소를 열고 "사용 설정(Enable)" 을 눌러주세요.\n` +
      `  (프로젝트가 미리 지정된 주소라 프로젝트를 잘못 고를 염려가 없습니다)\n\n` +
      `  ${activationUrl}\n\n` +
      `  켠 직후에는 반영까지 1~2분 걸릴 수 있습니다. 잠시 뒤 다시 실행해주세요.`
    );
  }

  if (status === 401) {
    return "토큰이 더 이상 유효하지 않습니다. `node src/index.ts auth` 를 다시 실행해주세요.";
  }

  if (status === 403) {
    return (
      "권한이 거부되었습니다.\n" +
      "  Google Auth Platform 의 Audience 화면에서 이 계정이 Test users 에 등록되어 있는지 확인해주세요.\n" +
      `  원본 메시지: ${message.slice(0, 300)}`
    );
  }

  return `원본 메시지: ${message.slice(0, 300)}`;
}

/**
 * 인증이 실제로 동작하는지 확인합니다.
 *
 * Drive API 로 "내 계정 정보"를 물어봅니다. 가장 가벼운 호출이라
 * 연결 확인용으로 적당합니다.
 *
 * @returns 계정 이메일과 표시 이름
 */
export async function verifyConnection(
  client: UserRefreshClient,
): Promise<{ email: string; displayName: string }> {
  const response = await authorizedFetch(
    client,
    "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",
  );

  if (!response.ok) {
    const body = await response.text();
    throw new AuthError(
      `Drive API 호출이 실패했습니다 (HTTP ${response.status}).`,
      describeApiError(response.status, body),
    );
  }

  const data = (await response.json()) as {
    user?: { emailAddress?: string; displayName?: string };
  };

  return {
    email: data.user?.emailAddress ?? "(알 수 없음)",
    displayName: data.user?.displayName ?? "(알 수 없음)",
  };
}
