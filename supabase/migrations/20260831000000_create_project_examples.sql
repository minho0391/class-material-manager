-- project_examples: 수업자료와 별개로, 외부 실전 프로젝트(Momentalk 등)의 코드 조각을
-- "학습용 실전 예제" 로 담는 격리 테이블.
--
-- ■ 왜 기존 7개 테이블에 넣지 않고 새 테이블을 두는가
--
-- 기존 파이프라인의 검증(src/sync/verify.ts)은 material_bodies·reference_documents·
-- relations 에 "원본 JSON 에 없는 DB 행" 이 있으면 실패로 판정합니다. 자동 갱신
-- (ci-refresh = refresh + sync-supabase + verify)이 매일 이 검증을 통과해야 하므로,
-- 수업자료 파이프라인이 만들지 않는 Momentalk 데이터를 그 테이블들에 섞으면 자동 갱신이
-- 깨집니다. material_metadata/learning_documents 에 넣어도 매 갱신마다 경고가 남습니다.
-- 그래서 완전히 분리된 테이블 + 분리된 CLI(sync-project-examples) + 분리된 소스 파일
-- (project-examples/*.json)로 두고, refresh/ci-refresh/verifySupabase 에는 넣지 않습니다.
--
-- ■ 저장 경계
--
-- code 는 공개 GitHub 저장소(고정 커밋)의 발췌본입니다. 강사 원본 자료가 아니므로
-- reference_documents(외부 공식 문서 발췌)·learning_documents.source_files[].code(실습 코드)
-- 와 같은 "저장 경계 안" 입니다. 원본은 손대지 않고 라인 범위만 잘라 옵니다.
--
-- ■ 기존 테이블과 같은 패턴
--
-- RLS 활성 + authenticated SELECT policy + GRANT, anon 접근 불가, 쓰기는 service_role
-- (sync-project-examples)만. sync 는 upsert(on_conflict = id)만 하고 DELETE 하지 않습니다.
-- 최소 권한 원칙에 따라 service_role 에도 delete 는 부여하지 않습니다.

create table if not exists public.project_examples (
  id text primary key,
  project text not null,
  repo_url text not null,
  repo_ref text not null,
  title text not null,
  summary text not null,
  subject text,
  concepts jsonb not null default '[]'::jsonb,
  file_path text not null,
  file_url text not null,
  language text,
  code text not null,
  line_start integer,
  line_end integer,
  related_material_ids jsonb not null default '[]'::jsonb,
  authorship_note text,
  ord integer not null default 0,
  synced_at timestamptz not null default now()
);

create index if not exists project_examples_project_idx on public.project_examples (project);
create index if not exists project_examples_subject_idx on public.project_examples (subject);
create index if not exists project_examples_ord_idx on public.project_examples (ord);

alter table public.project_examples enable row level security;

create policy "authenticated users can read project examples"
  on public.project_examples for select
  to authenticated
  using (true);

grant select on public.project_examples to authenticated;
grant select, insert, update on public.project_examples to service_role;
