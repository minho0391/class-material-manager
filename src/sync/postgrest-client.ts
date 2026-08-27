/**
 * Supabase PostgREST에 대한 아주 얇은 클라이언트.
 *
 * @supabase/supabase-js 를 새로 의존성에 추가하지 않고 fetch만으로 구현했습니다.
 * 이 프로젝트의 CLI는 지금까지도 필요한 API만 직접 호출해 왔고(collect/net 폴더 참고),
 * upsert 하나 하려고 SDK 전체를 끌어올 이유가 없습니다.
 */
import type { SupabaseEnv } from "./env.ts";

/** 한 번에 보낼 최대 행 수. Supabase 요청 본문 크기 제한을 안전하게 피합니다. */
const CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * rows를 table에 upsert합니다. onConflict로 지정한 컬럼(들)이 겹치면 덮어씁니다.
 *
 * 기존에 부분 이관된 데이터, 다른 시험 데이터와 충돌하지 않도록
 * 항상 upsert(merge-duplicates)만 쓰고 DELETE는 하지 않습니다.
 */
export async function upsertRows<T extends object>(
  env: SupabaseEnv,
  table: string,
  rows: T[],
  onConflict: string,
  chunkSize: number = CHUNK_SIZE,
): Promise<void> {
  if (rows.length === 0) return;

  for (const part of chunk(rows, chunkSize)) {
    const url = `${env.url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(part),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`upsert 실패 (${table}, HTTP ${res.status}): ${body}`);
    }
  }
}

/**
 * PostgREST RPC(Postgres 함수)를 호출합니다.
 *
 * claim/release 같은 원자적 DB 함수를 부를 때 씁니다. 함수가 `returns table (...)` 이면
 * 결과는 항상 배열입니다 — 조건에 안 맞아 아무 행도 갱신하지 못했으면 빈 배열이 옵니다.
 */
export async function callRpc<T = Record<string, unknown>>(
  env: SupabaseEnv,
  fnName: string,
  args: Record<string, unknown> = {},
): Promise<T[]> {
  const res = await fetch(`${env.url}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`RPC 실패 (${fnName}, HTTP ${res.status}): ${body}`);
  }

  return (await res.json()) as T[];
}

/** select 쿼리로 행을 읽습니다. 검증 단계에서 씁니다. */
export async function selectRows<T = Record<string, unknown>>(
  env: SupabaseEnv,
  table: string,
  query: string,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const url = `${env.url}/rest/v1/${table}?${query}`;
    const res = await fetch(url, {
      headers: {
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
        Range: `${offset}-${offset + pageSize - 1}`,
        "Range-Unit": "items",
      },
    });

    if (!res.ok && res.status !== 206) {
      const body = await res.text();
      throw new Error(`select 실패 (${table}, HTTP ${res.status}): ${body}`);
    }

    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}
