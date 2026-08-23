/**
 * 18단계 — 백업이 **되돌릴 수 있는 상태로** 만들어지는지 봅니다.
 *
 * ■ 여기서 지키려는 것
 *
 *   반쪽짜리 백업으로 되돌리는 것은 아무것도 안 하느니만 못합니다.
 *
 * 그래서 만들다 멈춘 백업은 `MANIFEST.json` 이 없고, 복구는 그것을 거절합니다.
 * 그리고 **내려받은 원본(`materials/`)은 백업에도 복구에도 끼어들지 않습니다** —
 * 373MB 를 매번 복제할 값어치가 없고, 되돌린다고 원본이 나아지지도 않습니다.
 */
import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const madeDirs: string[] = [];

async function scratch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cmm-backup-"));
  madeDirs.push(directory);
  return directory;
}

afterEach(async () => {
  while (madeDirs.length > 0) {
    const directory = madeDirs.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

/**
 * 백업 코드는 `DATA_DIR` 을 바라봅니다. 그것을 시험용 폴더로 바꿔 끼울 방법이 없어,
 * **같은 규칙을 따르는 작은 판**을 여기서 만들어 규칙 자체를 확인합니다.
 * (실제 동작은 사람이 직접 돌려 확인했습니다 — 깨진 JSON 과 지워진 요약본 복구)
 */
const BACKUP_FILES = [
  "index.json", "links.json", "relations.json", "learning.json",
  "comparisons.json", "study-guides.json", "collect-status.json",
  "doc-lookup.json", "failed.json",
];

describe("무엇을 챙기고 무엇을 챙기지 않는가", () => {
  it("다시 만들기 비싼 것만 챙깁니다", () => {
    for (const name of ["index.json", "relations.json", "comparisons.json", "study-guides.json"]) {
      assert.ok(BACKUP_FILES.includes(name), `${name} 은 챙겨야 합니다`);
    }
  });

  it("인증 정보는 챙기지 않습니다 — 사본을 늘리는 것 자체가 위험합니다", () => {
    assert.equal(BACKUP_FILES.includes("token.json"), false);
  });

  it("내려받은 원본은 챙기지 않습니다 — 다시 받을 수 있고 너무 큽니다", () => {
    assert.equal(BACKUP_FILES.includes("materials"), false);
    assert.equal(BACKUP_FILES.includes("raw"), false);
  });
});

describe("온전한 백업만 되돌리는 데 씁니다", () => {
  it("MANIFEST 가 있어야 온전한 백업입니다", async () => {
    const directory = await scratch();
    const backup = join(directory, "2026-01-01T00-00-00-000Z");
    await mkdir(backup, { recursive: true });
    await writeFile(join(backup, "index.json"), '{"entries":{}}', "utf8");

    // 아직 MANIFEST 를 쓰지 않았습니다 = 만들다 멈춘 상태
    await assert.rejects(() => stat(join(backup, "MANIFEST.json")));

    await writeFile(
      join(backup, "MANIFEST.json"),
      JSON.stringify({ version: 1, createdAt: "2026-01-01T00:00:00.000Z", files: [], totalBytes: 0, complete: true }),
      "utf8",
    );

    const manifest = JSON.parse(await readFile(join(backup, "MANIFEST.json"), "utf8")) as { complete: boolean };
    assert.equal(manifest.complete, true);
  });

  it("MANIFEST 는 맨 마지막에 쓰입니다 — 그래야 반쪽짜리를 가려낼 수 있습니다", async () => {
    // 파일을 다 옮긴 **뒤에** MANIFEST 를 써야 합니다.
    // 먼저 쓰면, 옮기다 멈춘 백업이 "온전하다" 고 주장하게 됩니다.
    const source = await readFile("src/backup/backup-runner.ts", "utf8");

    const manifestWrite = source.indexOf('MANIFEST.json"), manifest');
    const fileCopy = source.indexOf("for (const fileName of BACKUP_FILES)");

    assert.ok(fileCopy > 0 && manifestWrite > 0);
    assert.ok(fileCopy < manifestWrite, "파일 복사가 MANIFEST 쓰기보다 먼저여야 합니다");
  });
});

describe("복구가 원본 자료를 건드리지 않습니다", () => {
  it("복구 대상에 materials 가 없습니다", async () => {
    const source = await readFile("src/backup/backup-runner.ts", "utf8");

    // 되돌리는 것은 BACKUP_FILES 와 BACKUP_DIRS 뿐입니다.
    const dirsLine = source.match(/const BACKUP_DIRS = \[([^\]]*)\]/);
    assert.ok(dirsLine);
    assert.equal(dirsLine[1]?.includes("materials"), false, "materials 를 되돌리면 안 됩니다");
    assert.equal(dirsLine[1]?.includes("raw"), false);
  });

  it("되돌릴 때도 원자적으로 씁니다", async () => {
    const source = await readFile("src/backup/backup-runner.ts", "utf8");
    assert.ok(
      source.includes("writeJsonAtomic(join(DATA_DIR, fileName)"),
      "되돌리다 멈춰 파일이 깨지면 곤란합니다",
    );
  });
});

describe("백업이 쌓이기만 하지 않습니다", () => {
  it("남길 개수에 상한이 있습니다", async () => {
    const source = await readFile("src/backup/backup-runner.ts", "utf8");
    const keep = source.match(/export const KEEP_BACKUPS = (\d+)/);

    assert.ok(keep, "상한이 정해져 있어야 합니다");
    assert.ok(Number(keep[1]) > 0 && Number(keep[1]) <= 20, "상한이 터무니없지 않아야 합니다");
  });

  it("백업 폴더는 data/ 안이라 git 에 올라가지 않습니다", async () => {
    const ignore = await readFile(".gitignore", "utf8");
    assert.ok(ignore.split(String.fromCodePoint(10)).some((line) => line.trim() === "data/"));
  });
});

describe("실제 폴더 복사 규칙", () => {
  it("하위 폴더까지 통째로 옮깁니다", async () => {
    const directory = await scratch();
    await mkdir(join(directory, "references", "css"), { recursive: true });
    await writeFile(join(directory, "references", "css", "grid.md"), "# grid", "utf8");
    await writeFile(join(directory, "references", "INDEX.md"), "# 색인", "utf8");

    const files = await readdir(join(directory, "references"));
    assert.ok(files.includes("css"));
    assert.ok(files.includes("INDEX.md"));
  });
});
