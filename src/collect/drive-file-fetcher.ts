/**
 * Drive 에 올라온 파일(PDF, zip, 이미지 등)을 내려받는 부분.
 *
 * ■ Google 문서와 무엇이 다른가
 *
 * Google 문서는 Google 안에서만 존재하는 형식이라 `files.export` 로 "변환해서" 받습니다.
 * 반면 PDF·zip·이미지는 파일 그 자체가 Drive 에 올라가 있으므로
 * `files.get?alt=media` 로 **원본 바이트를 그대로** 받습니다.
 *
 * ■ 변경 감지가 훨씬 쉽습니다
 *
 * Google 문서는 md5Checksum 이 오지 않아서 본문을 받아 직접 해시를 계산해야 했습니다.
 * 그런데 **바이너리 파일에는 Drive 가 md5Checksum 을 그대로 줍니다.**
 * (실제로 확인해 보니 조회된 파일 전부에 값이 있었습니다)
 *
 * 덕분에 파일을 내려받지 않고도 "지난번과 같은 파일인가"를 알 수 있습니다.
 * 471MB 짜리 zip 더미를 매번 다시 받지 않아도 된다는 뜻입니다.
 */
import type { UserRefreshClient } from "google-auth-library";
import { authorizedFetch } from "./auth/google-auth.ts";
import type { ApiResult } from "./drive-api.ts";

/** 바이너리 파일의 정보 */
export interface DriveBinaryMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  /** 파일 크기(바이트). 문자열로 오므로 숫자로 바꿔 씁니다. */
  sizeBytes?: number;
  /** 파일 내용의 지문. 바이너리 파일에만 옵니다. */
  md5Checksum?: string;
  trashed?: boolean;
}

/** Google API 오류 응답에서 이유와 메시지를 꺼냅니다. */
function parseApiError(status: number, body: string): { code: string; reason: string } {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    };
    return {
      code: parsed.error?.errors?.[0]?.reason ?? `http${status}`,
      reason: parsed.error?.message ?? body.slice(0, 200),
    };
  } catch {
    return { code: `http${status}`, reason: body.slice(0, 200) };
  }
}

/**
 * 파일 정보를 조회합니다. (내용은 받지 않습니다)
 *
 * md5Checksum 을 함께 받아오는 것이 핵심입니다.
 * 이 값만 비교하면 거대한 파일도 내려받지 않고 변경 여부를 알 수 있습니다.
 */
export async function getBinaryMeta(
  client: UserRefreshClient,
  fileId: string,
): Promise<ApiResult<DriveBinaryMeta>> {
  const fields = "id,name,mimeType,modifiedTime,size,md5Checksum,trashed";
  const url =
    `https://www.googleapis.com/drive/v3/files/${fileId}` +
    `?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`;

  try {
    const response = await authorizedFetch(client, url);

    if (!response.ok) {
      const { code, reason } = parseApiError(response.status, await response.text());
      return { ok: false, code, reason, status: response.status };
    }

    const raw = (await response.json()) as Omit<DriveBinaryMeta, "sizeBytes"> & { size?: string };

    return {
      ok: true,
      value: {
        id: raw.id,
        name: raw.name,
        mimeType: raw.mimeType,
        modifiedTime: raw.modifiedTime,
        sizeBytes: raw.size === undefined ? undefined : Number(raw.size),
        md5Checksum: raw.md5Checksum,
        trashed: raw.trashed,
      },
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
 * 파일 원본을 내려받습니다.
 *
 * `alt=media` 를 붙이면 파일 정보(JSON) 대신 **파일 내용 자체**가 옵니다.
 */
export async function downloadBinary(
  client: UserRefreshClient,
  fileId: string,
): Promise<ApiResult<Uint8Array>> {
  const url =
    `https://www.googleapis.com/drive/v3/files/${fileId}` + `?alt=media&supportsAllDrives=true`;

  try {
    const response = await authorizedFetch(client, url);

    if (!response.ok) {
      const { code, reason } = parseApiError(response.status, await response.text());
      return { ok: false, code, reason, status: response.status };
    }

    return { ok: true, value: new Uint8Array(await response.arrayBuffer()) };
  } catch (e) {
    return {
      ok: false,
      code: "network",
      reason: e instanceof Error ? e.message : String(e),
      status: 0,
    };
  }
}
