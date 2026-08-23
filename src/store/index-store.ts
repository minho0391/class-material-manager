/**
 * 카탈로그(index.json) 읽기와 쓰기.
 *
 * ■ index.json 이 하는 일
 *
 * "어떤 자료를 언제, 어떤 내용으로 받았는지"를 기억하는 장부입니다.
 * 이 장부가 있어서
 *   · 이미 받은 자료를 또 받지 않고 (중복 방지)
 *   · 내용이 바뀐 것만 골라낼 수 있습니다 (변경 감지)
 *
 * ■ 왜 데이터베이스가 아니라 JSON 파일인가
 *
 * 422건 규모에서는 파일 하나로 충분히 빠르고, 무엇보다 **열어보면 바로 보입니다.**
 * 배우는 목적이라면 눈에 보이는 편이 훨씬 낫습니다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DATA_DIR, INDEX_FILE } from "../config/paths.ts";
import type { ResourceKind } from "../collect/url-normalizer.ts";

/** 자료 하나에 대한 기록 */
export interface IndexEntry {
  /** Google 문서 ID. 이것이 자료를 구분하는 유일한 열쇠입니다. */
  docId: string;
  /** 자료 종류 (문서/시트/슬라이드 등) */
  kind: ResourceKind;
  /** 문서 제목 (Drive 에 등록된 이름) */
  title: string;
  /** Google 파일 종류 */
  mimeType: string;
  /** 어떤 형식으로 받았는지 */
  format: "markdown" | "plain" | "csv";
  /** 원본 주소 */
  sourceUrl: string;

  /**
   * 기준 문서에서 이 자료가 링크된 위치들.
   * 같은 자료가 여러 섹션에 등장해도 파일은 하나만 만들고 여기에 모아둡니다.
   */
  occurrences: Array<{ section: string | null; text: string }>;

  /** 본문 지문. 이 값이 같으면 내용이 안 바뀐 것입니다. */
  contentHash: string;
  /** Drive 가 알려준 마지막 수정 시각 */
  modifiedTime: string;
  /** Drive 의 버전 번호 */
  driveVersion?: string;

  /** 처음 수집한 시각 */
  collectedAt: string;
  /** 마지막으로 갱신한 시각 */
  updatedAt: string;

  /** 저장된 파일 위치 (data 폴더 기준 상대 경로) */
  filePath: string;

  /** 과목 분류 결과. 5단계에서 채웁니다. */
  subject?: string;

  /** 10MB 제한 때문에 웹 export 로 우회해 받았는지 */
  viaFallback?: boolean;
  /** 제거한 base64 이미지 개수 */
  removedImages?: number;
  /** 코드블록으로 되돌린 1칸 표의 개수 */
  convertedBoxes?: number;
  /** 손대지 않은 진짜 표(2칸 이상)의 개수 */
  keptTables?: number;

  // ── 4단계(PDF·zip·이미지 등 파일)에서 쓰는 항목들 ──

  /**
   * 파일 내용의 지문. Drive 가 바이너리 파일에만 알려줍니다.
   * 이 값이 같으면 파일을 내려받지 않고 건너뜁니다.
   */
  md5Checksum?: string;
  /** 파일 크기(바이트) */
  sizeBytes?: number;
  /** PDF 쪽수 */
  pageCount?: number;
  /** zip 안의 전체 파일 개수 (8단계) */
  zipFileCount?: number;
  /** zip 에서 본문에 실은 소스 파일 개수 (8단계) */
  zipSourceCount?: number;
  /** 내려받은 원본 파일의 위치 (data 폴더 기준 상대 경로) */
  downloadPath?: string;
  /** 내려받았는지, 목록만 남겼는지 */
  fileAction?: "download" | "list-only";
  /** 목록만 남긴 이유 */
  fileActionReason?: string;
  /** 이 자료를 어디서 찾았는지 (예: "Drive 폴더: 참고 이미지 전체") */
  discoveredIn?: string;
}

/** index.json 파일 전체의 모양 */
export interface IndexData {
  /** 형식 버전. 나중에 구조를 바꿀 때 구분하려고 둡니다. */
  version: 1;
  updatedAt: string;
  /** 문서 ID를 열쇠로 하는 기록 모음 */
  entries: Record<string, IndexEntry>;
}

/** 아직 아무것도 수집하지 않았을 때의 빈 장부 */
function emptyIndex(): IndexData {
  return { version: 1, updatedAt: new Date().toISOString(), entries: {} };
}

/**
 * 장부를 읽습니다.
 *
 * 파일이 없으면 (= 처음 실행) 빈 장부를 돌려줍니다. 오류가 아닙니다.
 */
export async function loadIndex(): Promise<IndexData> {
  try {
    const raw = await readFile(INDEX_FILE, "utf8");
    const parsed = JSON.parse(raw) as IndexData;

    // 형식이 이상하면 빈 장부로 시작합니다. (잘못된 파일로 프로그램이 멈추지 않도록)
    if (parsed.version !== 1 || typeof parsed.entries !== "object") return emptyIndex();

    return parsed;
  } catch {
    return emptyIndex();
  }
}

/**
 * 장부를 저장합니다.
 *
 * 사람이 읽기 좋게 들여쓰기를 넣고, 문서 ID 순서로 정렬합니다.
 * 정렬해 두면 나중에 파일을 비교할 때 순서 때문에 생기는 잡음이 없습니다.
 */
export async function saveIndex(data: IndexData): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const sorted: Record<string, IndexEntry> = {};
  for (const key of Object.keys(data.entries).sort()) {
    const entry = data.entries[key];
    if (entry) sorted[key] = entry;
  }

  const output: IndexData = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: sorted,
  };

  await writeFile(INDEX_FILE, JSON.stringify(output, null, 2), "utf8");
}
