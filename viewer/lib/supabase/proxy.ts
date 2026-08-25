/**
 * 모든 요청 앞단에서 로그인 여부를 확인합니다. (viewer/proxy.ts 에서 부릅니다)
 *
 * ■ 왜 여기서 하는가
 *
 * 로그인 세션(쿠키)은 시간이 지나면 만료됩니다. 페이지를 열 때마다
 * Supabase 에 물어 새 세션으로 갈아 끼워야 로그인이 계속 유지됩니다.
 * 그 일을 각 페이지가 따로 하면 빠뜨리기 쉬우니, 요청이 들어오는 길목 한 곳(proxy)에서 합니다.
 *
 * ■ getSession() 이 아니라 getUser() 를 쓰는 이유
 *
 * getSession() 은 쿠키에 적힌 값을 그대로 믿습니다. getUser() 는 그 값을 Supabase
 * 인증 서버에 다시 물어 확인합니다. 느리지만, 위조된 쿠키를 걸러낼 수 있는 쪽은 이쪽입니다.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse(
      "Supabase 환경변수가 설정되지 않았습니다. viewer/.env.example 을 viewer/.env.local 로 복사한 뒤 값을 채우세요.",
      { status: 500 },
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
