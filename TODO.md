# TODO

수업자료를 다시 학습·점검하기 위한 개인 학습 도구.
배경·확정 결정은 `PROJECT_CONTEXT.md`, 작업 규칙은 `CLAUDE.md` 참고.

## 완료

### agent-browser 도입
* [x] Claude Code에 agent-browser 설치·연결 — 브라우저 실행/요소 인식/클릭, localhost 개발 화면 접근 확인
* [x] 로그인 화면 초기 로딩 성능 확인 — 화면 자체 병목 없음. 개발 서버 첫 진입이 느린 건
  Next.js/Turbopack 온디맨드 컴파일 때문(운영과 무관)

### Supabase DB 현황 조사 (2026-08-26~27)
* [x] 확정 스키마 파악 — 초기 설계안(`docs/SUPABASE-SCHEMA-DESIGN.md`, 폐기)과 실제 적용본의
  테이블명이 다름. 실제 기준은 6개 테이블: `material_metadata`·`relations`·`learning_documents`·
  `comparisons`·`study_guides` + `refresh_state`. 사용자별 데이터(`user_material_state`)·관련
  RLS는 설계안에만 존재, 아직 향후 계획
* [x] 실제 DB 상태 확인 — 6개 테이블 전부 RLS 활성, 행 수 393/62/27/360/360/1.
  코드(`src/sync/*.ts`)에 없던 `synced_at` 컬럼·`relations(material_id, zip_id)` UNIQUE가
  실제 DB에 존재(동작 충돌 없음, 문서화만 누락됐던 것)
* [x] 설계 대비 차이 정리 — 발견된 실제 문제 2건:
  1. **`authenticated` SELECT GRANT 누락** — 5개 핵심 테이블에 RLS SELECT 정책은 있으나
     테이블 GRANT가 없어 정책이 무효(로그인 세션으로 붙이면 즉시 permission denied)
  2. **`create_learning_data_schema` migration 파일이 로컬에 없음** — 원격엔 적용돼 있으나
     레포에 파일이 없어 fresh clone 재현 불가
  그 외(테이블·PK·FK 5개 전부 ON DELETE CASCADE·RPC 2개 권한)는 코드·마이그레이션과 일치.
  `comparisons`/`study_guides` 355→360 증가는 자동 갱신(ci-refresh)이 실제 성공한 결과임을
  DB 증거(`refresh_state.last_success_at`, 새 행의 `generated_at` 시각)로 확인

### DB 구조 보완 (2026-08-27)
* [x] `authenticated` SELECT GRANT 추가 — migration `20260827072917_grant_authenticated_select_core_tables`
  로 5개 테이블에 `grant select` 적용. 검증: 5개 전부 `has_table_privilege('authenticated', …,
  'SELECT') = true`, `anon`은 전부 `false` 유지, RLS·기존 정책·`service_role` 권한 변화 없음,
  `set local role authenticated` 실제 SELECT 정상(393/62/27/360/360)
* [x] 누락 migration 파일 복원 — 실제 원격 스키마를 직접 조회해
  `20260826024724_create_learning_data_schema.sql` 작성(컬럼·PK·FK·CHECK·UNIQUE·`synced_at`·
  인덱스 14개·RLS·SELECT 정책 반영). **로컬 파일만 작성, 원격엔 재실행 안 함.**
  `supabase migration list` local↔remote 4개 버전 완전 일치 확인

### 로컬 개발 환경 검증 (2026-08-27)
* [x] Docker/Supabase 로컬 스택 검증 — `npx supabase start` 성공, migration 4개 fresh DB에
  순서대로 적용(에러 없음), `migration list` local↔remote 일치, 6개 테이블 정확히 생성.
  복원한 `create_learning_data_schema.sql`이 원격 이력을 정확히 재현함을 확인

### 뷰어 ↔ Supabase DB 하이브리드 연결 (2026-08-27, commit 40707bd)
* [x] 구조화 데이터 DB 우선 읽기 — 사용자 결정: Vercel 배포가 목표, 이번 범위는 구조화
  데이터만 DB 우선(본문·실습코드·references는 로컬 파일 유지). Codex 설계·구현 리뷰 반영
  * 신규 `viewer/lib/db-map.ts`(순수 매퍼: DB 행 → 기존 인터페이스, `src/sync/build-*.ts`의
    역변환), `viewer/lib/db.ts`(SSR 클라이언트 anon+세션으로 select만, 읽기 전용)
  * `viewer/lib/data.ts`: `resolveSource()`가 `material_metadata`를 30초에 1회 읽어 DB/파일을
    한 번에 결정(데이터셋 세대 불일치 방지). 행 0건·예외·미설정이면 파일 폴백.
    `loadAll`/`loadLearning`/`loadComparisons`/`loadStudy`에 DB 분기 추가.
    `generatedAt`은 `max(generated_at)`으로 계산. DB에서 온 `file_path`도 `safeDataPath()`로
    `data/` 밖 접근 차단
  * `viewer/app/m/[docId]/page.tsx`: 본문 파일 없으면 404 대신 메타데이터 화면
  * `viewer/app/layout.tsx`: `force-dynamic` — 모든 화면 요청 시점 렌더
* [x] 저장 데이터 우선 즉시 표시 — 뷰어가 DB를 우선 읽고 자동 갱신 완료를 기다리지 않고 즉시
  렌더(갱신 트리거는 `viewer/proxy.ts`의 `after()`, commit 0f6aa39)
* [x] 갱신 후 다음 요청부터 새 데이터 — DB 우선 + 데이터셋별 30초 TTL 캐시. sync가 DB를
  갱신하면 늦어도 30초 뒤 요청부터 반영(자동 갱신 주기 24h 대비 무의미한 지연)

### 검증 (2026-08-27)
* [x] 자동화 — 루트/뷰어 typecheck, 루트 test 187/187, `next build`, Playwright E2E 14/14.
  매퍼를 실제 원격 행으로 통과(393/360/360/27/84, 예외 없음), `safeDataPath` traversal 9케이스
* [x] agent-browser 사용자 흐름 (전용 테스트 계정 — `viewer/.env.local`의
  `E2E_SUPABASE_EMAIL`/`E2E_SUPABASE_PASSWORD`를 `e2e/auth.setup.ts`가 읽어 로그인)
  * 미로그인: `/`→`/login` 리다이렉트, 로그인 폼, 잘못된 로그인 오류 정상
  * 인증 후: `/`·`/compare`·`/study`·`/learn`·`/s`·`/m`·`/search` 전부 DB 데이터로 렌더,
    `/m`에서 DB 메타 + 로컬 본문 맞물림, 로그아웃 정상
  * 배포 시나리오(로컬 `data/` 임시 숨김 → DB만): 전 화면 정상, `/m`은 메타데이터 화면,
    `/search`는 제목/메타 검색으로 degrade, 공식문서 0건, 서버 로그 폴백·에러 0건.
    검증 후 `data/` 원상 복원
  * `data/` 숨긴 상태에서도 전량 렌더 → DB가 실제 소스임을 확정

### Momentalk 실전 예제 추가 (2026-08-31)

* [x] **학습용 실전 예제(project_examples) 추가** — 수업자료 파이프라인과 **완전히 분리된**
  격리 테이블로 Momentalk(`minho0391/est-fe-3rd-project`) 코드 발췌를 학습 자료로 연결.
  `PROJECT_CONTEXT.md` "학습용 실전 예제(project_examples)" 절 참고.
  * 신규 migration `20260831000000_create_project_examples.sql` (테이블 1개 + RLS + `authenticated`
    SELECT policy·GRANT + `service_role` INSERT/UPDATE, DELETE 없음). **로컬·원격 둘 다 적용 완료.**
  * 신규 소스 `project-examples/momentalk.json` (저장소에 커밋, `data/` 아님) — 예제 11건,
    코드는 고정 커밋 `004b4e85`에서 라인 범위만 **원문 그대로** 발췌, `file_url`은 커밋 고정
    permalink, `authorship_note`는 README 명시 역할(기능 영역 단위)만.
  * 신규 CLI `node src/index.ts sync-project-examples` (`src/sync/build-project-examples.ts`·
    `project-examples-runner.ts`) — upsert 전용. **`refresh`/`ci-refresh`/`sync-supabase`/
    `verifySupabase()`에 넣지 않음** — 자동 갱신은 이 테이블을 모름.
  * 뷰어: 신규 `/examples` 목록·상세(`viewer/lib/projectExamples.ts`, DB 우선·파일 폴백),
    nav 항목, `/m/[docId]` 하단 "관련 실전 예제" 영역(연결된 예제 있을 때만). 기존 학습 흐름
    무변경.
  * 검증: 루트 typecheck·194 tests·`security-check --skip-data`, 뷰어 typecheck·`next build`,
    로컬 Supabase migration+sync green·idempotent·anon SELECT 거부, **기존 `sync-supabase`
    verify 로컬·원격 모두 green(EXIT 0), 기존 7테이블+`refresh_state` 행 수 불변**
    (393/393/62/27/355/355/203/1), Playwright E2E 18/18(원격 DB 읽기 포함), agent-browser
    시각 확인, Codex 독립 리뷰(Major 1건 — `mailto:` 스킴 허용 → http(s) 전용으로 수정, 재검증).
  * 원격 백필: `project_examples` 11행(168 kB). Vercel 배포 시 `NEXT_PUBLIC_SUPABASE_*`만
    있으면 자동으로 DB에서 읽음.

## 다음 작업

* [x] **본문·실습 코드 원문·references의 DB 이관 (방안 A)** — 로컬 구현·검증·Codex 리뷰·
  **원격 적용·백필까지 완료** (2026-08-27). `PROJECT_CONTEXT.md` "저장 경계 정밀화" +
  "텍스트 본문·references 이관" 절 참고.
  * 신규: migration 3개(`20260827211600_create_material_bodies`·`20260827211700_create_reference_documents`·
    `20260827213100_grant_service_role_core_tables`), `src/sync/build-material-bodies.ts`·
    `build-references.ts`·`frontmatter.ts`, `viewer/lib/url.ts`. 수정: `viewer/lib/{data,db,db-map}.ts`,
    `viewer/components/{Markdown,StudyCard}.tsx`, `viewer/app/{compare,m,r}` href 가드,
    `src/sync/{sync-runner,verify,build-learning-documents,postgrest-client}.ts`, `src/index.ts`.
  * Codex 리뷰 반영: `service_role` delete 권한 제거(least priv), `verify.ts`가
    `material_bodies`/`reference_documents`의 stale row를 실패로 감지, `db.ts:selectAll`
    range 페이지네이션, `Markdown.tsx` `safeMarkdownUrl` urlTransform.
  * 원격 적용 전 정리: plan A로 `refresh` 실행 결과 comparisons/study_guides가 355건(원격
    360과 5건 차이). 그 5건(`gap:align-items`·`gap:flex-direction`·`gap:grid-template-columns`·
    `gap:grid-template-rows`·`gap:justify-content` + 대응 study_guides 5건)은 2026-08-26
    ci-refresh 당시 references 문서 부재로 생긴 임시 lookup fallback이 정식 문서로 대체된
    obsolete 행. 백업(`scratchpad/remote-stale-rows-backup-20260827.json`) 후 원격에서
    삭제(FK CASCADE) → 원격·로컬 ID 집합 완전 일치(355/355) 확인.
  * 원격 백필 결과: `material_metadata` 393 · `material_bodies` **393** · `relations` 62 ·
    `learning_documents` 27(실습 코드 **109/109**) · `comparisons` 355 · `study_guides` 355 ·
    `reference_documents` **203**. `sync-supabase` verify **green(EXIT 0)**, FK 고아행 0,
    frontmatter 잔존 0, 잘못된 URL 스킴 0. DB public 테이블 ~7.2MB(무료 500MB의 1.4%).
  * 원격 로그인 세션 smoke(`data/` 숨김 = 배포 시나리오): `/m` 본문·실습 코드 전문,
    `/r` references, `/search` 본문·코드 검색, `/compare`·`/study` 전부 원격 DB로 정상 렌더.
* [ ] **하루 첫 접속 자동 갱신 — 자격증명 등록 후 실동작 검증** — 트리거·claim/lock·24h
  주기는 commit 0f6aa39에서 구현·검증 완료. GitHub Actions/Vercel 자격증명 6개 등록은
  사용자 몫(`PROJECT_CONTEXT.md` "첫 접속 트리거" 절). 등록 후 GitHub Actions 실행까지
  end-to-end 확인 필요
* [ ] **Vercel 배포 준비** — Vercel 프로젝트 `minho-lee/class-material-manager`
  (rootDir=`viewer`) 확인됨. **DB 측 준비 완료**: 원격 migration 7개 적용됨, `sync-supabase`
  verify green, 7개 테이블 백필 완료. 남은 것: Vercel 환경변수
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` 등록(없으면 조용히 파일
  폴백 → `data/` 없는 배포에선 빈 화면), 실제 배포, 배포본 `/m`·`/r`·검색 smoke.

## 나중에 / 미결 판단

* [ ] **refresh 수집 소프트 실패 조사 (별도 진행)** — 2026-08-27 `refresh` 실행 시 Google
  문서 18건 + 파일 42건이 재수집 실패(403/404 추정). 파이프라인은 기존 로컬 사본을 유지하고
  넘어갔고(`index.json` 393 유지, `failed.json` 빈 상태, `collect-status` = SUCCESS),
  이번 DB 이관·백필 유효성에는 영향 없음(references·비교 분석은 로컬 파일 기반, 전량 정상).
  다만 ~60건의 원본이 Drive 최신본과 어긋날 수 있음. 원인(계정 재공유 필요/문서 삭제/토큰
  스코프)은 이번 작업 범위 밖 — 별도로 재인증·재공유 점검 후 `refresh` 재실행.
* [ ] **stale DB row 정리 수단** — sync는 upsert만 하고 DELETE가 없음(프로젝트 원칙).
  소스 `.md`/reference가 삭제되면 `material_bodies`/`reference_documents`에 stale row가
  남고, 뷰어가 DB 우선이라 계속 노출·검색됨. 현재는 `verify.ts`가 이 두 테이블의 stale
  행을 **실패로 감지**(수동 `DELETE` 안내). 향후 `sync-supabase --prune` 같은 안전한
  정리 명령 검토 (Codex Major 1·2 지적). 기존 5개 테이블도 같은 특성이나 warn만.
* [ ] **검색 본문 fetch 최적화** — DB 모드에서 검색 haystack이 콜드 캐시(30초)마다
  `material_bodies` 전량(~4MB)을 fetch. TTL 만료 직후 동시 요청은 중복 fetch. 사용자
  방침대로 현행 유지, 실사용 성능 문제 확인 시 in-flight dedupe 또는 서버 사이드 검색으로
  전환 (Codex Minor 2).
* [ ] **로그인 직후 30초 빈 화면 가능성** — 첫 로그인 요청이 세션 쿠키 확정보다 앞서면
  `resolveSource`가 "file"로 캐시됨 → `data/` 없는 배포에선 최대 30초 빈 콘텐츠 후 자동
  복구. 실제 브라우저는 redirect가 쿠키를 실어 보내 거의 안 걸림. 재현 시 `resolveSource`
  의 auth-실패와 미설정을 구분하도록 보완 검토.
* [ ] **본문·코드 크기 상한, `material_metadata.extra` 미매핑 필드** — 현재 상한 없음
  (최대 본문 236KB, 코드 8.5KB — 정상 범위). future `IndexEntry`에 대형 원문 필드가
  추가되면 `extra`로 DB에 들어갈 수 있음(기존 sync 특성). 스키마 확장 시 재검토 (Codex Section C).
* [~] **`study_guides.details.oldCode` 원칙 확인** — 코드 조각 DB 저장은 "저장 경계
  정밀화(2026-08-27)"로 명시 허용됨 → 해소. (남은 판단: 조각이 아닌 전체 파일 저장도
  `learning_documents.source_files[].code`로 이번에 포함됨 — 이것도 경계 안)
* [ ] **하이드레이션 경고** — 모든 화면에 "A tree hydrated but some attributes … didn't match"
  1건. `git stash`로 원본 코드에서도 동일 재현 → 이번 작업 이전부터 존재. MUI
  `InitColorSchemeScript`(`attribute="class"`)가 하이드레이션 전 `<html>` class를 바꾸는데
  `suppressHydrationWarning`이 한 단계만 덮는 문제로 추정. 별도 조사
* [ ] favicon.ico 404 처리
* [ ] 로그인 이후 실제 데이터 화면 성능 점검 (DB 읽기 경로 추가 후 재점검)
* [ ] 프로덕션 빌드에서 최종 성능 점검

## TODO.md 관리 규칙

* 새로운 작업이 생기면 적절한 위치에 추가한다.
* 작업이 실제로 완료된 경우 즉시 체크한다.
* 작업 중 발견된 후속 작업도 기록한다.
* 이미 완료된 작업을 임의로 미완료 상태로 되돌리지 않는다.
* 구현 순서나 우선순위가 변경되면 TODO.md에도 반영한다.
* TODO.md의 내용은 항상 실제 프로젝트 상태와 일치하도록 유지한다.
* 추측만으로 작업을 완료 처리하지 않는다.
* 코드 수정이나 검증을 통해 완료가 확인된 작업만 체크한다.
