/**
 * Supabase 이관에 필요한 환경변수를 읽습니다.
 *
 * URL은 뷰어가 이미 쓰는 NEXT_PUBLIC_SUPABASE_URL을 그대로 재사용합니다
 * (같은 프로젝트를 가리키므로 값을 새로 만들 이유가 없습니다).
 * 쓰기 권한이 필요한 service_role 키만 추가로 요구합니다 — anon 키로는
 * RLS 이전에 GRANT 자체가 없어 이관 쓰기가 불가능합니다.
 */
export interface SupabaseEnv {
  url: string;
  serviceRoleKey: string;
}

export function loadSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new Error(
      `다음 환경변수가 없습니다: ${missing.join(", ")}\n` +
        `node --env-file=.env.local --env-file=viewer/.env.local src/index.ts sync-supabase 로 실행하세요.`,
    );
  }

  return { url: url!, serviceRoleKey: serviceRoleKey! };
}
