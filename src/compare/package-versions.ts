/**
 * 실습파일 안의 `package.json` 에서 "수업 때 쓴 버전"을 읽어내는 부분.
 *
 * ■ 이 정보가 어디에 있었는가
 *
 * 12단계 보고에서 "수업 당시 버전 정보가 없다"고 적었는데, 다시 뒤져 보니 있었습니다.
 * 8단계가 zip 안의 소스를 Markdown 에 실을 때 **`package.json` 도 함께 실었습니다.**
 *
 *   data/materials/react/react-swiper_v202607.zip--….md
 *     ### package.json
 *     ```json
 *     { "dependencies": { "react": "^19.2.7", "swiper": "^14.0.1" } }
 *     ```
 *
 * 실습파일 18개에 들어 있고, 패키지 23종의 실제 버전이 적혀 있습니다.
 * 추측이 아니라 **강사님 프로젝트에 그대로 적혀 있던 값**입니다.
 *
 * ■ 무엇과 견주는가
 *
 * npm 에 물어보지 않습니다. 네트워크를 새로 늘리지 않고, 확인 가능한 것만 씁니다.
 *
 *   · 같은 패키지를 쓰는 **다른 수업자료 중 가장 높은 버전** — 수업 안에서의 변화가 보입니다
 *   · **이 저장소가 지금 쓰는 버전** — 뷰어가 React 19·Next 16 을 씁니다
 *
 * 둘 다 없으면 `null` 로 두고 판단하지 않습니다.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR, ROOT_DIR } from "../config/paths.ts";
import { readPracticeCode } from "../learn/practice-reader.ts";
import type { IndexEntry } from "../store/index-store.ts";

/** 실습파일 하나가 쓴 패키지 하나 */
export interface PackageUse {
  zipId: string;
  zipTitle: string;
  subject: string;
  /** zip 안의 package.json 위치 */
  path: string;
  packageName: string;
  /** package.json 에 적힌 그대로 (^19.2.7 등) */
  range: string;
}

/** `^19.2.7` → `19.2.7` 처럼 앞의 기호를 떼어냅니다. */
function cleanRange(range: string): string | null {
  const match = range.match(/(\d+)\.(\d+)\.(\d+)/) ?? range.match(/(\d+)\.(\d+)/) ?? range.match(/(\d+)/);
  return match ? match[0] : null;
}

/** 버전 문자열을 숫자 배열로. 견줄 수 없으면 null. */
export function parseVersion(range: string): number[] | null {
  const cleaned = cleanRange(range);
  if (!cleaned) return null;
  return cleaned.split(".").map((part) => Number(part) || 0);
}

/** a 가 b 보다 높으면 양수. 견줄 수 없으면 0. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 메이저 번호 (없으면 null) */
export function majorOf(range: string): number | null {
  return parseVersion(range)?.[0] ?? null;
}

/**
 * 실습파일들에서 package.json 을 모두 찾아 의존성을 읽습니다.
 *
 * package.json 이 없는 실습파일(순수 HTML/CSS 예제 등)은 그냥 넘어갑니다.
 * 그것은 오류가 아니라 그 수업이 npm 을 쓰지 않았다는 뜻입니다.
 */
export async function collectPackageUses(zips: IndexEntry[]): Promise<PackageUse[]> {
  const uses: PackageUse[] = [];

  for (const zip of zips) {
    if (!zip.filePath) continue;

    const codes = await readPracticeCode(zip.filePath);

    for (const [path, file] of codes) {
      if (!/(^|\/)package\.json$/i.test(path)) continue;

      let parsed: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      try {
        parsed = JSON.parse(file.code);
      } catch {
        // 주석이 섞여 있거나 잘린 파일. 억지로 고쳐 읽지 않습니다.
        continue;
      }

      const all = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };

      for (const [packageName, range] of Object.entries(all)) {
        if (typeof range !== "string") continue;
        uses.push({
          zipId: zip.docId,
          zipTitle: zip.title,
          subject: zip.subject ?? "",
          path,
          packageName,
          range,
        });
      }
    }
  }

  return uses;
}

/**
 * 이 저장소가 지금 쓰는 버전을 읽습니다. (루트와 viewer 의 package.json)
 *
 * "현재"의 기준을 바깥에서 가져오지 않고 **손에 있는 것**으로 삼습니다.
 */
export async function readProjectVersions(): Promise<Map<string, string>> {
  const versions = new Map<string, string>();

  for (const path of [join(ROOT_DIR, "package.json"), join(ROOT_DIR, "viewer", "package.json")]) {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const all = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
      for (const [name, range] of Object.entries(all)) {
        // 더 높은 쪽을 남깁니다. (루트와 viewer 가 다를 수 있습니다)
        const previous = versions.get(name);
        if (!previous || compareVersions(range, previous) > 0) versions.set(name, range);
      }
    } catch {
      // package.json 이 없어도 비교를 포기하지 않습니다.
    }
  }

  return versions;
}

/** data 폴더 기준 상대 경로로 (화면에서 찾아가기 쉽게) */
export function relativeToData(absolutePath: string): string {
  return absolutePath.startsWith(DATA_DIR)
    ? absolutePath.slice(DATA_DIR.length + 1).replace(/\\/g, "/")
    : absolutePath;
}
