/**
 * 파일을 **다 쓴 뒤에 바꿔치기** 하는 자리.
 *
 * ■ 왜 필요한가
 *
 * 그냥 덮어쓰면 쓰는 도중에 멈췄을 때 **반쯤 쓰인 파일**이 남습니다.
 * 이 프로그램에서 그것이 특히 나쁜 이유가 있습니다 —
 *
 *   `data/index.json` 은 1.2MB 짜리 자료 카탈로그입니다.
 *   쓰는 도중 Ctrl+C 를 누르면 잘린 JSON 이 남습니다.
 *   그런데 읽는 쪽은 `JSON.parse` 실패를 **조용히 `null` 로** 바꿉니다.
 *   그러면 프로그램은 "자료가 하나도 없네" 하고 처음부터 다시 만듭니다.
 *   자료 393건이 사라진 것처럼 보이는데, 실은 파일 하나가 깨진 것뿐입니다.
 *
 * ■ 어떻게 막는가
 *
 * 옆에 임시 파일로 다 쓴 다음 **이름만 바꿉니다.**
 * 이름 바꾸기는 파일시스템이 한 번에 끝내 주므로,
 * 파일은 언제나 **예전 것 아니면 새것**이지 그 중간이 되지 않습니다.
 *
 * ■ 완벽하지는 않습니다
 *
 * 디스크 캐시까지 강제로 비우지는 않습니다(`fsync`).
 * 전원이 갑자기 나가는 경우까지 막으려면 그것이 필요하지만,
 * 그러면 매 쓰기가 눈에 띄게 느려집니다.
 * 여기서 막으려는 것은 **프로그램이 중간에 멈추는 흔한 경우**입니다.
 */
import { rename, unlink, writeFile } from "node:fs/promises";

/**
 * 글을 원자적으로 씁니다.
 *
 * @param path    최종 파일 자리
 * @param content 쓸 내용
 */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const temporary = `${path}.tmp`;

  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } catch (error) {
    // 임시 파일이 남으면 다음 실행에 헷갈립니다. 치우고 실패를 그대로 올려 보냅니다.
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

/** 바이너리(내려받은 원본 파일 등)를 원자적으로 씁니다. */
export async function writeBytesAtomic(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.tmp`;

  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

/**
 * JSON 을 원자적으로 씁니다.
 *
 * `JSON.stringify` 를 **먼저** 끝내고 그다음에 파일을 건드립니다.
 * 값에 순환 참조 같은 문제가 있으면 파일을 열기도 전에 실패하므로,
 * 멀쩡하던 파일이 그 때문에 망가지는 일이 없습니다.
 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value, null, 2);
  await writeFileAtomic(path, text);
}
