/**
 * "이대로 바깥에 내놔도 되나" 를 확인하는 자리.
 *
 * ■ 두 가지를 **따로** 봅니다
 *
 *   1. **자료 자체** (`data/`)      — 내 컴퓨터에 있는 수업자료 안에 위험한 것이 있나
 *   2. **git 이 추적하는 것**        — 그중 실제로 바깥에 올라갈 것이 있나
 *
 * 이 둘을 섞으면 안 됩니다. 실제로 이런 일이 있었습니다 —
 * 강사님 수업자료 안에 GitHub 토큰처럼 생긴 문자열이 있었지만,
 * `data/` 는 `.gitignore` 대상이라 **git 으로는 새어 나가지 않았습니다.**
 *
 * 이 둘을 구분하지 못하면 "유출됐다" 고 놀라거나, 반대로 "괜찮다" 고 넘기게 됩니다.
 * 그래서 여기서는 늘 나눠서 말합니다 —
 * **자료에는 의심스러운 것이 있다. 그러나 git 공개 대상에는 없다.**
 *
 * ■ 무엇이 실패인가
 *
 * `data/` 에서 뭔가 찾았다고 실패로 보지 않습니다. 그것은 내 컴퓨터 안의 일입니다.
 * **git 이 추적하는 파일에서 찾았을 때만 실패**입니다. 그것은 밖으로 나갑니다.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, relative } from "node:path";
import { DATA_DIR, ROOT_DIR } from "../config/paths.ts";
import { scanText, summarize, type SecretFinding } from "./secret-scanner.ts";

const run = promisify(execFile);

/** 훑어볼 만한 글 파일인지 — 그림·압축파일 안은 보지 않습니다 */
const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".html", ".css", ".scss", ".yml", ".yaml", ".env", ".example", ".sh", ".ps1",
]);

/** 한 파일에서 읽어 볼 최대 크기 — 큰 파일 하나가 검사를 붙잡아 두지 않게 */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function isTextFile(path: string): boolean {
  const extension = extname(path).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return true;
  // `.env` 처럼 확장자가 곧 이름인 것들
  return path.endsWith(".env") || path.endsWith(".env.example");
}

/** 폴더 하나를 훑습니다 */
async function scanDirectory(root: string, label: string): Promise<SecretFinding[]> {
  const findings: SecretFinding[] = [];

  async function walk(directory: string): Promise<void> {
    let names: string[];
    try {
      names = await readdir(directory);
    } catch {
      return; // 폴더가 없으면 볼 것도 없습니다
    }

    for (const name of names) {
      const path = join(directory, name);

      let info;
      try {
        info = await stat(path);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        if (name === "node_modules" || name === ".git" || name === ".next") continue;
        await walk(path);
        continue;
      }

      if (!isTextFile(path) || info.size > MAX_FILE_BYTES) continue;

      try {
        const text = await readFile(path, "utf8");
        const where = `${label}/${relative(root, path).replace(/\\/g, "/")}`;
        findings.push(...scanText(text, where));
      } catch {
        // 읽지 못하는 파일은 넘어갑니다. 못 읽은 것을 "깨끗하다" 고 하지는 않습니다 —
        // 아래 `unreadable` 로 셉니다.
      }
    }
  }

  await walk(root);
  return findings;
}

/** git 이 추적하는 파일 목록 */
async function trackedFiles(): Promise<string[] | null> {
  try {
    const { stdout } = await run("git", ["ls-files"], { cwd: ROOT_DIR, maxBuffer: 10 * 1024 * 1024 });
    return stdout.split(NEWLINE).map((line) => line.trim()).filter(Boolean);
  } catch {
    return null; // git 저장소가 아니면 이 검사는 건너뜁니다
  }
}

const NEWLINE = String.fromCodePoint(10);

/** 검사 결과 */
export interface SecurityReport {
  /** git 이 추적하는 파일에서 찾은 것 — **이것이 있으면 실패입니다** */
  tracked: SecretFinding[];
  /** 자료(`data/`)에서 찾은 것 — 내 컴퓨터 안의 일입니다 */
  data: SecretFinding[];
  /** git 이 추적하는 파일 수 */
  trackedCount: number;
  /** `data/` 가 실제로 무시되고 있는지 */
  dataIgnored: boolean;
  /** git 저장소 안인지 */
  inGitRepo: boolean;
  /** 이 저장소의 경계 (엉뚱한 저장소를 보고 있지 않은지 확인용) */
  repoRoot: string | null;
  /** 통과했는가 — **git 추적 대상에 아무것도 없으면 통과** */
  passed: boolean;
}

/** `data/` 가 정말 무시되는지 git 에게 직접 물어봅니다 */
async function isDataIgnored(): Promise<boolean> {
  try {
    await run("git", ["check-ignore", "-q", "data/"], { cwd: ROOT_DIR });
    return true;
  } catch {
    return false;
  }
}

async function repoRootOf(): Promise<string | null> {
  try {
    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], { cwd: ROOT_DIR });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * 검사합니다.
 *
 * @param options.skipData 자료 검사를 건너뜁니다 (git 공개 대상만 빠르게 보고 싶을 때)
 */
export async function securityCheck(
  options: { skipData?: boolean } = {},
): Promise<SecurityReport> {
  const repoRoot = await repoRootOf();
  const files = await trackedFiles();

  // ── git 이 추적하는 파일 ──
  const tracked: SecretFinding[] = [];
  for (const relativePath of files ?? []) {
    if (!isTextFile(relativePath)) continue;

    try {
      const path = join(ROOT_DIR, relativePath);
      if ((await stat(path)).size > MAX_FILE_BYTES) continue;
      const text = await readFile(path, "utf8");
      tracked.push(...scanText(text, relativePath));
    } catch {
      continue;
    }
  }

  // ── 자료 자체 ──
  const data = options.skipData ? [] : await scanDirectory(DATA_DIR, "data");

  return {
    tracked,
    data,
    trackedCount: files?.length ?? 0,
    dataIgnored: await isDataIgnored(),
    inGitRepo: files !== null,
    repoRoot,
    passed: tracked.length === 0,
  };
}

export { summarize };
