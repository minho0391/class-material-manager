/**
 * Drive API 로 자료를 가져오는 부분.
 *
 * ■ 왜 Drive API 하나로 통일하는가
 *
 * 공개 문서는 로그인 없이도 받을 수 있지만, 그러면 코드가 두 갈래로 나뉩니다.
 * 어차피 인증을 붙였으므로 **공개든 비공개든 똑같은 경로**로 처리합니다.
 * 게다가 Drive API 는 "언제 마지막으로 수정됐는지"를 알려주기 때문에,
 * 본문을 받아보기 전에 변경 여부를 먼저 알 수 있다는 큰 장점이 있습니다.
 *
 * ■ 확인한 사실 (추측이 아니라 실제로 시험해 본 결과입니다)
 *
 *   · Google 문서 → text/markdown 으로 받을 수 있다.
 *     제목 계층(#, ##, ###), 링크, 표가 그대로 보존된다. txt 보다 훨씬 낫다.
 *   · files.export 는 **10MB 를 넘으면 거부**한다 (exportSizeLimitExceeded).
 *     이미지가 많은 문서가 여기 걸린다.
 *   · 그럴 때는 docs.google.com 의 웹 export 주소에 인증 토큰을 붙이면 받아진다.
 *     실제로 10MB 를 넘는 기준 문서를 이 방법으로 받는 데 성공했다.
 *   · files.export 는 text/html 을 지원하지 않는다. (브라우저 export 와 다른 점)
 */
import type { UserRefreshClient } from "google-auth-library";
import { authorizedFetch } from "./auth/google-auth.ts";

/** Drive 가 알려주는 파일 정보 중 우리가 쓰는 것들 */
export interface DriveFileMeta {
  id: string;
  /** 문서 제목 */
  name: string;
  /** 파일 종류 (application/vnd.google-apps.document 등) */
  mimeType: string;
  /** 마지막으로 수정된 시각 (ISO 8601). 변경 감지의 1차 단서 */
  modifiedTime: string;
  /** 수정될 때마다 1씩 오르는 번호 */
  version?: string;
  /** 휴지통에 있는지 */
  trashed?: boolean;
}

/**
 * 성공/실패를 예외 대신 값으로 돌려주는 형태.
 *
 * 400건이 넘는 자료를 순회하는 도중 하나가 실패했다고 전체가 멈추면 안 됩니다.
 * 그래서 실패도 "정상적인 결과 중 하나"로 다룹니다.
 */
export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; reason: string; status: number };

/** 가져온 본문과 그 형식 */
export interface FetchedContent {
  content: string;
  /** 어떤 형식으로 받았는지 */
  format: "markdown" | "plain" | "csv";
  /** 10MB 제한에 걸려 웹 export 로 우회했는지 */
  viaFallback: boolean;
}

/**
 * Google 파일 종류별로 어떤 형식으로 내보낼지 정합니다.
 *
 * 공식 문서에서 확인한 지원 형식만 씁니다.
 *   문서   → text/markdown  (제목·링크·표 보존)
 *   시트   → text/csv       (첫 번째 시트만 나옵니다)
 *   슬라이드 → text/plain    (markdown 은 지원하지 않습니다)
 */
const EXPORT_FORMATS: Record<string, { mimeType: string; format: FetchedContent["format"] }> = {
  "application/vnd.google-apps.document": { mimeType: "text/markdown", format: "markdown" },
  "application/vnd.google-apps.spreadsheet": { mimeType: "text/csv", format: "csv" },
  "application/vnd.google-apps.presentation": { mimeType: "text/plain", format: "plain" },
};

/** Google API 오류 응답에서 이유(reason)와 메시지를 꺼냅니다. */
function parseApiError(status: number, body: string): { code: string; reason: string } {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    };
    const code = parsed.error?.errors?.[0]?.reason ?? `http${status}`;
    const reason = parsed.error?.message ?? body.slice(0, 200);
    return { code, reason };
  } catch {
    return { code: `http${status}`, reason: body.slice(0, 200) };
  }
}

/**
 * 파일 정보를 조회합니다. 본문은 받지 않으므로 아주 가볍습니다.
 *
 * 두 번째 실행부터는 이 정보만으로 "바뀐 게 없다"를 판정할 수 있어서,
 * 236건의 본문을 통째로 다시 받는 일을 피할 수 있습니다.
 */
export async function getFileMeta(
  client: UserRefreshClient,
  fileId: string,
): Promise<ApiResult<DriveFileMeta>> {
  const fields = "id,name,mimeType,modifiedTime,version,trashed";
  const url =
    `https://www.googleapis.com/drive/v3/files/${fileId}` +
    `?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`;

  try {
    const response = await authorizedFetch(client, url);

    if (!response.ok) {
      const { code, reason } = parseApiError(response.status, await response.text());
      return { ok: false, code, reason, status: response.status };
    }

    return { ok: true, value: (await response.json()) as DriveFileMeta };
  } catch (e) {
    return {
      ok: false,
      code: "network",
      reason: e instanceof Error ? e.message : String(e),
      status: 0,
    };
  }
}

/**
 * 10MB 제한에 걸렸을 때 쓰는 우회 경로.
 *
 * Drive API 가 아니라 docs.google.com 의 웹 export 주소를 씁니다.
 * 이쪽은 크기 제한이 없어서 큰 문서도 받아집니다. 대신 형식은 순수 텍스트뿐이라
 * 제목 계층과 링크가 사라집니다. 그래서 어디까지나 최후 수단입니다.
 */
async function fetchViaWebExport(
  client: UserRefreshClient,
  fileId: string,
): Promise<ApiResult<FetchedContent>> {
  const url = `https://docs.google.com/document/d/${fileId}/export?format=txt`;

  try {
    const response = await authorizedFetch(client, url);

    if (!response.ok) {
      return {
        ok: false,
        code: "webExportFailed",
        reason: `웹 export 도 실패했습니다 (HTTP ${response.status})`,
        status: response.status,
      };
    }

    return {
      ok: true,
      value: { content: await response.text(), format: "plain", viaFallback: true },
    };
  } catch (e) {
    return {
      ok: false,
      code: "network",
      reason: e instanceof Error ? e.message : String(e),
      status: 0,
    };
  }
}

/**
 * 본문을 내려받습니다.
 *
 * 10MB 를 넘어 거부당하면 자동으로 웹 export 로 다시 시도합니다.
 * 이 처리를 여기 안에 넣어두면, 이 함수를 쓰는 쪽은 크기 걱정을 할 필요가 없습니다.
 */
export async function exportContent(
  client: UserRefreshClient,
  meta: DriveFileMeta,
): Promise<ApiResult<FetchedContent>> {
  const target = EXPORT_FORMATS[meta.mimeType];

  if (!target) {
    return {
      ok: false,
      code: "unsupportedType",
      reason: `아직 다루지 않는 파일 종류입니다: ${meta.mimeType}`,
      status: 0,
    };
  }

  const url =
    `https://www.googleapis.com/drive/v3/files/${meta.id}/export` +
    `?mimeType=${encodeURIComponent(target.mimeType)}`;

  try {
    const response = await authorizedFetch(client, url);

    if (response.ok) {
      return {
        ok: true,
        value: { content: await response.text(), format: target.format, viaFallback: false },
      };
    }

    const { code, reason } = parseApiError(response.status, await response.text());

    // 10MB 초과 → 웹 export 로 우회한다. (문서 종류일 때만 가능)
    if (
      code === "exportSizeLimitExceeded" &&
      meta.mimeType === "application/vnd.google-apps.document"
    ) {
      return fetchViaWebExport(client, meta.id);
    }

    return { ok: false, code, reason, status: response.status };
  } catch (e) {
    return {
      ok: false,
      code: "network",
      reason: e instanceof Error ? e.message : String(e),
      status: 0,
    };
  }
}
