/**
 * Drive 폴더 안을 들여다보는 부분.
 *
 * ■ 폴더는 export 가 안 됩니다
 *
 * 문서나 PDF 와 달리 폴더는 "내용"이라는 게 없습니다.
 * 안에 무엇이 들어 있는지 알려면 Drive API 로 목록을 물어봐야 합니다.
 * 이것이 3단계에서 폴더를 다루지 못하고 4단계로 미뤄둔 이유입니다.
 *
 * ■ 실제로 무엇이 들어 있었나
 *
 *   TEMP            zip 1개
 *   수업영상         mp4 431개, 72.7 GB   ← 받을 수 없습니다. 목록만 남깁니다.
 *   스토리보드        0개 (비어 있거나 권한 없음)
 *   참고 이미지 전체   png 28 + jpg 1, 2.3 MB
 */
import type { UserRefreshClient } from "google-auth-library";
import { authorizedFetch } from "./auth/google-auth.ts";
import type { ApiResult } from "./drive-api.ts";

/** 폴더 안에 든 파일 하나 */
export interface FolderItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  modifiedTime?: string;
  md5Checksum?: string;
}

/** 폴더 하나를 열어본 결과 */
export interface FolderListing {
  folderId: string;
  /** 폴더 이름. 폴더 자체를 조회할 수 없으면 링크에 적혀 있던 글자를 씁니다. */
  folderName: string;
  items: FolderItem[];
}

/** 폴더 이름을 알아냅니다. 실패하면 null. */
async function getFolderName(
  client: UserRefreshClient,
  folderId: string,
): Promise<string | null> {
  const url =
    `https://www.googleapis.com/drive/v3/files/${folderId}` +
    `?fields=name&supportsAllDrives=true`;

  try {
    const response = await authorizedFetch(client, url);
    if (!response.ok) return null;
    return ((await response.json()) as { name?: string }).name ?? null;
  } catch {
    return null;
  }
}

/**
 * 폴더 안의 파일 목록을 전부 가져옵니다.
 *
 * Drive 는 한 번에 최대 1000개까지만 돌려주고, 더 있으면 nextPageToken 을 줍니다.
 * 그 표를 들고 다시 물어보기를 반복해 전부 모읍니다.
 * (수업영상 폴더처럼 431개가 들어 있는 경우가 실제로 있었습니다)
 */
export async function listFolder(
  client: UserRefreshClient,
  folderId: string,
  fallbackName: string,
): Promise<ApiResult<FolderListing>> {
  const items: FolderItem[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const fields = "files(id,name,mimeType,size,modifiedTime,md5Checksum),nextPageToken";

      const url =
        `https://www.googleapis.com/drive/v3/files?q=${query}` +
        `&fields=${encodeURIComponent(fields)}&pageSize=1000` +
        `&supportsAllDrives=true&includeItemsFromAllDrives=true` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

      const response = await authorizedFetch(client, url);

      if (!response.ok) {
        const body = await response.text();
        return {
          ok: false,
          code: "folderListFailed",
          reason: body.slice(0, 200),
          status: response.status,
        };
      }

      const data = (await response.json()) as {
        files?: Array<Omit<FolderItem, "sizeBytes"> & { size?: string }>;
        nextPageToken?: string;
      };

      for (const file of data.files ?? []) {
        items.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.size === undefined ? undefined : Number(file.size),
          modifiedTime: file.modifiedTime,
          md5Checksum: file.md5Checksum,
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    const folderName = (await getFolderName(client, folderId)) ?? fallbackName;

    return { ok: true, value: { folderId, folderName, items } };
  } catch (e) {
    return {
      ok: false,
      code: "network",
      reason: e instanceof Error ? e.message : String(e),
      status: 0,
    };
  }
}

/** 바이트를 사람이 읽기 좋은 크기 표기로 바꿉니다. */
function humanSize(bytes: number | undefined): string {
  if (bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 폴더 내용을 Markdown 표로 만듭니다.
 *
 * 수업영상처럼 내려받을 수 없는 자료에 쓰는 방식입니다.
 * 파일 자체는 없어도 **"몇 월 며칠에 무슨 수업이었는지"** 는 남습니다.
 * 기준 문서에 "영상은 30일 후 삭제한다"고 적혀 있으므로,
 * 목록을 남겨두는 것만으로도 나중에 값어치가 있습니다.
 */
export function buildFolderListingMarkdown(listing: FolderListing): string {
  const lines: string[] = [];

  // 파일 이름 순으로 정렬합니다. 이름이 날짜로 시작하는 경우가 많아
  // 자연스럽게 시간 순서가 됩니다. (예: 2026-08-14 02_TDD_기초.mp4)
  const sorted = [...listing.items].sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const totalBytes = sorted.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);

  lines.push(`# ${listing.folderName}`);
  lines.push("");
  lines.push(`파일 ${sorted.length}개 · 총 ${humanSize(totalBytes)}`);
  lines.push("");
  lines.push(
    "> 이 폴더의 파일은 용량이 커서 내려받지 않았습니다. 아래 링크로 바로 열어볼 수 있습니다.",
  );
  lines.push("");
  lines.push("| 파일 | 크기 | 링크 |");
  lines.push("| :---- | ----: | :---- |");

  for (const item of sorted) {
    // 표 안에서 세로줄(|)은 칸 구분자이므로 그대로 쓰면 표가 깨집니다.
    const safeName = item.name.replace(/\|/g, "\\|");
    const link = `https://drive.google.com/file/d/${item.id}/view`;
    lines.push(`| ${safeName} | ${humanSize(item.sizeBytes)} | [열기](${link}) |`);
  }

  lines.push("");
  return lines.join("\n");
}
