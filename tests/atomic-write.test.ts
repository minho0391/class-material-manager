/**
 * 18단계 — **쓰다 멈춰도 멀쩡하던 파일이 망가지지 않는지** 봅니다.
 *
 * ■ 왜 중요한가
 *
 * `data/index.json` 은 1.2MB 짜리 자료 카탈로그입니다.
 * 쓰는 도중 멈춰 잘린 JSON 이 남으면, 읽는 쪽은 `JSON.parse` 실패를
 * 조용히 `null` 로 바꿉니다. 그러면 프로그램은 "자료가 하나도 없네" 하고
 * 처음부터 다시 만듭니다 — **자료 393건이 사라진 것처럼 보입니다.**
 *
 * 실은 파일 하나가 깨진 것뿐입니다. 그 일을 막으려는 것이 여기입니다.
 */
import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeBytesAtomic, writeFileAtomic, writeJsonAtomic } from "../src/store/atomic-write.ts";

const madeDirs: string[] = [];

/** 시험용 빈 폴더 하나 — 끝나면 치웁니다 */
async function scratch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cmm-atomic-"));
  madeDirs.push(directory);
  return directory;
}

afterEach(async () => {
  while (madeDirs.length > 0) {
    const directory = madeDirs.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

describe("원자적 쓰기", () => {
  it("글을 제대로 씁니다", async () => {
    const directory = await scratch();
    const path = join(directory, "a.txt");

    await writeFileAtomic(path, "안녕");

    assert.equal(await readFile(path, "utf8"), "안녕");
  });

  it("JSON 을 제대로 씁니다", async () => {
    const directory = await scratch();
    const path = join(directory, "a.json");

    await writeJsonAtomic(path, { version: 1, items: [1, 2, 3] });

    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { version: 1, items: [1, 2, 3] });
  });

  it("바이너리도 제대로 씁니다", async () => {
    const directory = await scratch();
    const path = join(directory, "a.bin");

    await writeBytesAtomic(path, new Uint8Array([1, 2, 255]));

    const read = await readFile(path);
    assert.deepEqual([...read], [1, 2, 255]);
  });

  it("있던 파일을 갈아끼웁니다", async () => {
    const directory = await scratch();
    const path = join(directory, "a.json");

    await writeFile(path, "예전 내용", "utf8");
    await writeJsonAtomic(path, { new: true });

    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { new: true });
  });

  it("임시 파일을 남기지 않습니다", async () => {
    const directory = await scratch();

    await writeJsonAtomic(join(directory, "a.json"), { a: 1 });

    const files = await readdir(directory);
    assert.deepEqual(files, ["a.json"], `임시 파일이 남았습니다: ${files.join(", ")}`);
  });

  it("JSON 으로 만들 수 없는 값이면 **파일을 건드리지도 않습니다**", async () => {
    const directory = await scratch();
    const path = join(directory, "a.json");

    await writeFile(path, '{"멀쩡한":"내용"}', "utf8");

    // 순환 참조 — JSON.stringify 가 던집니다.
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await assert.rejects(() => writeJsonAtomic(path, circular));

    // 멀쩡하던 파일이 그대로 있어야 합니다. 이것이 이 시험의 핵심입니다.
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { 멀쩡한: "내용" });
    assert.deepEqual(await readdir(directory), ["a.json"], "임시 파일도 남지 않아야 합니다");
  });

  it("쓰지 못하는 자리면 실패를 그대로 알립니다 — 조용히 넘어가지 않습니다", async () => {
    const directory = await scratch();
    // 없는 하위 폴더 — mkdir 를 하지 않았으므로 쓸 수 없습니다.
    const path = join(directory, "없는폴더", "a.json");

    await assert.rejects(() => writeJsonAtomic(path, { a: 1 }));
  });
});
