-- 수업자료의 텍스트 본문 (data/materials/**/*.md 의 frontmatter 를 뺀 본문).
--
-- material_metadata 와 별도 테이블로 둡니다 — 본문(약 4.3MB)은 자료 상세 화면
-- (/m/[docId])에서만 필요하고, 홈·과목·목록 화면의 material_metadata 조회가 본문을
-- 함께 끌고 오지 않도록 분리했습니다.
--
-- 원본 파일(PDF/DOCX/ZIP) 자체는 여기에 담지 않습니다 — 그것은 계속 로컬 전용입니다.
-- (PROJECT_CONTEXT.md "Supabase 데이터 저장 원칙 — 저장 경계" 참고)
--
-- 기존 5개 핵심 테이블과 같은 패턴: RLS 활성 + authenticated SELECT policy + GRANT,
-- anon 접근 불가, 쓰기는 service_role(sync)만. sync 는 upsert(on_conflict = source_id)만
-- 하고 DELETE 하지 않습니다.

create table if not exists public.material_bodies (
  source_id text primary key references public.material_metadata (source_id) on delete cascade,
  body text not null,
  content_hash text,
  synced_at timestamptz not null default now()
);

alter table public.material_bodies enable row level security;

create policy "authenticated users can read material bodies"
  on public.material_bodies for select
  to authenticated
  using (true);

grant select on public.material_bodies to authenticated;
