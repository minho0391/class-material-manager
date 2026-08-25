/**
 * 모든 화면 앞에 서서 로그인 여부를 확인합니다.
 *
 * Next.js 16 부터 이 파일 이름이 middleware.ts 에서 proxy.ts 로 바뀌었습니다
 * (역할은 그대로입니다 — node_modules/next/dist/docs 의 안내를 따랐습니다).
 */
import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // 정적 파일(_next/static, _next/image, favicon.ico)은 로그인 여부와 상관없이 그대로 내려줍니다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
