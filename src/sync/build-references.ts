/**
 * data/references/**.md → reference_documents 행 변환.
 *
 * references 는 강사 원본 자료가 아니라 MDN 등 외부 공식 문서를 enrich 단계가 요약·발췌한
 * 캐시입니다. 배포 환경(data/ 없음)에서도 /r 화면과 본문 검색이 동작하도록 DB 에 사본을 둡니다.
 *
 * frontmatter(YAML)는 **여기(신뢰된 로컬 data/, service_role 실행)에서만** 파싱합니다 —
 * 뷰어는 파싱된 컬럼만 읽고 DB 데이터에 대해 YAML 을 실행하지 않습니다.
 * "이 주제를 다룬 수업자료" 섹션 파싱은 viewer/lib/data.ts:readReferences 의 로직을 그대로 옮겼습니다.
 *
 * source_url 은 허용 스킴(http/https/mailto)만 저장합니다 — 그 외(javascript: 등)는 null 로
 * 두어 뷰어가 링크로 렌더하지 않도록 합니다. (뷰어 렌더 시에도 한 번 더 검사합니다.)
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { REFERENCES_DIR } from "../config/paths.ts";
import { parseFlatFrontmatter, splitFrontmatter } from "./frontmatter.ts";

export interface ReferenceRow {
  subject: string;
  slug: string;
  title: string;
  source_url: string | null;
  source_name: string | null;
  language: string;
  fetched_at: string | null;
  mentions: number;
  related_materials: string[];
  body: string;
}

/** 허용 스킴만 통과. 그 외(javascript:, data:, vbscript: 등)는 null. */
export function sanitizeUrl(value: string | undefined): string | null {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null; // 상대경로·빈 값 등 — 외부 링크로 쓰지 않습니다
  }
  const scheme = parsed.protocol.toLowerCase();
  return scheme === "http:" || scheme === "https:" || scheme === "mailto:" ? parsed.href : null;
}

/** 본문의 "## 📚 이 주제를 다룬 수업자료" 절에서 자료 제목 목록을 뽑습니다. */
function parseRelatedMaterials(body: string): string[] {
  const section = body.split("## 📚 이 주제를 다룬 수업자료")[1]?.split("##")[0] ?? "";
  const related: string[] = [];
  for (const line of section.split("\n")) {
    const item = line.match(/^-\s+(.+)$/);
    if (item?.[1]) related.push(item[1].trim());
  }
  return related;
}

export async function buildReferenceRows(): Promise<ReferenceRow[]> {
  const rows: ReferenceRow[] = [];

  let subjects: string[];
  try {
    subjects = await readdir(REFERENCES_DIR);
  } catch {
    return rows; // references 를 아직 만들지 않았습니다
  }

  for (const subject of subjects) {
    let files: string[];
    try {
      files = await readdir(join(REFERENCES_DIR, subject));
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".md") || file === "INDEX.md") continue;

      let raw: string;
      try {
        raw = await readFile(join(REFERENCES_DIR, subject, file), "utf8");
      } catch {
        continue;
      }

      const { frontmatter, body } = splitFrontmatter(raw);
      const fm = parseFlatFrontmatter(frontmatter);
      const slug = file.replace(/\.md$/, "");

      rows.push({
        subject,
        slug,
        title: fm.title ?? slug,
        source_url: sanitizeUrl(fm.sourceUrl),
        source_name: fm.sourceName ?? null,
        language: fm.language ?? "en",
        fetched_at: fm.fetchedAt ?? null,
        mentions: Number(fm.mentionsInMaterials ?? 0) || 0,
        related_materials: parseRelatedMaterials(body),
        body,
      });
    }
  }

  return rows;
}
