/**
 * 모든 화면 앞에 서서 로그인 여부를 확인합니다.
 *
 * Next.js 16 부터 이 파일 이름이 middleware.ts 에서 proxy.ts 로 바뀌었습니다
 * (역할은 그대로입니다 — node_modules/next/dist/docs 의 안내를 따랐습니다).
 */
import { after, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";
import { checkAndTriggerRefresh } from "@/lib/refresh/trigger";

export async function proxy(request: NextRequest) {
  // 정적 페이지(/, /learn, /login 등)는 빌드 시점에 한 번만 만들어져 매 요청마다
  // 서버 코드를 다시 실행하지 않습니다. 그래서 24시간 자동 갱신 감지는 모든 요청이
  // 실제로 거치는 이 미들웨어에서 합니다. 응답을 보낸 뒤(after)에 실행되므로
  // 화면 표시를 기다리게 하지 않습니다.
  after(() => checkAndTriggerRefresh());

  return updateSession(request);
}

export const config = {
  // 정적 파일(_next/static, _next/image, favicon.ico)은 로그인 여부와 상관없이 그대로 내려줍니다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
