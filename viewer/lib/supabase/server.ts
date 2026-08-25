/**
 * 서버(Server Component · Server Action)에서 Supabase 를 쓸 때 이 클라이언트를 씁니다.
 *
 * 쿠키에 담긴 로그인 세션을 읽고, 필요하면 새로 씁니다.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component 안에서는 쿠키를 쓸 수 없습니다.
            // 로그인 유지는 proxy.ts 가 요청마다 세션을 갱신해 주므로 여기서는 무시해도 됩니다.
          }
        },
      },
    },
  );
}
