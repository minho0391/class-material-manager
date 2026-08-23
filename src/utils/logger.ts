/**
 * 아주 단순한 로그 출력 도구.
 *
 * 외부 라이브러리(winston, pino 등)를 쓰지 않는 이유는 하나입니다.
 * 이 프로그램에서 로그가 하는 일은 "지금 뭘 하고 있는지 사람에게 보여주기" 뿐이고,
 * 그 정도는 console.log 로 충분하기 때문입니다.
 * 의존성이 적을수록 나중에 코드를 읽을 때 따라가기 쉽습니다.
 */

/** 터미널 색상 코드. 지원하지 않는 환경에서는 그냥 무시됩니다. */
const color = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
} as const;

/** 일반 정보. 진행 상황을 알릴 때 씁니다. */
export function info(message: string): void {
  console.log(message);
}

/** 작업이 성공했을 때. */
export function success(message: string): void {
  console.log(`${color.green}✓${color.reset} ${message}`);
}

/** 문제가 될 수 있지만 중단할 정도는 아닐 때. */
export function warn(message: string): void {
  console.log(`${color.yellow}!${color.reset} ${message}`);
}

/** 실패했을 때. */
export function error(message: string): void {
  console.error(`${color.red}✗${color.reset} ${message}`);
}

/** 부가 설명. 눈에 덜 띄게 흐린 색으로 출력합니다. */
export function detail(message: string): void {
  console.log(`${color.dim}  ${message}${color.reset}`);
}

/** 단계 제목. 큰 작업의 시작을 구분해 줍니다. */
export function step(message: string): void {
  console.log(`\n${color.cyan}▸ ${message}${color.reset}`);
}

/**
 * 같은 줄을 덮어쓰며 진행률을 보여줍니다. (예: "진행 120/421")
 * 마지막에는 반드시 endProgress() 를 불러 줄바꿈을 해줘야 합니다.
 */
export function progress(current: number, total: number, label = "진행"): void {
  process.stdout.write(`\r${color.dim}  ${label} ${current}/${total}${color.reset}`);
}

/** progress() 로 출력하던 줄을 끝냅니다. */
export function endProgress(): void {
  process.stdout.write("\n");
}
