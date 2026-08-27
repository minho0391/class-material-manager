/**
 * index.json + data/materials/**.md → material_bodies 행 변환.
 *
 * material_metadata 와 별도 테이블입니다 (본문은 자료 상세에서만 필요 — schema-design 참고).
 * 원본 파일(PDF/DOCX/ZIP)이 아니라 그로부터 추출한 **텍스트 본문**만 담습니다.
 * frontmatter 는 여기서 떼어 냅니다 — DB 에는 본문만 저장하고, 뷰어는 DB 데이터에 대해
 * YAML/gray-matter 를 실행하지 않습니다.
 *
 * content_hash 는 index.json 의 본문 지문(contentHash)을 그대로 씁니다. 재sync 시 DB 의
 * 기존 hash 와 비교해 바뀐 자료만 다시 올리는 데 씁니다.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../config/paths.ts";
import type { IndexData } from "../store/index-store.ts";
import { splitFrontmatter } from "./frontmatter.ts";

export interface MaterialBodyRow {
  source_id: string;
  body: string;
  content_hash: string | null;
}

/**
 * 본문 행을 만듭니다. `.md` 가 아니거나 읽지 못한 자료(zip/pdf 목록만 등)는 건너뜁니다 —
 * 그런 자료는 뷰어에서 메타데이터 화면으로 처리됩니다.
 */
export async function buildMaterialBodyRows(index: IndexData): Promise<MaterialBodyRow[]> {
  const rows: MaterialBodyRow[] = [];

  for (const entry of Object.values(index.entries)) {
    if (!entry.filePath || !entry.filePath.endsWith(".md")) continue;

    let raw: string;
    try {
      raw = await readFile(join(DATA_DIR, entry.filePath), "utf8");
    } catch {
      continue; // 파일이 없으면 본문 없이 둡니다 (뷰어가 메타데이터 화면으로 처리)
    }

    const { body } = splitFrontmatter(raw);
    const trimmed = body.trim();
    if (trimmed.length === 0) continue; // 빈 본문은 저장하지 않습니다

    rows.push({
      source_id: entry.docId,
      body,
      content_hash: entry.contentHash ?? null,
    });
  }

  return rows;
}
