-- 24시간 주기 백그라운드 자동 갱신을 위한 claim/lock/타임스탬프 상태.
-- 단일 행(job_name = 'material_sync')만 씁니다 — 갱신 대상이 프로젝트 전체 데이터 하나뿐이라
-- 여러 작업을 구분할 필요가 없지만, 나중에 늘어날 경우를 대비해 PK를 텍스트로 둡니다.
create table if not exists public.refresh_state (
  job_name text primary key,
  status text not null default 'idle' check (status in ('idle', 'running')),
  claim_token uuid,
  claimed_at timestamptz,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

comment on table public.refresh_state is
  '첫 접속 트리거 기반 24시간 주기 백그라운드 자동 갱신의 claim/lock 상태. 행 하나(material_sync)만 사용합니다.';

insert into public.refresh_state (job_name, status)
values ('material_sync', 'idle')
on conflict (job_name) do nothing;

-- 기존 5개 테이블과 같은 패턴: RLS는 켜 두고 정책은 만들지 않습니다.
-- anon/authenticated는 아무 행도 볼 수 없고, service_role(RLS 우회)만 접근합니다.
alter table public.refresh_state enable row level security;

-- ── claim: 원자적으로 갱신 권한을 획득합니다 ──────────────────────────
--
-- "마지막 성공 + 24시간" 이 지났고, 실패 재시도 쿨다운도 지났고,
-- 현재 idle 이거나 stale lock(오래 멈춰 있는 running) 인 경우에만 claim에 성공합니다.
-- UPDATE ... WHERE ... RETURNING 은 Postgres에서 행 단위로 원자적이므로,
-- 동시에 여러 요청이 호출해도 정확히 하나만 행을 갱신하고 claim_token을 돌려받습니다.
create or replace function public.try_claim_refresh(
  p_job_name text default 'material_sync',
  p_min_interval_seconds integer default 86400,   -- 24시간: 마지막 성공 이후 다음 갱신 가능 시점
  p_failure_cooldown_seconds integer default 3600, -- 1시간: 실패 후 재시도 쿨다운
  p_stale_lock_seconds integer default 5400        -- 90분: 이보다 오래 running 이면 죽은 작업으로 보고 회수
)
returns table (claim_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  return query
  update refresh_state r
  set status = 'running',
      claim_token = v_token,
      claimed_at = now(),
      last_attempt_at = now(),
      updated_at = now()
  where r.job_name = p_job_name
    and (
      r.status = 'idle'
      or (r.status = 'running' and r.claimed_at < now() - make_interval(secs => p_stale_lock_seconds))
    )
    and now() >= greatest(
      coalesce(r.last_success_at, '-infinity'::timestamptz) + make_interval(secs => p_min_interval_seconds),
      case
        when r.last_failure_at is not null
             and r.last_failure_at > coalesce(r.last_success_at, '-infinity'::timestamptz)
          then r.last_failure_at + make_interval(secs => p_failure_cooldown_seconds)
        else '-infinity'::timestamptz
      end
    )
  returning r.claim_token;
end;
$$;

comment on function public.try_claim_refresh is
  '24시간 자동 갱신의 원자적 claim. 조건을 만족하는 요청 중 정확히 하나만 claim_token을 받습니다.';

revoke all on function public.try_claim_refresh(text, integer, integer, integer) from public;
revoke all on function public.try_claim_refresh(text, integer, integer, integer) from anon;
revoke all on function public.try_claim_refresh(text, integer, integer, integer) from authenticated;
grant execute on function public.try_claim_refresh(text, integer, integer, integer) to service_role;

-- ── release: claim을 가진 작업만 결과를 보고할 수 있습니다 ──────────────
--
-- claim_token이 일치할 때만 갱신합니다. 그래서 stale lock을 회수해 다른 작업이
-- 이미 새로 claim한 뒤에, 죽어있던 옛 작업이 뒤늦게 결과를 보고해도 새 claim을 덮어쓰지 않습니다.
create or replace function public.release_refresh(
  p_job_name text,
  p_claim_token uuid,
  p_success boolean,
  p_error text default null
)
returns table (updated boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update refresh_state r
  set status = 'idle',
      claim_token = null,
      claimed_at = null,
      last_success_at = case when p_success then now() else r.last_success_at end,
      last_failure_at = case when not p_success then now() else r.last_failure_at end,
      last_error = case when not p_success then p_error else null end,
      updated_at = now()
  where r.job_name = p_job_name
    and r.claim_token = p_claim_token
  returning true;
end;
$$;

comment on function public.release_refresh is
  '갱신 작업 결과 보고. 성공일 때만 last_success_at을 갱신하고, 실패는 last_failure_at/last_error만 남깁니다. claim_token이 일치하는 경우에만 반영됩니다.';

revoke all on function public.release_refresh(text, uuid, boolean, text) from public;
revoke all on function public.release_refresh(text, uuid, boolean, text) from anon;
revoke all on function public.release_refresh(text, uuid, boolean, text) from authenticated;
grant execute on function public.release_refresh(text, uuid, boolean, text) to service_role;
