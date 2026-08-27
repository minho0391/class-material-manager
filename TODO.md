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

## 다음 작업

* [ ] **본문·실습 코드 원문·공식문서(references)의 DB/Storage 이관** — 현재 하이브리드에서
  이것들은 로컬 파일 전용이라, `data/`가 없는 Vercel 배포에선 자료 본문·실습 코드·`/r`
  화면·본문 검색이 비거나 degrade됨. 배포 뷰어 완전 동작에 필요. 진행 전 "원본 본문
  미저장 원칙"(`PROJECT_CONTEXT.md`) 개정 여부를 사용자와 확정
* [ ] **하루 첫 접속 자동 갱신 — 자격증명 등록 후 실동작 검증** — 트리거·claim/lock·24h
  주기는 commit 0f6aa39에서 구현·검증 완료. GitHub Actions/Vercel 자격증명 6개 등록은
  사용자 몫(`PROJECT_CONTEXT.md` "첫 접속 트리거" 절). 등록 후 GitHub Actions 실행까지
  end-to-end 확인 필요
* [ ] **Vercel 배포 준비** — `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
  없으면 조용히 파일 폴백 → `data/` 없는 배포에선 빈 화면. 배포 체크리스트에 환경변수 +
  migration 적용 + smoke query 확인 포함

## 나중에 / 미결 판단

* [ ] **하이드레이션 경고** — 모든 화면에 "A tree hydrated but some attributes … didn't match"
  1건. `git stash`로 원본 코드에서도 동일 재현 → 이번 작업 이전부터 존재. MUI
  `InitColorSchemeScript`(`attribute="class"`)가 하이드레이션 전 `<html>` class를 바꾸는데
  `suppressHydrationWarning`이 한 단계만 덮는 문제로 추정. 별도 조사
* [ ] **`study_guides.details.oldCode` 원칙 확인** — 실제 코드 조각이 DB에 저장됨(commit
  0f6aa39). "원본 본문 미저장 원칙"이 "전문만 금지"인지 "조각도 금지"인지 사용자 확정 필요
  (Codex 지적)
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
