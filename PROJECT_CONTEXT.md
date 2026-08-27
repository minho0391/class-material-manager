# PROJECT_CONTEXT.md

이 문서는 사용자, Claude Code, Codex가 이 프로젝트의 확정된 목적·구조·기획·디자인·기술
결정사항을 공통으로 참조하기 위한 지속적인 프로젝트 컨텍스트 문서입니다.

마지막 갱신일: 2026-08-26

---

## 현재 구현 상태 (코드·문서 확인 기준, 2026-08-25)

아래는 README.md, package.json, 디렉터리 구조, `docs/`, `viewer/` 코드를 직접 확인한
**사실**입니다. 추측이나 계획은 포함하지 않았습니다 (계획은 각 절의 "향후 계획"에 따로 표시).

- **버전**: `package.json` 기준 `1.0.0`. README 기준 0~18단계가 완료되어 v1.0.0으로 마감된 상태입니다.
- **실행 방식**: 빌드 단계 없이 Node.js 24가 TypeScript(`.ts`)를 직접 실행합니다.
- **CLI 데이터 파이프라인(`npm run refresh`, 총 10단계)**: `src/refresh/refresh-runner.ts` 기준
  ①기준 문서 링크 목록 → ②Google 문서 수집 → ③파일·폴더·게시형 문서 수집 → ④과목 분류 →
  ⑤압축파일 내용 확인 → ⑥공식 문서 최신화 → ⑦설명자료↔실습코드 연결 재계산 →
  ⑧통합 학습자료 재생성 → ⑨수업 방식↔공식 문서 비교 → ⑩학습 설명 만들기 순서로 증분 실행됩니다.
  개별 CLI 명령으로는 `extract`/`collect`/`collect-files`/`classify`/`extract-zip`/`enrich`/
  `relate`/`build-learning`/`compare`/`study`로 나뉘어 있습니다. (README.md의 12단계 설명 절에는 그
  시점 기준 "아홉 단계"라는 표현이 남아 있으나, 이후 비교·학습 설명 단계가 추가되어 현재
  코드의 `TOTAL_STEPS`는 10입니다.)
- **데이터 저장(현재)**: 원본 수업자료·실습자료와 파이프라인 산출물(`index.json`,
  `relations.json`, `learning.json`, `comparisons.json`, `study-guides.json`,
  `collect-status.json` 등)은 여전히 로컬 `data/` 폴더의 JSON/Markdown 파일이 **1차 저장소**입니다
  (`data/`는 `.gitignore` 대상이며, 뷰어는 지금도 이 파일들을 직접 읽습니다). 2026-08-26에 이
  산출물 중 자료 메타데이터·재가공 데이터를 Supabase Postgres 5개 테이블(`material_metadata`·
  `relations`·`learning_documents`·`comparisons`·`study_guides`)로 이관해 대조 검증까지
  마쳤습니다 — 자세한 스키마와 이관 결과는 아래 "Supabase DB 이관 (완료)" 절 참고. 원본 파일
  자체(`data/materials/` 등)는 이 이관 대상에 포함되지 않았습니다.
- **뷰어**: Next.js 16 + MUI (`viewer/`). 수업자료 화면은 **읽기 전용**입니다 —
  `viewer/lib/data.ts`에 파일을 쓰거나 지우는 코드가 없고, 자료용 API 라우트도 없습니다.
  주소로 들어온 ID는 `index.json`에 등록된 값과 대조한 뒤에만 파일을 엽니다.
- **인증(현재 구현됨)**: Supabase Auth 이메일/비밀번호 로그인이 실제로 구현되어 있습니다
  (`viewer/lib/supabase/server.ts`, `actions.ts`, `proxy.ts`, `viewer/app/login/`).
  모든 화면이 로그인을 요구하며, 로그인하지 않으면 `/login`으로 리다이렉트됩니다.
  회원가입 화면은 없고, 계정은 Supabase 콘솔(Authentication → Users)에서 미리 만들어 둔 것만 씁니다.
  로그인 세션은 쿠키로 유지되고 `proxy.ts`(Next.js 16의 middleware)가 요청마다 갱신합니다.
- **사용자별 데이터 연결(아직 구현 안 됨)**: `user_id`를 `auth.users.id`에 연결하는 테이블이나
  RLS 정책, DB 마이그레이션/스키마 파일은 프로젝트 어디에도 없습니다. `viewer/README.md`에
  "나중에 자료마다 '내 것'을 구분할 일이 생기면 ... 이 로그인은 그 구조를 미리 준비해 둔 것"이라고
  명시되어 있어, 현재는 로그인 기능만 있고 사용자별 데이터 스키마는 **향후 계획** 단계입니다.
- **Supabase 사용 범위(현재)**: 인증(로그인/로그아웃)에 더해, 2026-08-26부터 자료 메타데이터와
  프로젝트 재가공 데이터도 Supabase Postgres에 저장됩니다(5개 테이블, 아래 절 참고). 단, **뷰어
  화면은 아직 이 테이블을 읽지 않습니다** — `viewer/lib/data.ts`는 지금도 로컬 `data/` 파일만
  읽고, DB 테이블을 조회하는 코드는 이번 작업 범위에 없습니다. 이번에 만든 것은 CLI 쪽 이관
  스크립트(`npm run` 대상은 아니고 `node src/index.ts sync-supabase`)뿐입니다.
- **디자인 시안**: `design-mockups/`(v1)와 `design-mockups-v2/`(v2, 5장: 홈, 자료 상세
  Light/Dark, 다시 공부하기, 수업 방식 점검)가 프로젝트 루트에 존재합니다.
- **프로젝트 루트 문서**: `CLAUDE.md`(Autonomous work rules, 2026-08-25 작성)가 프로젝트 루트에
  있습니다. 이 문서(`PROJECT_CONTEXT.md`)와 별개이며 서로 충돌하지 않습니다.
- **알려진 한계**: `docs/FUTURE.md`에 v1.0.0이 못 하는 것(차이 판정은 규칙 기반만, 공식 문서 요약은
  발췌 방식, 다른 기수 자료 미검증, 뷰어는 읽기 전용 등)과 향후 해 볼 만한 것이 정리되어 있습니다.

---

## 사용자가 확정한 프로젝트 방향

### 프로젝트 목적

- 이 프로젝트는 수업자료를 단순히 보관하는 웹이 아니라, 수업자료와 실습 코드를 다시 학습하고 현재 기준으로 점검·복습하기 위한 개인 학습 도구입니다.
- 장시간 실제 공부에 사용하는 것이 우선 목적입니다.
- 동시에 완성도를 높여 포트폴리오에서 보여줄 수 있는 프로젝트로 발전시킵니다.

### 핵심 학습 원칙

- 원본 수업자료와 당시 작성한 예시/실습 코드의 의미를 임의로 변경하지 않습니다.
- 과거 수업 당시의 방식과 현재 권장 방식을 구분해서 보여줍니다.
- 기존 코드를 무조건 최신 코드로 덮어쓰는 것이 아니라, 사용자가 당시 무엇을 배웠는지 보존하면서 현재 기준과 비교할 수 있게 합니다.
- 코드의 개행, 들여쓰기, 표시 방식 등 가독성 개선은 가능하지만 원본 코드의 의미를 임의로 변경하지 않습니다.

### 주요 학습 흐름

- 통합 학습자료: 실제 수업자료와 코드를 읽고 공부하는 영역
- 수업 방식 점검: 수업 당시 사용한 기술/방식이 현재도 적절한지 확인하는 영역
- 다시 공부하기: 점검 결과를 바탕으로 복습 우선순위를 확인하는 영역
- 자료 상세의 기본 학습 흐름은 다음 방향을 유지합니다.

수업자료 → 코드 → 관련 실습 코드 → 지금 코드 그대로 써도 되나 → 공식 문서

### 디자인 결정

- design-mockups-v2를 현재 최종 디자인 기준안으로 사용합니다.
- V1보다 V2의 전체 디자인 방향을 채택합니다.
- Light / Dark 테마를 모두 지원합니다.
- Light 테마는 밝고 깨끗한 neutral/cool 계열을 기반으로 하고 teal을 포인트 컬러로 사용합니다.
- V1 Light에서 느껴졌던 탁하고 빛바랜 종이/신문 같은 색감은 사용하지 않습니다.
- 장시간 자료와 코드를 읽어도 눈의 부담이 크지 않은 방향을 우선합니다.
- Dark 테마 역시 장시간 코드/문서 학습에 적합한 낮은 밝기의 방향을 유지하되 텍스트 대비와 가독성을 확보합니다.
- 과도한 그라데이션, glass 효과, 과한 그림자, 지나치게 둥근 일반적인 SaaS 카드 디자인은 피합니다.
- 기존의 teal 기반 시각적 정체성은 유지합니다.
- (참고) `design-mockups-v2/`의 구체 파일 5개: `01-home-v2.png`(홈), `02-material-detail-light-v2.png`
  (자료 상세 · Light), `03-study-v2.png`(다시 공부하기), `04-compare-v2.png`(수업 방식 점검),
  `05-material-detail-dark-v2.png`(자료 상세 · Dark). 화면별로 반영할 구체적인 개선 항목은
  바로 아래 "V2 디자인 검토에서 반영할 방향" 절을 기준으로 합니다.

### V2 디자인 검토에서 반영할 방향

- Dark 테마의 보조 텍스트 대비를 개선합니다.
- 코드 블록의 글자 크기, 행간, 대비를 장시간 학습에 적합하게 조정합니다.
- 자료 상세 화면은 긴 문서와 코드가 지나치게 좁아지지 않도록 본문 폭을 확보합니다.
- 다시 공부하기에서는 무엇부터 공부해야 하는지가 즉시 보이도록 우선순위를 강화합니다.
- 수업 방식 점검은 관리자 대시보드처럼 보이지 않고 학습 도구의 성격이 드러나도록 유지합니다.
- 기존 V2의 홈 구조, 자료 상세 학습 흐름, 상태별 근거 표시 등 좋은 부분은 유지합니다.

### 인증 및 사용자 데이터

- Supabase Auth를 사용합니다.
- 현재 사용 목적에서는 공개 회원가입 기능을 제공하지 않습니다.
- 관리자가 생성한 계정으로 로그인하는 방향입니다.
- 사용자별 데이터 연결 시 auth.users.id의 UUID를 기준으로 user_id를 연결하고, RLS에서는 사용자 자신의 데이터만 접근하도록 하는 방향을 사용합니다.

**현재 구현 상태 vs 향후 계획** (코드 확인 결과, 위 "현재 구현 상태" 절 참고):
- 현재 구현됨: Supabase Auth 이메일/비밀번호 로그인·로그아웃, 전체 화면 로그인 요구, 세션 쿠키 유지.
- 향후 계획(미구현): `user_id`(auth.users.id 기준) 연결 테이블과 RLS 정책. 아직 스키마·마이그레이션이 존재하지 않습니다.

### Supabase 데이터 저장 원칙

**저장 경계 (2026-08-27 정밀화)**

- **원본 파일 자체는 Supabase(DB·Storage)에 저장하지 않습니다.** PDF·DOCX·ZIP 등
  강사가 준 원본 수업자료·원본 실습자료 파일은 현재의 로컬 `data/materials/` 구조에
  그대로 보존합니다 (약 368MB, 로컬 전용).
- **뷰어 제공·검색·학습 기능에 필요한 텍스트 추출본과 가공 데이터는 필요한 범위에서
  Supabase DB에 저장할 수 있습니다.** 여기에는 원본 파일에서 추출한 수업자료 텍스트
  본문(Markdown), 실습 코드 텍스트, 공식 문서(references) 발췌본이 포함됩니다
  (약 5.1MB 텍스트).
- 원본 파일(바이너리)과 그로부터 추출·가공한 텍스트를 명확히 구분합니다 — 전자는
  로컬 전용, 후자는 DB 저장 가능.
- Supabase에는 이 프로젝트가 가공·생성한 데이터와 사용자별 동적 데이터를 저장합니다.
- Supabase 저장 대상 데이터:
  - 자료 메타데이터, 자료 텍스트 본문
  - 프로젝트에서 생성한 학습용 가공·정리 결과 (통합 학습자료 — 실습 코드 텍스트 포함)
  - 수업 당시 기술/방식에 대한 현재 기준 점검 결과
  - 복습 우선순위 및 복습 상태
  - 공식 문서(references) 발췌본 및 연결 정보
  - 사용자별 학습 진도·메모·기타 개인 학습 상태 (향후)
- 웹은 구조화 데이터·본문을 Supabase에서 우선 읽고 없으면 로컬 파일로 폴백하는
  하이브리드 구조를 유지합니다 (`viewer/lib/data.ts` `resolveSource`).
- **Vercel 등 `data/`가 없는 배포 환경에서도 본문·실습 코드·references·검색이 정상
  동작하는 것을 목표로 합니다.**
- `data/references/` 등 `enrich`로 재생성 가능한 텍스트도, 배포 환경 동작을 위해 DB에
  사본을 둘 수 있습니다 (원본 파일이 아니라 외부 문서 발췌이므로 "원본 미저장"에
  저촉되지 않음).
- 원본 파일을 Supabase Storage로 일괄 이전하는 것은 여전히 결정사항이 아닙니다.
- 아직 확정되지 않은 스키마는 임의로 확정하지 말고 향후 설계로 구분합니다.

**현재 구현 상태**: 위 저장 대상 중 "자료 메타데이터·학습용 가공 결과·점검 결과·복습
우선순위·공식 문서 연결 정보"는 아래 "Supabase DB 이관" 절의 5개 테이블로 이관
완료(2026-08-26). "자료 텍스트 본문·실습 코드 텍스트·references 발췌본"은 아래 "텍스트
본문·references 이관" 절의 방향으로 **로컬 구현·검증 진행 중이며, 원격 적용 전입니다.**
"사용자별 학습 진도·메모·복습 상태" 등 사용자별 동적 데이터는 여전히 **향후 계획**입니다
(`user_id` 테이블·RLS 정책 미포함). 파이프라인 자체는 지금도 로컬 `data/` 파일에만 쓰고,
Supabase 반영은 그 결과물을 별도 CLI 명령(`sync-supabase`)으로 뒤이어 올리는 구조입니다.

### Supabase DB 이관 (완료, 2026-08-26)

`docs/SUPABASE-SCHEMA-DESIGN.md`(설계안, 2026-08-25 작성)가 제안한 테이블 이름
(`materials`/`study_priorities`/`comparison_topics`/`user_material_state`)과 실제로 Supabase
콘솔에 만들어진 테이블 이름은 다릅니다. **실제 적용된 확정 스키마는 아래 5개이며, 이 문서가
최신 기준입니다.**

**확정 스키마 (5개 테이블, Supabase 콘솔에서 생성됨)**

| 테이블 | 역할 | PK | 주요 FK |
|---|---|---|---|
| `material_metadata` | `index.json` 자료 메타데이터(본문 아님) | `source_id` (= docId) | — |
| `relations` | 설명자료 ↔ 실습zip 연결 근거 (`relations.json`) | `id` (bigint) | `material_id`, `zip_id` → `material_metadata.source_id` |
| `learning_documents` | 통합 학습자료 (`learning.json`, 실습 코드 원문 제외) | `material_id` | → `material_metadata.source_id` |
| `comparisons` | 수업 당시 방식 ↔ 공식 문서 점검 결과 (`comparisons.json`) | `id` (= comparisonId) | `material_id` → `material_metadata.source_id` (nullable, 대표 자료 1건) |
| `study_guides` | 복습 우선순위·설명 (`study-guides.json`의 `guides[]`) | `comparison_id` | → `comparisons.id`, `material_id` → `material_metadata.source_id` |

- **원본 파일 미저장 (당시 기준, 2026-08-26)**: 이 5개 테이블에는 텍스트 본문을 담지
  않았습니다 — `material_metadata`는 메타데이터만(`file_path`는 위치만), `learning_documents`의
  `source_files`는 실습 코드의 경로·언어·이유만 담고 `code`(원문)는 제외했습니다.
  **2026-08-27 저장 경계 정밀화로 이 방향은 확장됩니다** — 아래 "텍스트 본문·references 이관"
  절 참고. 원본 파일(PDF/DOCX/ZIP) 자체는 계속 로컬 전용입니다.
- **M:N 관계는 jsonb로 보존**: `comparisons`·`study_guides`의 `material_id`는 단일 FK 컬럼이라
  대표 자료 1건만 가리키지만, 실제로는 자료 하나가 여러 수업자료·여러 실습zip에 걸칠 수 있어
  전체 목록(`lessons`/`taughtIn`/`usedIn`/`materials`/`practice` 등)을 각 테이블의 `details`
  (jsonb)에 손실 없이 그대로 보존했습니다. 스키마를 바꾸지 않고도 데이터 손실이 없도록 한
  선택입니다.
- **`study-guides.json`의 자료별 요약(89건, `materials[]`)**: 별도 테이블이 없어
  `material_metadata.extra.studyPriority`(jsonb, 자료당 1건이라 자연스럽게 대응)에 담았습니다.
- **이관 방식**: 전부 `upsert`(`on_conflict` = PK)만 사용했고 `DELETE`는 한 번도 실행하지
  않았습니다. 이관 전 이미 부분 이관돼 있던 `material_metadata` 130건도 충돌 없이 나머지와
  합쳐졌습니다.

**이관 결과 (2026-08-26 실행, `node src/index.ts sync-supabase` 자체 검증 통과)**

| 테이블 | 원본 JSON 건수 | DB 건수 | 누락 | 중복 | FK 고아행 |
|---|---|---|---|---|---|
| `material_metadata` | 393 | **393** | 0 | 0 | — |
| `relations` | 62 | 62 | 0 | 0 | 0 |
| `learning_documents` | 27 | 27 | 0 | 0 | 0 |
| `comparisons` | 355 | 355 | 0 | 0 | 0 |
| `study_guides` | 355 | 355 | 0 | 0 | 0 |

단순 COUNT(*) 비교가 아니라 `index.json`의 `docId` 집합과 DB의 `source_id` 집합을 실제로
대조했고(다른 4개 테이블도 각자의 원본 id 집합과 대조), 4개 FK 관계(`relations`→자료 2개,
`comparisons`/`study_guides`→자료, `study_guides`→`comparisons`) 모두 고아 행이 없었습니다.

**이번 작업에서 추가한 파일** (모두 신규, 기존 파일 수정은 `src/index.ts`에 CLI 명령 추가뿐):

- `src/sync/env.ts` — Supabase 접속 환경변수 로딩
- `src/sync/postgrest-client.ts` — PostgREST upsert/select 얇은 클라이언트 (SDK 의존성 추가 없음)
- `src/sync/stable-id.ts` — `relations.id`용 결정적 정수 생성 (materialId+zipId 해시)
- `src/sync/build-material-metadata.ts`, `build-relations.ts`, `build-learning-documents.ts`,
  `build-comparisons.ts`, `build-study-guides.ts` — JSON → DB 행 변환 (테이블별)
- `src/sync/sync-runner.ts` — 5개 테이블을 FK 순서대로 upsert
- `src/sync/verify.ts` — 원본과 DB 대조 검증 (건수·누락·중복·FK 고아행)
- CLI: `node src/index.ts sync-supabase` (환경변수: `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`) — 이관과 검증을 한 번에 실행합니다. 재실행해도 upsert라
  안전하며, 앞으로 데이터가 바뀔 때마다 다시 실행해 동기화하는 용도로 재사용할 수 있습니다.

**후속 (완료)**: 2026-08-27 뷰어가 이 5개 테이블의 **구조화 데이터**를 우선 읽도록 하이브리드
읽기 경로를 추가했습니다 (commit `40707bd`, `viewer/lib/data.ts` `resolveSource` + `db.ts`/
`db-map.ts`). 본문·실습 코드·references는 그 시점까지 로컬 파일 전용이었고, 아래 절에서
DB로 확장합니다.

### 텍스트 본문·references 이관 (2026-08-27)

**목적**: Vercel(rootDir=`viewer`, `../data/` 접근 불가)에서 `data/`가 전혀 없어도 자료 본문·
실습 코드·공식 문서·본문 검색이 정상 동작하도록, 텍스트 추출본을 Supabase DB에 둡니다.
"저장 경계 (2026-08-27 정밀화)"에 따른 것으로, 원본 파일(PDF/DOCX/ZIP, ~368MB)은 계속
로컬 전용입니다. 이관 대상은 텍스트 ~5.1MB뿐입니다.

**추가 스키마 (2개 테이블 — 기존 5개는 그대로)**

| 테이블 | 역할 | PK | 크기 |
|---|---|---|---|
| `material_bodies` | 수업자료 텍스트 본문 (`data/materials/**/*.md`의 frontmatter 제외 본문) | `source_id` → `material_metadata.source_id` (ON DELETE CASCADE) | ~4.1MB / 393행 |
| `reference_documents` | 공식 문서(references) 발췌본 (`data/references/**/*.md`, `INDEX.md` 제외) | `(subject, slug)` | ~0.42MB / 203행 |

- `material_bodies`를 `material_metadata`와 **별도 테이블**로 둔 이유: 본문(4MB)은
  `/m/[docId]` 상세에서만 필요하고, 홈·목록·과목 화면 쿼리가 본문을 끌고 오지 않도록.
- `learning_documents`는 스키마 변경 없음 — `source_files`(jsonb)에 `code`(원문)를 다시
  포함하도록 sync만 수정 (+161KB).
- 두 테이블 모두 기존 5개와 동일 패턴: RLS 활성 + `authenticated` SELECT policy + GRANT.
  `anon` 접근 불가. `service_role`만 쓰기(sync).

**sync 파이프라인 (upsert만, DELETE 없음 — 재실행 안전)**

- 신규 `src/sync/build-material-bodies.ts` — `index.json` entry마다 `.md` 읽고 frontmatter
  분리, `content_hash`로 변경분만 upsert.
- 신규 `src/sync/build-references.ts` — `data/references/**/*.md` walk, frontmatter 파싱
  (**서버 사이드, 신뢰된 `data/`**), "이 주제를 다룬 수업자료" 섹션 파싱 → `related_materials`.
- `src/sync/build-learning-documents.ts` — `source_files`에 `code` 복원.
- `src/sync/sync-runner.ts`·`verify.ts` — 스텝·검증 2개씩 추가.

**뷰어 (하이브리드 구조 유지 — 가산적)**

- `resolveSource`·30초 캐시·DB/파일 폴백·`search()` 함수·`/m` `bodyAvailable` 분기 — 무변경.
- `viewer/lib/db.ts`: `fetchMaterialBodyFromDb(sourceId)`(per-doc), `fetchReferencesFromDb()`.
- `viewer/lib/data.ts`: `getMaterial`(본문 DB→파일 폴백), `readReferences`(DB→파일),
  `readBodies`(검색 haystack를 DB에서 채움), `loadLearningFromDb`(코드 DB에서).
- **URL scheme 가드**: `reference.source_url`·`evidence.where`를 `<a href>`에 넣기 전
  허용 스킴(http/https/mailto)만 통과 — sync 저장 시(`src/sync/build-references.ts:sanitizeUrl`)
  + 렌더 시(`viewer/lib/url.ts:safeHref`) 이중 검증. Markdown 본문 링크도 같은 정책의
  `urlTransform`(`safeMarkdownUrl`)으로 좁힘(상대경로·#앵커는 허용). 그 외는 텍스트로만.

**운영 주의**

- sync 는 upsert 전용, DELETE 없음. 소스 `.md`/reference 가 지워지면 `material_bodies`/
  `reference_documents` 에 stale row 가 남고 뷰어가 DB 우선이라 계속 노출됨. `verify.ts` 가
  이 두 테이블의 stale row 를 **실패로 감지**(수동 `DELETE` 안내). 배포 전에 반드시
  `sync-supabase` 가 verify green(EXIT 0)인지 확인.
- **부분 백필 금지**: `material_metadata` 에 행이 있으면 뷰어는 DB 모드로 고정되고,
  `material_bodies`/`reference_documents` 에 1건이라도 있으면 파일 보강 없이 그 부분 집합만
  서빙함. 백필은 항상 `sync-supabase` 를 끝까지(verify green) 실행.

**상태**: 로컬 구현·검증·Codex 리뷰까지 완료. **원격 Supabase migration 3개 적용과 백필은
결과 재보고 후 사용자 승인 시 진행.**

### 첫 접속 트리거 24시간 주기 백그라운드 자동 갱신 (완료, 2026-08-26)

이전 절의 "하루 첫 접속 자동 갱신(다음 구현 단계)" 설계를 대체합니다 — "오늘 첫 갱신인지"
(자정·KST 날짜 기준)라는 초안 대신, 실제로는 **"마지막 성공 갱신 시각 + 24시간"** 을
기준으로 확정해 구현했습니다.

**동작 방식**

1. 사용자가 뷰어에 접속하면 화면은 항상 기존 데이터를 즉시 보여줍니다 — 자동 갱신 여부
   확인이나 실행을 절대 기다리지 않습니다.
2. `viewer/proxy.ts`(Next.js 16 미들웨어, 정적 자산을 뺀 거의 모든 요청을 거칩니다)가
   매 요청마다 Next.js의 `after()`로 `viewer/lib/refresh/trigger.ts`를 응답을 보낸
   **뒤에** 실행합니다. `/`, `/learn`, `/login`처럼 정적으로 미리 만들어지는 페이지는
   요청마다 서버 코드가 다시 돌지 않으므로, 반드시 모든 요청이 실제로 거치는 미들웨어에서
   합니다 (레이아웃에 두면 정적 페이지에서는 아예 실행되지 않습니다).
3. `trigger.ts`는 Supabase RPC `try_claim_refresh()`를 호출해 "지금이 갱신할 때인가"를
   원자적으로 확인·획득(claim)합니다. 대부분의 요청은 아직 24시간이 안 지났거나 이미 다른
   요청이 갱신 중이라 빈 결과를 받고 그대로 끝납니다 — 이게 정상 동작입니다.
4. claim에 성공한 요청만 GitHub Actions 워크플로우
   (`.github/workflows/material-refresh.yml`)를 `repository_dispatch` API로 원격
   트리거합니다. **실제 재수집·재가공·Supabase 반영은 Vercel이 아니라 이 워크플로우가
   합니다** — 이유는 아래 "왜 Vercel이 직접 갱신하지 않는가" 참고.
5. 워크플로우는 기존 `refresh()`(12단계 파이프라인)와 `syncSupabase()`/`verifySupabase()`를
   코드 수정 없이 그대로 불러 새 데이터를 만들고 Supabase에 반영·검증합니다
   (`node src/index.ts ci-refresh` → `src/refresh/auto-refresh.ts`).
6. 검증까지 전부 성공했을 때만 Supabase RPC `release_refresh(claim_token, success=true)`로
   `last_success_at`을 갱신합니다. 그 순간부터 다음 24시간이 다시 시작됩니다.
7. 지금 접속한 사용자의 화면은 갱신 완료 후에도 강제로 새로고침되지 않습니다 — 다음
   요청부터 자연히 새 데이터를 씁니다.

**"마지막 성공 + 24시간" 기준**

특정 시각(자정 등)이 아니라 `last_success_at + 24시간`을 다음 갱신 가능 시점으로
씁니다. 성공 시각만 이 타이머를 다시 시작시키고, 시도했다는 사실만으로는 시작되지
않습니다.

**실패 처리와 쿨다운**

- 실패(파이프라인 중단, Supabase 반영 오류, 검증 실패 중 하나라도)해도 `last_success_at`은
  그대로 두고 `last_failure_at`/`last_error`만 남깁니다 — 실패를 성공으로 기록하지 않고,
  기존 정상 데이터도 건드리지 않습니다 (upsert만 쓰므로 애초에 기존 행을 지우지 않습니다).
- 24시간이 지난 뒤 시도가 실패하면, 그 실패 시각부터 **1시간**(기본값) 동안은 재시도하지
  않습니다. 1시간이 지난 뒤 들어오는 요청부터 다시 claim을 시도할 수 있습니다.
  (`try_claim_refresh`의 `p_failure_cooldown_seconds` 기본값 — 프로젝트 구조상 이 값을
  바꿔야 할 특별한 이유가 없어 사용자가 제시한 기본값을 그대로 채택했습니다.)

**동시성 제어**

`try_claim_refresh`는 `UPDATE ... WHERE ... RETURNING`(Postgres에서 행 단위로 원자적)
하나로 claim을 원자적으로 수행합니다. 여러 요청이 동시에 불러도 조건을 만족하는 것 중
정확히 하나만 `claim_token`을 받고, 나머지는 빈 결과를 받아 그대로 기존 데이터를
돌려줍니다. `release_refresh`도 `claim_token`이 일치할 때만 반영되므로, 뒤늦게 들어온
결과 보고가 그 사이 새로 발급된 claim을 덮어쓸 수 없습니다.

**stale lock 처리**

작업 도중 GitHub Actions 러너가 죽거나 응답을 못 보내는 경우를 대비해, `running` 상태가
**90분**(기본값)보다 오래 지속되면 죽은 작업으로 보고 다음 claim이 회수합니다. 워크플로우의
`timeout-minutes: 60`보다 여유 있게 잡아, 정상 실행이 아직 끝나지 않았는데 회수되는
일이 없도록 했습니다.

**DB 구조 (신규, 마이그레이션으로 적용)**

- 마이그레이션 파일: `supabase/migrations/20260826081927_create_refresh_state.sql`
  (Supabase에도 같은 이름으로 이미 적용되어 있습니다 — `supabase migration list`로 확인
  가능합니다. 기존 5개 테이블 스키마는 이 저장소에 마이그레이션 파일이 없는 채로 이미
  적용되어 있던 상태였는데, 이번 것부터는 파일로도 남겨 fresh clone에서
  `supabase db push`로도 재현할 수 있게 했습니다).
- `refresh_state` 테이블 — 행 하나(`job_name = 'material_sync'`)만 씁니다.
  `status`(`idle`/`running`), `claim_token`, `claimed_at`, `last_success_at`,
  `last_attempt_at`, `last_failure_at`, `last_error`, `updated_at`. 기존 5개 테이블과
  같은 패턴으로 RLS는 켜 두고 정책은 만들지 않았습니다 — `service_role`만 접근합니다.
- `try_claim_refresh(p_job_name, p_min_interval_seconds=86400, p_failure_cooldown_seconds=3600, p_stale_lock_seconds=5400)`
  — 원자적 claim. `SECURITY DEFINER`, 실행 권한은 `service_role`에만 부여했습니다.
- `release_refresh(p_job_name, p_claim_token, p_success, p_error)` — 결과 보고.
  마찬가지로 `service_role` 전용입니다.

**백그라운드 실행 방식과 그 이유**

- **왜 Vercel이 직접 갱신하지 않는가**: Vercel에 배포된 뷰어는 서버리스 함수라 로컬
  `data/` 폴더도, Google Drive 인증 정보(`credentials.json`/`data/token.json`, 로컬
  전용)도 갖고 있지 않습니다 — 원본 수업자료를 클라우드로 옮기지 않는다는 기존 원칙
  때문에 둘 다 의도적으로 로컬 전용입니다. 그래서 Vercel(뷰어)은 "24시간이 지났는지
  감지 + claim 획득 + GitHub Actions 원격 트리거"까지만 하고, 실제 재수집·재가공·Supabase
  반영은 GitHub Actions가 맡습니다. 이 설계는 사용자에게 직접 확인받았습니다
  (대안: Vercel로 Google 인증정보를 옮겨 Vercel에서 전체 파이프라인을 도는 방식은
  "원본은 로컬에만" 원칙과 크게 부딪혀 채택하지 않았습니다).
- Vercel 쪽 트리거는 Next.js `after()`로 응답 전송 뒤에 실행되며, 실패해도(네트워크 오류,
  GitHub API 실패 등) 내부에서 예외를 삼키고 `release_refresh`로 실패 보고까지 시도합니다
  — 실패해도 결국 stale lock 만료로 풀리므로 영구히 막히지 않습니다.
- **필요한 자격 증명 (직접 등록 필요, 이번 작업에서 자동으로 등록하지 않았습니다)**:
  - GitHub repo secrets(Settings → Secrets and variables → Actions):
    `GOOGLE_CREDENTIALS_JSON`(로컬 `credentials.json` 내용), `GOOGLE_TOKEN_JSON`
    (로컬 `data/token.json` 내용), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
  - Vercel 환경변수(Production/Preview): `GH_DISPATCH_TOKEN`(이 저장소에
    `repository_dispatch`를 보낼 수 있는 새 GitHub PAT — fine-grained라면 Contents:
    Read and write, classic이면 `repo` scope), `SUPABASE_SERVICE_ROLE_KEY`(로컬
    `.env.local`과 같은 값 — 이 값은 실제로 로컬 `viewer/.env.local`에는 추가해
    두었지만, Vercel 원격 환경변수 등록은 Claude Code의 자동 모드 안전장치가
    "인증정보를 새 시스템에 심는 조작"으로 판단해 막았으므로 사용자가 직접 등록해야
    합니다).
  - 이 중 하나라도 없으면 자동 갱신 감지 자체가 조용히 아무 일도 하지 않고 건너뜁니다
    (로그인·자료 열람 등 나머지 기능에는 영향이 없습니다).

**검증 결과 (2026-08-26)**

- `try_claim_refresh`/`release_refresh`를 실제 Supabase 프로젝트에 대고 SQL로 직접
  호출해 다음을 확인했습니다: 최초 claim 성공 · 동시 claim 시도 시 두 번째는 빈 결과 ·
  잘못된 토큰으로 release 시 무시 · 성공 보고 시 `last_success_at` 갱신 · 24시간 이내
  재claim 차단 · 24시간 경과 후 claim 성공 · 실패 보고 시 `last_success_at` 유지하며
  `last_failure_at`/`last_error`만 기록 · 쿨다운 이내 재claim 차단 · 쿨다운 경과 후
  재claim 성공 · 90분 stale lock 회수.
- 루트 `npm run typecheck`·`npm test`(187건 전부 통과)·`node src/index.ts security-check
  --skip-data`(git 추적 대상에 민감정보 의심 문자열 없음) 통과.
- `viewer`에서 `npm run typecheck`·`npm run build` 통과 — `/`, `/learn`, `/login`이
  여전히 정적(○)으로, 나머지가 동적(ƒ)으로 유지되는 것을 확인했습니다 (미들웨어에 둔
  덕분에 자동 갱신 감지가 이 정적 분류에 영향을 주지 않습니다).
- 로컬 `next dev`로 실제 운영 Supabase 프로젝트를 대상으로 종단 간(end-to-end) 확인:
  홈 화면 요청 → 실제 claim 성공 → `GH_DISPATCH_TOKEN` 미설정으로 GitHub Actions 트리거
  실패 → 실패로 정상 보고(`last_success_at` 그대로, `last_failure_at`/`last_error` 기록)
  → `refresh_state`를 다시 초기 상태로 정리. GitHub Actions 워크플로우 자체(Google 인증
  포함 실제 파이프라인 실행)는 위 secrets를 사용자가 등록해야 실행할 수 있어 이번에는
  트리거 단계까지만 실제로 검증했습니다.
- 구현 완료 후 Codex 독립 리뷰를 받아 실제로 반영했습니다:
  1) `supabase/migrations/`에 이 스키마의 로컬 마이그레이션 파일이 빠져 있던 문제 →
  위 파일 추가로 해결. 2) `ci-refresh`의 성공 판정이 `summary.stopped`만 봐서, `stopped`
  로 이어지지 않는 개별 단계 실패(예: Google 인증 실패)를 성공으로 잘못 보고할 수 있던
  문제 → `npm run refresh`와 같은 기준("실패" 상태 단계가 하나라도 있으면 실패)으로
  수정. 3) `hasVerifyProblems`가 `relations`의 `missingRelationIds`를 누락하던 문제 →
  검사 항목 추가. 4) GitHub Actions 트리거용 `fetch`가 네트워크 오류로 예외를 던지면
  `release_refresh` 실패 보고 없이 claim이 90분 stale lock까지 묶이던 문제 →
  `dispatchWorkflow` 내부에서 예외까지 잡아 항상 실패 보고하도록 수정. 5)
  `release_refresh` 호출 자체가 실패해도 조용히 넘어가던 것 → 응답 상태를 확인해 경고를
  남기도록 보강. 6) 워크플로우에 최소 권한(`permissions: contents: read`)과 자격증명
  파일 권한(`chmod 600`) 추가. 수정 후 typecheck·test·build·security-check와
  실제 Supabase를 대상으로 한 종단 간 스모크 테스트를 다시 통과시켰습니다.

**이후 유지보수 시 주의사항**

- 위 "필요한 자격 증명" 4+2개를 등록해야 기능이 실제로 끝까지 동작합니다. 등록 전에는
  안전하게 아무 일도 하지 않을 뿐 기존 기능에는 영향이 없습니다.
- `refresh()`/`syncSupabase()`/`verifySupabase()`의 동작을 바꾸면 `ci-refresh`
  (`src/refresh/auto-refresh.ts`)의 성공/실패 판정 기준(`summary.steps`에 "실패" 상태가
  있는지, `hasVerifyProblems`)도 같이 봐야 합니다 — 특히 `hasVerifyProblems`
  (`src/sync/verify.ts`)는 `sync-supabase` CLI가 화면에 찍는 것과 같은 조건(그리고
  `missingRelationIds` 등 CLI 쪽에 없던 추가 검사)을 담고 있으므로, 검증 조건을 한쪽만
  고치면 둘이 어긋납니다.
- claim/쿨다운/stale-lock 기본값(24시간/1시간/90분)은 `try_claim_refresh` 함수의 SQL
  기본 인자값 한 곳에만 있습니다 — 바꾸려면 마이그레이션으로 함수를 다시 만들면 됩니다.
- GitHub Actions 워크플로우의 `timeout-minutes`을 늘리면 stale lock 기준(90분)도 그보다
  여유 있게 함께 늘려야, 정상 실행 중인 작업이 중간에 다른 claim에 회수당하지 않습니다.

### AI 협업 원칙

- Claude Code를 주 구현 에이전트로 사용합니다.
- Codex는 독립 코드 리뷰, 디자인 리뷰, 디버깅, 기술적 판단 보조에 사용합니다.
- 프로젝트 루트 CLAUDE.md의 Autonomous work rules를 작업 규칙으로 따릅니다.
- Codex가 제안한 내용이 이 문서의 확정사항과 충돌하면 자동 적용하지 않고 사용자에게 확인합니다.
- 일반적인 기술 판단과 오류 해결은 가능한 범위에서 Claude와 Codex가 협업하여 진행하고, 사용자 취향·기획 변경·파괴적 작업 등은 사용자에게 확인합니다.

---

## PROJECT_CONTEXT.md 관리 규칙

- 확정된 장기적 결정사항만 기록합니다.
- 단순 대화, 잡담, 시행착오, 일시적인 작업 상태, 폐기된 아이디어는 기록하지 않습니다.
- 아직 구현되지 않은 계획을 구현 완료된 것처럼 기록하지 않습니다.
- 가능한 경우 현재 구현 상태, 확정된 결정, 향후 계획을 구분합니다.
- 기존 결정이 변경되면 서로 충돌하는 과거/현재 결정을 계속 누적하지 말고 현재 유효한 결정이 명확하도록 갱신합니다.
- 단순 코드 수정이나 버그 수정만으로 이 문서를 매번 변경하지 않습니다.
- 사용자와의 대화에서 새로운 장기적 프로젝트 결정이 확정된 경우에만 필요한 내용을 추가·갱신합니다.
- Codex에 중요한 리뷰를 요청할 때는 먼저 이 문서를 읽고 확정된 프로젝트 의도를 기준으로 검토하도록 합니다.
