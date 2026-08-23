/**
 * 되돌릴 수 있게 해 두는 자리.
 *
 * ■ 무엇을 백업하는가 — **다시 만들기 비싼 것만**
 *
 * `data/` 는 379MB 인데 그중 373MB 가 `materials/` 입니다.
 * 그것은 **강사님 문서에서 내려받은 원본**이라, 지워져도 다시 받으면 됩니다.
 * 매번 복제하면 백업 한 번에 373MB 씩 늘어납니다. 그럴 값어치가 없습니다.
 *
 * 정작 아까운 것은 작습니다 — 다 합쳐 4MB 남짓입니다.
 *
 *   index.json          자료 카탈로그 (어떤 자료를 어디에 두었는지)
 *   relations.json      설명자료 ↔ 실습코드 연결 (9단계)
 *   learning.json       통합 학습자료 (10단계)
 *   comparisons.json    공식 문서와 견준 결과 (13~14단계)
 *   study-guides.json   학습 설명 (15단계)
 *   references/         공식 문서 요약본 (6단계) — 다시 받으려면 인터넷이 필요합니다
 *   …
 *
 * 이것들을 다시 만들려면 인터넷을 타고 수백 번 요청해야 하고,
 * 요청 한도에 걸리면 몇 시간을 기다려야 합니다. 그래서 이쪽만 챙깁니다.
 *
 * ■ 무엇을 백업하지 않는가
 *
 *   materials/   내려받은 원본 — 다시 받을 수 있고, 너무 큽니다
 *   raw/         받아 둔 원본 캐시 — 다시 만들 수 있습니다
 *   token.json   **인증 정보** — 사본을 늘리는 것 자체가 위험합니다
 *   backups/     백업의 백업은 만들지 않습니다
 */
import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../config/paths.ts";
import { writeJsonAtomic } from "../store/atomic-write.ts";

/** 백업이 쌓이는 곳 */
export const BACKUP_DIR = join(DATA_DIR, "backups");

/**
 * 챙길 파일들.
 *
 * **없는 파일은 그냥 넘어갑니다.** 아직 만들지 않은 단계가 있을 수 있습니다.
 */
const BACKUP_FILES = [
  "index.json",
  "links.json",
  "relations.json",
  "learning.json",
  "comparisons.json",
  "study-guides.json",
  "collect-status.json",
  "doc-lookup.json",
  "failed.json",
];

/** 통째로 챙길 폴더 */
const BACKUP_DIRS = ["references"];

/** 몇 개까지 두는가 — 오래된 것부터 지웁니다 */
export const KEEP_BACKUPS = 5;

/** 백업 하나에 대한 설명 */
export interface BackupManifest {
  version: 1;
  createdAt: string;
  /** 챙긴 파일들과 크기 */
  files: Array<{ path: string; bytes: number }>;
  totalBytes: number;
  /**
   * 이 백업이 온전한가.
   *
   * 만들다 멈추면 이 값이 없습니다. **없으면 복구에 쓰지 않습니다** —
   * 반쪽짜리 백업으로 되돌리는 것은 아무것도 안 하느니만 못합니다.
   */
  complete: true;
}

/** 폴더 하나를 통째로 복사합니다 */
async function copyDirectory(from: string, to: string): Promise<Array<{ path: string; bytes: number }>> {
  const copied: Array<{ path: string; bytes: number }> = [];

  let names: string[];
  try {
    names = await readdir(from);
  } catch {
    return copied; // 없으면 넘어갑니다
  }

  await mkdir(to, { recursive: true });

  for (const name of names) {
    const source = join(from, name);
    const target = join(to, name);
    const info = await stat(source);

    if (info.isDirectory()) {
      copied.push(...(await copyDirectory(source, target)));
    } else {
      await copyFile(source, target);
      copied.push({ path: target, bytes: info.size });
    }
  }

  return copied;
}

/**
 * 백업을 만듭니다.
 *
 * @param label 이름에 덧붙일 말 (예: `before-refresh`)
 */
export async function createBackup(label?: string): Promise<BackupManifest & { name: string }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = label ? `${stamp}__${label}` : stamp;
  const target = join(BACKUP_DIR, name);

  await mkdir(target, { recursive: true });

  const files: Array<{ path: string; bytes: number }> = [];

  for (const fileName of BACKUP_FILES) {
    const source = join(DATA_DIR, fileName);
    try {
      const info = await stat(source);
      await copyFile(source, join(target, fileName));
      files.push({ path: fileName, bytes: info.size });
    } catch {
      // 아직 만들지 않은 파일은 넘어갑니다. 그것이 정상입니다.
    }
  }

  for (const directoryName of BACKUP_DIRS) {
    const copied = await copyDirectory(join(DATA_DIR, directoryName), join(target, directoryName));
    for (const entry of copied) {
      files.push({
        path: `${directoryName}/${entry.path.slice(join(target, directoryName).length + 1).replace(/\\/g, "/")}`,
        bytes: entry.bytes,
      });
    }
  }

  const manifest: BackupManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    files,
    totalBytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    // **맨 마지막에 씁니다.** 이 파일이 있어야 온전한 백업입니다.
    complete: true,
  };

  await writeJsonAtomic(join(target, "MANIFEST.json"), manifest);

  await pruneOldBackups();

  return { ...manifest, name };
}

/** 오래된 백업을 치웁니다 */
async function pruneOldBackups(): Promise<void> {
  const all = await listBackups();
  // 새것부터 정렬되어 있으므로, 뒤쪽이 오래된 것입니다.
  for (const backup of all.slice(KEEP_BACKUPS)) {
    await rm(join(BACKUP_DIR, backup.name), { recursive: true, force: true });
  }
}

/** 백업 하나의 겉모습 */
export interface BackupInfo {
  name: string;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  /** 온전한 백업인지 — 만들다 멈춘 것은 여기가 false 입니다 */
  complete: boolean;
}

/** 있는 백업들을 새것부터 알려 줍니다 */
export async function listBackups(): Promise<BackupInfo[]> {
  let names: string[];
  try {
    names = await readdir(BACKUP_DIR);
  } catch {
    return [];
  }

  const found: BackupInfo[] = [];

  for (const name of names) {
    try {
      const manifest = JSON.parse(
        await readFile(join(BACKUP_DIR, name, "MANIFEST.json"), "utf8"),
      ) as BackupManifest;

      found.push({
        name,
        createdAt: manifest.createdAt,
        fileCount: manifest.files.length,
        totalBytes: manifest.totalBytes,
        complete: manifest.complete === true,
      });
    } catch {
      // MANIFEST 가 없으면 만들다 멈춘 것입니다. 있다는 것만 알립니다.
      found.push({ name, createdAt: "", fileCount: 0, totalBytes: 0, complete: false });
    }
  }

  return found.sort((a, b) => b.name.localeCompare(a.name));
}

/** 되돌린 결과 */
export interface RestoreResult {
  name: string;
  restored: string[];
}

/**
 * 백업으로 되돌립니다.
 *
 * ■ 조심하는 것 둘
 *
 *   1. **온전한 백업만** 씁니다. `MANIFEST.json` 이 없으면 거절합니다.
 *   2. **`materials/` 는 건드리지 않습니다.** 백업에 들어 있지도 않고,
 *      되돌린다고 원본이 나아지지도 않습니다.
 *
 * @param name 되돌릴 백업 이름. 없으면 가장 최근 것.
 */
export async function restoreBackup(name?: string): Promise<RestoreResult> {
  const all = await listBackups();

  const target = name
    ? all.find((backup) => backup.name === name)
    : all.find((backup) => backup.complete);

  if (!target) {
    throw new Error(
      name
        ? `그런 이름의 백업이 없습니다: ${name}`
        : "되돌릴 수 있는 백업이 없습니다. `node src/index.ts backup` 으로 먼저 만들어 두세요.",
    );
  }

  if (!target.complete) {
    throw new Error(
      `이 백업은 만들다 멈춘 것입니다 (${target.name}). 반쪽짜리로 되돌리면 더 나빠집니다.`,
    );
  }

  const from = join(BACKUP_DIR, target.name);
  const restored: string[] = [];

  for (const fileName of BACKUP_FILES) {
    try {
      const text = await readFile(join(from, fileName), "utf8");
      // 되돌릴 때도 원자적으로 씁니다. 되돌리다 멈춰 파일이 깨지면 곤란합니다.
      await writeJsonAtomic(join(DATA_DIR, fileName), JSON.parse(text));
      restored.push(fileName);
    } catch {
      // 백업에 없던 파일은 넘어갑니다. 지금 것을 지우지는 않습니다.
    }
  }

  for (const directoryName of BACKUP_DIRS) {
    const source = join(from, directoryName);
    try {
      await stat(source);
    } catch {
      continue;
    }

    // 요약본은 통째로 갈아끼웁니다. 예전 것을 먼저 지우지 않고,
    // 새 자리에 다 옮긴 뒤 바꿔치기합니다.
    const staging = join(DATA_DIR, `${directoryName}.restoring`);
    await rm(staging, { recursive: true, force: true });
    await copyDirectory(source, staging);

    const live = join(DATA_DIR, directoryName);
    const old = join(DATA_DIR, `${directoryName}.old`);

    await rm(old, { recursive: true, force: true });
    try {
      await stat(live);
      await (await import("node:fs/promises")).rename(live, old);
    } catch {
      // 지금 것이 없으면 그냥 놓으면 됩니다.
    }
    await (await import("node:fs/promises")).rename(staging, live);
    await rm(old, { recursive: true, force: true });

    restored.push(`${directoryName}/`);
  }

  return { name: target.name, restored };
}
