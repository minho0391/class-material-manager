/**
 * project-examples/*.json → Supabase `project_examples` 테이블 upsert + 대조 검증.
 *
 * ■ 수업자료 파이프라인과 분리
 *
 * 이 명령은 `refresh` / `ci-refresh` / `sync-supabase` / `verifySupabase` 어디에도
 * 포함되지 않습니다. 하루 첫 접속 자동 갱신은 이 테이블을 모릅니다. 예제를 추가·수정한
 * 뒤 사람이 직접 `node src/index.ts sync-project-examples` 를 실행합니다.
 *
 * ■ upsert 전용
 *
 * on_conflict = id 로 merge 만 합니다. DELETE 하지 않습니다. 소스 JSON 에서 예제를
 * 지우면 DB 에 stale 행이 남으므로, 검증이 그 사실을 경고로 알려 줍니다.
 */
import { loadIndex } from "../store/index-store.ts";
import { loadSupabaseEnv } from "./env.ts";
import { selectRows, upsertRows } from "./postgrest-client.ts";
import { buildProjectExampleRows } from "./build-project-examples.ts";
import * as log from "../utils/logger.ts";

export interface ProjectExamplesSyncReport {
  sourceCount: number;
  dbCount: number;
  /** 소스에 있는데 DB 에 없는 id */
  missingInDb: string[];
  /** DB 에만 있는 id (소스에서 지워진 예제 — 수동 정리 필요) */
  staleInDb: string[];
  warnings: string[];
  sourceFiles: string[];
}

/**
 * project-examples 를 Supabase 로 upsert 하고 곧바로 대조 검증합니다.
 *
 * @returns 검증 결과. `missingInDb` 또는 `staleInDb` 가 있으면 호출부가 실패로 처리합니다.
 */
export async function syncProjectExamples(): Promise<ProjectExamplesSyncReport> {
  const env = loadSupabaseEnv();

  // related_material_ids 대조용. 로컬 data/ 가 없으면(배포용 clone 등) 빈 세트 대신 null 로
  // 넘겨 대조를 건너뜁니다.
  let knownMaterialIds: Set<string> | null = null;
  try {
    const index = await loadIndex();
    const ids = Object.keys(index.entries);
    if (ids.length > 0) knownMaterialIds = new Set(ids);
  } catch {
    knownMaterialIds = null;
  }

  const { rows, warnings, sourceFiles } = await buildProjectExampleRows({ knownMaterialIds });

  log.step(`project-examples ${rows.length}건을 Supabase 로 upsert 합니다`);
  await upsertRows(env, "project_examples", rows, "id");

  const dbRows = await selectRows<{ id: string }>(env, "project_examples", "select=id");
  const dbIds = new Set(dbRows.map((r) => r.id));
  const sourceIds = new Set(rows.map((r) => r.id));

  return {
    sourceCount: rows.length,
    dbCount: dbIds.size,
    missingInDb: [...sourceIds].filter((id) => !dbIds.has(id)),
    staleInDb: [...dbIds].filter((id) => !sourceIds.has(id)),
    warnings,
    sourceFiles,
  };
}

/** 검증 결과를 사람이 읽을 수 있게 찍고, 문제가 있으면 true 를 돌려줍니다. */
export function printProjectExamplesReport(report: ProjectExamplesSyncReport): boolean {
  log.info("");
  log.detail(`소스 파일          ${report.sourceFiles.join(", ")}`);
  log.detail(`소스 예제          ${report.sourceCount}건`);
  log.detail(`DB project_examples ${report.dbCount}건`);

  if (report.warnings.length > 0) {
    log.warn(`경고 ${report.warnings.length}건:`);
    for (const w of report.warnings) log.detail(`  · ${w}`);
  }

  let hasProblem = false;

  if (report.missingInDb.length > 0) {
    hasProblem = true;
    log.error(`업로드 누락 ${report.missingInDb.length}건: ${report.missingInDb.slice(0, 10).join(", ")}`);
  } else {
    log.success("소스의 모든 예제가 DB 에 있습니다");
  }

  if (report.staleInDb.length > 0) {
    hasProblem = true;
    log.error(
      `DB 에만 있는 stale 행 ${report.staleInDb.length}건: ${report.staleInDb.slice(0, 10).join(", ")}`,
    );
    log.detail("  소스 JSON 에서 지운 예제입니다. 수동: delete from public.project_examples where id in (...)");
  } else {
    log.success("DB 에 stale 행이 없습니다");
  }

  log.info("");
  if (hasProblem) log.error("project-examples 동기화에서 문제를 찾았습니다.");
  else log.success("project-examples 동기화 완료 — 소스와 DB 가 일치합니다.");
  return hasProblem;
}
