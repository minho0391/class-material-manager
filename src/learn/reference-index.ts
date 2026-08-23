/**
 * 6단계가 만들어 둔 공식 문서 요약을 훑어 목록으로 만드는 부분.
 *
 * ■ 인터넷에 나가지 않습니다
 *
 * 이 단계에서는 공식 문서를 새로 가져오지 않습니다.
 * `data/references/` 에 이미 저장된 요약본만 읽습니다.
 * 내용도 고치지 않습니다 — 어떤 수업자료와 이어지는지만 읽어 옵니다.
 *
 * ■ 어떻게 이어지는가
 *
 * 6단계가 요약본마다 이런 절을 적어 두었습니다.
 *
 *   ## 📚 이 주제를 다룬 수업자료
 *   - CSS Container Queries
 *   - 01_CSS GRID 핵심
 *
 * 그러니 이 목록을 거꾸로 훑으면 "이 수업자료의 공식 문서"를 찾을 수 있습니다.
 * 뷰어가 이미 같은 방식으로 찾고 있어서, 두 곳의 결과가 어긋나지 않습니다.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { REFERENCES_DIR } from "../config/paths.ts";

/** 공식 문서 요약 한 편 */
export interface ReferenceSummary {
  subject: string;
  /** 주소에 쓰는 이름 (파일 이름에서 .md 를 뗀 것) */
  slug: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  language: string;
  /** 수업자료에서 몇 번 언급됐는지 */
  mentions: number;
  /** 이 주제를 다룬 수업자료 제목들 */
  relatedMaterials: string[];

  // ── 13단계 비교에 쓰는 항목들 ──
  /** 이 내용을 공식 문서에서 받아온 날 */
  fetchedAt: string;
  /** 공식 문서 내용의 지문 — 이 값이 달라지면 다시 비교해야 합니다 */
  contentHash: string;
  /**
   * 공식 문서가 스스로 밝힌 상태 (deprecated · experimental · non-standard).
   * 없으면 빈 배열입니다. **"정상"이라는 뜻이 아니라 "문서가 아무 말도 하지 않았다"는 뜻입니다.**
   */
  docStatus: string[];
  /** 문서가 적어 둔 경고 문장 */
  docStatusNote?: string;
  /** 핵심 요약 본문 (근거를 보여줄 때 씁니다) */
  summary: string;
}

/** front matter 에서 값 하나를 꺼냅니다. (따옴표가 있으면 벗겨냅니다) */
function frontMatterValue(frontMatter: string, key: string): string {
  const line = frontMatter.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";
  return line.replace(/^["']|["']$/g, "");
}

/** 요약본 한 편을 읽습니다. */
function parseReference(subject: string, fileName: string, raw: string): ReferenceSummary {
  const end = raw.startsWith("---") ? raw.indexOf("\n---", 3) : -1;
  const frontMatter = end === -1 ? "" : raw.slice(3, end);
  const body = end === -1 ? raw : raw.slice(end + 4);

  // "이 주제를 다룬 수업자료" 목록만 잘라냅니다.
  const section = body.split("## 📚 이 주제를 다룬 수업자료")[1]?.split("\n## ")[0] ?? "";
  const relatedMaterials: string[] = [];

  for (const line of section.split("\n")) {
    const item = line.match(/^-\s+(.+)$/);
    if (item?.[1]) relatedMaterials.push(item[1].trim());
  }

  const status = frontMatterValue(frontMatter, "docStatus");

  return {
    subject,
    slug: fileName.replace(/\.md$/, ""),
    title: frontMatterValue(frontMatter, "title") || fileName.replace(/\.md$/, ""),
    sourceUrl: frontMatterValue(frontMatter, "sourceUrl"),
    sourceName: frontMatterValue(frontMatter, "sourceName"),
    language: frontMatterValue(frontMatter, "language") || "en",
    mentions: Number(frontMatterValue(frontMatter, "mentionsInMaterials")) || 0,
    relatedMaterials,
    fetchedAt: frontMatterValue(frontMatter, "fetchedAt"),
    contentHash: frontMatterValue(frontMatter, "contentHash"),
    docStatus: status ? status.split(",").map((v) => v.trim()).filter(Boolean) : [],
    docStatusNote: frontMatterValue(frontMatter, "docStatusNote") || undefined,
    summary: (body.split("## 📘 핵심 요약")[1]?.split("\n## ")[0] ?? "").trim(),
  };
}

/**
 * 저장된 공식 문서 요약을 전부 읽습니다.
 *
 * 폴더가 없으면 (6단계를 아직 돌리지 않았으면) 빈 목록을 돌려줍니다. 오류가 아닙니다.
 */
export async function loadReferences(): Promise<ReferenceSummary[]> {
  const references: ReferenceSummary[] = [];

  let subjects: string[];
  try {
    subjects = await readdir(REFERENCES_DIR);
  } catch {
    return references;
  }

  for (const subject of subjects) {
    let fileNames: string[];
    try {
      fileNames = await readdir(join(REFERENCES_DIR, subject));
    } catch {
      continue;
    }

    for (const fileName of fileNames) {
      // INDEX.md 는 목차라서 요약본이 아닙니다.
      if (!fileName.endsWith(".md") || fileName === "INDEX.md") continue;

      try {
        const raw = await readFile(join(REFERENCES_DIR, subject, fileName), "utf8");
        references.push(parseReference(subject, fileName, raw));
      } catch {
        // 한 편을 못 읽어도 나머지는 씁니다.
      }
    }
  }

  return references;
}

/**
 * 이 수업자료를 다룬 공식 문서를 찾습니다.
 *
 * 뷰어의 `getRelatedReferences` 와 같은 규칙입니다.
 *   · 과목이 같거나 상위 과목이고
 *   · 그 요약본의 "이 주제를 다룬 수업자료" 목록에 이 자료가 들어 있는 것
 * 많이 언급된 주제부터, 최대 8건.
 */
export function findReferencesFor(
  references: readonly ReferenceSummary[],
  materialTitle: string,
  materialSubject: string,
): ReferenceSummary[] {
  return references
    .filter((reference) => {
      const sameSubject =
        materialSubject === reference.subject || materialSubject.startsWith(`${reference.subject}/`);
      return sameSubject && reference.relatedMaterials.includes(materialTitle);
    })
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 8);
}
