-- sync-supabase(서버, service_role)가 7개 데이터 테이블을 읽고 upsert 하려면 service_role 에
-- 테이블 권한이 있어야 합니다.
--
-- 원격 Supabase 에서는 이 테이블들이 콘솔에서 만들어질 때 service_role 권한이 자동으로
-- 부여됐지만, 사후 복원된 20260826024724_create_learning_data_schema.sql 과 본 이관에서 새로
-- 만든 material_bodies/reference_documents 마이그레이션에는 그 GRANT 가 빠져 있어, fresh
-- clone 로컬 스택에서는 `sync-supabase` 가 "permission denied" 로 실패합니다.
--
-- 이 마이그레이션이 로컬/원격 권한을 맞춥니다. 원격에는 이미 부여돼 있어 사실상 no-op 이고,
-- 로컬에서는 sync 가 정상 동작하게 됩니다. anon/authenticated 권한은 건드리지 않습니다
-- (기존 authenticated SELECT policy·GRANT 그대로, anon 여전히 불가).
--
-- sync(sync-runner.ts)는 upsert(=insert+update)와 select 만 씁니다 — DELETE 경로가 없습니다.
-- 최소 권한 원칙에 따라 delete 는 부여하지 않습니다. 나중에 stale row 정리가 필요해지면
-- 그때 좁은 범위(RPC 또는 명시적 명령)로 별도 부여합니다.

grant select, insert, update on public.material_metadata to service_role;
grant select, insert, update on public.material_bodies to service_role;
grant select, insert, update on public.relations to service_role;
grant select, insert, update on public.learning_documents to service_role;
grant select, insert, update on public.comparisons to service_role;
grant select, insert, update on public.study_guides to service_role;
grant select, insert, update on public.reference_documents to service_role;
