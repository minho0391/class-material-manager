-- 공식 문서(references) 발췌본 — data/references/**/*.md.
--
-- 이것은 강사 원본 자료가 아니라 MDN 등 외부 공식 문서를 enrich 단계가 요약·발췌한
-- 캐시입니다(enrich 한 번이면 완전히 재생성됨). 배포 환경(data/ 없음)에서도 /r 화면과
-- 본문 검색이 동작하도록 DB에 사본을 둡니다.
--
-- PK 는 (subject, slug) — 뷰어의 키 `ref:${subject}/${slug}` 및 getReference(subject, slug)
-- 와 정확히 대응합니다. slug 는 파일명에서 .md 를 뗀 값입니다.
--
-- frontmatter(YAML)는 sync 단계(신뢰된 로컬 data/, service_role)에서만 파싱해 아래 컬럼으로
-- 저장합니다 — 뷰어는 파싱된 값만 읽고 DB 데이터에 대해 YAML/gray-matter 를 실행하지 않습니다.
-- related_materials 는 본문의 "이 주제를 다룬 수업자료" 섹션에서 뽑은 제목 목록입니다.
--
-- 기존 테이블과 같은 패턴: RLS 활성 + authenticated SELECT policy + GRANT, anon 불가,
-- 쓰기는 service_role(sync)만. sync 는 upsert(on_conflict = subject,slug)만 합니다.

create table if not exists public.reference_documents (
  subject text not null,
  slug text not null,
  title text not null,
  source_url text,
  source_name text,
  language text not null default 'en',
  fetched_at text,
  mentions integer not null default 0,
  related_materials jsonb not null default '[]'::jsonb,
  body text not null,
  synced_at timestamptz not null default now(),
  primary key (subject, slug)
);

create index if not exists reference_documents_subject_idx on public.reference_documents (subject);

alter table public.reference_documents enable row level security;

create policy "authenticated users can read reference documents"
  on public.reference_documents for select
  to authenticated
  using (true);

grant select on public.reference_documents to authenticated;
