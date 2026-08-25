# Supabase 저장 대상 분석 및 DB 스키마 설계안 (v1, 설계 단계)

이 문서는 **설계안입니다. 실제 Supabase 프로젝트에는 아무것도 적용되지 않았습니다.**
SQL 실행, 테이블 생성, migration, RLS 적용은 이번 작업 범위에 포함되지 않습니다.

기준: `PROJECT_CONTEXT.md`의 "Supabase 데이터 저장 원칙"과 "인증 및 사용자 데이터" 확정사항.
작성일: 2026-08-25.

---

## 1. 조사 방법

파일명만 보고 추측하지 않고 다음을 직접 읽어 확인했습니다.

- `README.md`, `package.json`, `src/refresh/refresh-runner.ts`
- `data/` 전체 구조와 각 JSON 파일의 실제 바이트 크기 (`wc -c`, `du -sh`)
- 각 산출물의 실제 레코드 수와 필드 구성 (Node로 직접 파싱해 확인)
- 생성 코드: `src/learn/learning-builder.ts` 계열, `src/compare/compare-runner.ts` 계열,
  `src/study/study-builder.ts`·`study-runner.ts`, `src/enrich/*`
- `viewer/lib/data.ts` (뷰어의 유일한 데이터 접근 통로)
- `viewer/lib/supabase/*` (Auth 구현)
- `docs/FUTURE.md`, `viewer/README.md`

---

## 2. 현재 생성 데이터 조사 결과

| 데이터 | 생성 단계 | 생성 코드 | 레코드 수 | 파일 크기 | 원본/가공/운영 |
|---|---|---|---|---|---|
| `data/index.json` | 1~5단계 (collect/collect-files/classify) | `src/collect/*`, `src/classify/*` | 393건 | 393KB | 원본 자료의 **메타데이터** (본문 아님) |
| `data/links.json` | 1단계 | `src/collect/link-runner.ts` | 기준 문서 링크 목록 | 233KB | 파이프라인 운영 데이터 |
| `data/relations.json` | 9단계 | `src/relate/relate-runner.ts` | 62건 | 55KB | 가공 (연결 근거) — 실제 코드 텍스트는 포함 안 함 (경로만) |
| `data/learning.json` | 10단계 | `src/learn/learning-builder.ts` | 27편 | 244KB | 가공 — **단, `practice[].sourceFiles[].code`에 실제 실습 코드 원문이 그대로 포함됨** |
| `data/comparisons.json` | 13~14단계 | `src/compare/compare-runner.ts` | 355건 | 1.2MB | 가공 (점검 결과) — `lessons`/`taughtIn`에 원문 인용 **한 줄**씩만 포함, 본문 전체는 아님 |
| `data/study-guides.json` | 15단계 | `src/study/study-builder.ts` | guides 355건 · materials(자료별 요약) 89건 | 1.2MB | 가공 (복습 우선순위/설명) — `comparisons.json`의 값을 문장으로 옮긴 것, 새 사실 없음 |
| `data/collect-status.json` | 16단계 | `src/enrich/collect-status.ts` | 상태 스냅샷 1건 | 2.3KB | 운영 상태 (공식 문서를 마지막으로 어떻게 받았는지) |
| `data/doc-lookup.json` | 14단계 | `src/compare/doc-lookup.ts` | 3건 | 16KB | 운영 캐시 (재요청 방지용) |
| `data/failed.json` | 3~4단계 | `src/collect/*` | 실패 기록 | 16KB | 운영 로그 |
| `data/token.json` | 2단계 (OAuth) | `src/collect/auth/*` | 1건 | 0.3KB | 인증 토큰 (Google) — Supabase와 무관, 이전 대상 아님 |
| `data/references/**/*.md` | 6단계 (enrich) | `src/enrich/*` | 211개 파일 | 1.1MB | **원본이 아닌 외부(MDN 등) 공식 문서의 발췌 캐시** — `enrich`로 언제든 재생성 가능 |
| `data/materials/` (md·zip·pdf 등) | 1~8단계 | `src/collect/*` | 393건 카탈로그 대응 | **373MB** | **원본 수업자료 + 원본 실습 zip/PDF 그 자체** |
| `data/raw/` | 1~4단계 | `src/collect/*` | — | 568KB | 원본 캐시 (이미지 제거 후) |
| `data/history/`, `data/backups/` | 18단계(backup) | `src/backup/*` | — | 676KB / 22MB | 운영(버전 이력·백업), 재생성·재실행으로 복구 가능 |

**뷰어의 데이터 접근**: `viewer/lib/data.ts`는 위 파일들을 **읽기만** 하며 (`readFile`/`readdir`만 사용,
쓰기 함수 없음), `index.json`에 등록된 ID만 열도록 경로를 검증합니다. 현재 Supabase는
`viewer/lib/supabase/`의 `server.ts`(세션 클라이언트)·`actions.ts`(로그인/로그아웃)·`proxy.ts`(세션 갱신)
에서 **인증 용도로만** 쓰이고, 위 데이터 중 어느 것도 아직 Supabase에 저장되어 있지 않습니다
(테스트: `tests/`에도 Supabase 데이터 스키마 관련 테스트는 없고, Auth 관련 로직은 뷰어 쪽에 있어
CLI의 `node --test` 스위트에는 포함되지 않습니다).

**중요한 사실 하나** — `learning.json`은 실습 zip에서 뽑은 **실제 소스코드 원문**을
`practice[].sourceFiles[].code`에 그대로 담고 있습니다. 이것은 "가공 데이터"이지만 내용 자체는
원본 실습 코드와 동일합니다. 그래서 이 코드 텍스트를 Supabase에 그대로 옮기면
"원본 자료 본문을 DB에 중복 저장하지 않는다"는 확정 원칙과 부딪힙니다. 아래 3절에서
이 필드는 DB로 옮기지 않고 파일 경로만 참조하는 방식으로 설계했습니다.

---

## 2.1 적용 범위 명확화 (Codex 검토 반영)

Codex 독립 검토에서 "이 설계가 Viewer의 기존 파일 읽기 경로를 대체하려는 것인지 불명확하다"는
지적이 있었습니다. 명확히 합니다.

- **이번 설계는 Viewer의 데이터 읽기 경로를 바꾸지 않습니다.** `viewer/lib/data.ts`가 지금처럼
  `index.json`·`comparisons.json`·`study-guides.json`을 파일에서 직접 읽는 방식을 그대로 유지하는 것을
  전제로 합니다.
- 아래 3~5절의 공용 테이블(`materials`/`study_priorities`/`comparison_topics`)은 **사용자별 테이블
  (`user_material_state`)이 참조할 FK 대상, 그리고 향후 "내 진도/메모와 공식 데이터를 한 번에 조회"하는
  기능을 위한 보조 조회 경로**로 추가되는 것이지, 기존 파일 기반 경로를 지우거나 대신하는 것이 아닙니다.
- 파이프라인(`refresh`)이 이 테이블에 데이터를 채우는 실제 동기화 코드는 **이번 작업 범위에 없습니다.**
  나중에 만든다면 `refresh` 마지막에 붙는 별도의 선택적 단계(예: `sync-supabase`, service_role 키 사용)가
  되어야 하며, 이는 이 설계 문서가 다루지 않는 향후 구현 과제입니다.

---

## 3. 저장 대상 분류

> **"재생성 가능한데 왜 A로 분류했는가" (Codex 검토 반영)** — `study_priorities`와
> `comparison_topics`도 사실 `refresh` 파이프라인으로 다시 만들 수 있는 산출물입니다. C절의
> 항목들과 다른 점은 **재생성 여부가 아니라 "그 자체로 조회·조인 가치가 있는가"** 입니다.
> `links.json`·`doc-lookup.json`·`collect-status.json`은 파이프라인 내부 사정(다음 실행에서
> 무엇을 다시 할지)일 뿐 사용자가 화면에서 직접 조회하거나 자신의 진도와 연결할 대상이 아닙니다.
> 반면 `study_priorities`·`comparison_topics`는 PROJECT_CONTEXT.md가 명시한 저장 대상(점검 결과·
> 복습 우선순위)이며, `user_material_state`(사용자별 진도·메모)가 이 값과 **조인되어야** 의미가
> 커집니다(예: "내가 아직 확인 안 한 REPLACE 항목만 보기"). 그래서 재생성 가능함에도 A로 분류했습니다.

### A. Supabase 저장 추천

| 데이터(원본 파일) | DB화 대상 | 이유 |
|---|---|---|
| `index.json` | **자료 메타데이터만** (id·title·subject·kind·sourceUrl·filePath·updatedAt) | 사용자별 테이블(즐겨찾기·진도 등)이 참조할 안정적인 FK 대상이 필요합니다. 본문은 옮기지 않습니다. |
| `study-guides.json`의 `materials` 배열 | 자료별 복습 우선순위 요약 | "다시 공부하기" 화면의 핵심 상태값이며, 사용자별 진도/즐겨찾기와 자연스럽게 조인됩니다. |
| `comparisons.json`의 `items` | 점검 결과(상태·변화종류·심각도·공식문서 연결) | "수업 방식 점검" 화면의 핵심 데이터이며, PROJECT_CONTEXT.md의 저장 대상 목록에 있는 "점검 결과"·"공식 문서 연결 정보"에 해당합니다. `evidence`의 긴 인용은 요약 길이로 제한해 저장합니다. |
| 사용자별 동적 데이터 (신규) | 진도·즐겨찾기·메모·복습 확인 상태 | Supabase Auth와 연결되는 대표적인 용도이며, 현재 파일 시스템으로는 불가능한 영역입니다. |

### B. 기존 파일 시스템 유지 추천

| 데이터 | 이유 |
|---|---|
| `data/materials/` (373MB) | 원본 수업자료·원본 실습 zip/PDF 그 자체입니다. PROJECT_CONTEXT.md 확정사항("원본은 Supabase DB/Storage로 이전하지 않는다")에 따라 그대로 둡니다. |
| `data/raw/` | 원본 캐시. 위와 같은 이유입니다. |
| `data/references/**/*.md` (211개, 1.1MB) | 외부 공식 문서의 발췌본이지만 **`enrich` 한 번이면 완전히 재생성**됩니다. 원문 자체가 아니라 캐시이므로 굳이 DB로 옮길 이유가 없고, 본문 텍스트를 DB에 두면 "원본 성격 콘텐츠의 중복 저장"이 되어 분리 원칙과도 어긋납니다. |
| `learning.json`의 `practice[].sourceFiles[].code` | 실습 코드 원문 그 자체입니다. 뷰어는 이미 파일 기반으로 이 내용을 읽고 있으므로, DB에는 **어떤 자료가 어떤 실습 코드와 연결되는지(식별자·경로)만** 넣고 코드 본문은 옮기지 않습니다 (아래 4·5절 참고). |

### C. 재생성 가능한 임시/캐시/운영 데이터 (DB 저장 불필요)

| 데이터 | 이유 |
|---|---|
| `links.json` | 매 `refresh` 1단계에서 다시 만들어지는 원시 링크 목록. 뷰어가 직접 쓰지 않습니다. |
| `relations.json` | `learning.json`을 만들기 위한 중간 산출물. 규칙만 있으면 언제든 재계산됩니다 (`relate` 명령). |
| `doc-lookup.json` | 재요청 방지용 캐시일 뿐, 그 자체로 의미 있는 최종 데이터가 아닙니다. |
| `collect-status.json` | "지금 막 refresh를 어떻게 했는지"에 대한 순간 상태입니다. 다음 refresh에서 덮어써집니다. |
| `failed.json`, `token.json` | 운영 로그·인증 토큰. 사용자 학습과 무관합니다. |
| `data/history/`, `data/backups/` | 백업/이력. 로컬 복구용이며 DB화 대상이 아닙니다. |

---

## 4. 사용자별 데이터 구조 검토 (최소 구조)

요청하신 7개 후보(학습 진도·완료 여부·마지막 열람 위치·마지막 학습 시각·즐겨찾기·사용자 메모·복습 상태)를
실제 화면 흐름(`/learn`, `/m/[docId]`, `/study`, `/compare`) 기준으로 검토했습니다.

- **학습 진도 + 완료 여부** → 하나의 `progress_status` 값(`not_started`/`in_progress`/`completed`)으로 통합했습니다. 두 값을 따로 두면 "완료인데 진행중" 같은 모순 상태가 생길 수 있어 단일 열거값이 더 단순합니다.
- **마지막 학습 시각** → `last_viewed_at` 하나로 유지합니다. 화면에 들어갈 때마다 갱신하면 되므로 별도 이력 테이블은 만들지 않았습니다.
- **마지막 열람 위치(스크롤 위치 등)** → **이번 설계에는 포함하지 않았습니다.** 현재 자료 상세 화면은 페이지 단위(`/m/[docId]`)이고, 문단 단위 위치 추적은 지금 화면 구조에 없는 기능을 새로 만드는 것이라 "최소 구조 우선" 원칙에 어긋난다고 판단했습니다. 필요해지면 `last_viewed_at`이 있는 `user_material_state`에 `scroll_position` 컬럼을 나중에 추가하면 됩니다.
- **즐겨찾기** → `is_favorite` boolean.
- **사용자 메모** → `note` (자료 하나당 메모 하나, 자유 텍스트). 여러 개의 메모 스레드 같은 기능은 요청에 없었으므로 만들지 않았습니다.
- **복습 상태** → 시스템이 계산하는 `study_priorities.priority`(KEEP/CHECK/RELEARN/REPLACE)와는 별개로, "사용자가 이 점검 결과를 확인했는지"를 뜻하는 `review_status`(`unreviewed`/`acknowledged`)만 두었습니다. 판정 자체를 사용자가 바꾸는 기능은 만들지 않았습니다(판정은 공식 문서 기반 사실 판정이라는 프로젝트 원칙과 맞지 않습니다).

이 6개 항목은 자료 하나당 사용자 하나의 상태이므로 **테이블 하나(`user_material_state`)로 통합**했습니다.
과도하게 테이블을 쪼개는 대신, "자료별 개인 상태 한 줄"이라는 단순한 모델을 우선했습니다.

---

## 5. Supabase DB 스키마 설계안

> 아래는 설계안입니다. SQL은 참고용 문법 예시이며 **실행하지 않았습니다.**

### 5.1 `materials` (공용 데이터)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `text` | **PK** | `index.json`의 `docId` 그대로 사용 (안정적 식별자) |
| `title` | `text` | NOT NULL | 자료 제목 |
| `subject` | `text` | NOT NULL | 과목 (`css`/`react`/... `subjects.ts` 값) |
| `kind` | `text` | NOT NULL | `document`/`drive-file`/`published-document` 등 |
| `source_url` | `text` | NULL 허용 | 원본 Google Docs/Drive URL |
| `file_path` | `text` | NOT NULL | 로컬 `materials/...` 상대 경로 (본문 아님, 위치만) |
| `updated_at` | `timestamptz` | NOT NULL | 원본이 마지막으로 바뀐 시각 (`index.json.updatedAt`) |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | DB에 처음 동기화된 시각 |

- **인덱스**: `subject`에 btree 인덱스 (`/s/[subject]` 화면의 과목별 조회용).
- **공용/사용자별**: 공용(모든 로그인 사용자 공통).
- **RLS 방향**: `select`는 `authenticated` role 전체 허용(뷰어가 이미 로그인을 강제하므로 앱 내부에서는 익명 접근이 없음). `insert`/`update`/`delete`는 어떤 role에도 허용하지 않고, 파이프라인이 **service_role**(RLS 우회)로만 동기화합니다.

### 5.2 `study_priorities` (공용 데이터)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `material_id` | `text` | **PK, FK → materials(id)** ON DELETE CASCADE | 1자료 1행 |
| `subject` | `text` | NOT NULL | 조회 편의를 위한 비정규화 컬럼 |
| `priority` | `text` | NOT NULL, CHECK IN (`KEEP`,`CHECK`,`RELEARN`,`REPLACE`) | `study-guides.json`의 자료별 최종 우선순위 |
| `counts` | `jsonb` | NOT NULL | `{"KEEP":n,"CHECK":n,"RELEARN":n,"REPLACE":n}` |
| `topics` | `jsonb` | NOT NULL | `[{comparisonId, topic, priority}, ...]` (comparison_topics.id 참조, 본문 없음) |
| `updated_at` | `timestamptz` | NOT NULL | |

- **인덱스**: `priority`, `subject`.
- **공용/사용자별**: 공용.
- **RLS 방향**: `materials`와 동일 (읽기는 인증 사용자 전체, 쓰기는 service_role만).

### 5.3 `comparison_topics` (공용 데이터)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `text` | **PK** | `comparisons.json`의 기존 `id` 그대로 사용 (예: `api:css/align-items`) |
| `subject` | `text` | NOT NULL | |
| `topic` | `text` | NOT NULL | |
| `kind` | `text` | NOT NULL | `api`/`gap`/`package` 등 |
| `status` | `text` | NOT NULL, CHECK IN (`CURRENT`,`DEPRECATED`,`UNSTABLE`,`VERSION_GAP`,`NOT_FOUND`,`REVIEW_REQUIRED`) | |
| `change_type` | `text` | NOT NULL, CHECK IN (`NONE`,`VERSION_ONLY`,`RECOMMENDED_CHANGED`,`API_CHANGED`,`DEPRECATED`,`REMOVED`,`REVIEW_REQUIRED`) | |
| `severity` | `text` | NOT NULL, CHECK IN (`NONE`,`LOW`,`MEDIUM`,`HIGH`) | |
| `reason` | `text` | NOT NULL | 판정 이유(한 문단) |
| `official` | `jsonb` | NULL 허용 | 공식 문서 연결 정보(제목·URL·상태) — "공식 문서 연결 정보"에 해당 |
| `related_materials` | `jsonb` | NOT NULL, DEFAULT `'[]'` | `[{material_id, title, path, quoted_line}]` (원래 `lessons`/`taughtIn`) — 원문 인용은 한 줄로 제한, 본문 전체 금지 |
| `related_practice` | `jsonb` | NOT NULL, DEFAULT `'[]'` | `[{zip_id, zip_title, source_file_count}]` (원래 `usedIn`) — 실습 zip **연결 정보만**, 코드 본문은 담지 않음 |
| `last_compared_at` | `timestamptz` | NOT NULL | |
| `needs_review` | `boolean` | NOT NULL, DEFAULT false | |

- **인덱스**: `subject`, `status`, `severity`. `related_materials`에 GIN 인덱스(자료 상세 화면에서 "이 자료와 관련된 점검 결과" 조회용, `@>` 연산자 사용).
- **공용/사용자별**: 공용.
- **RLS 방향**: 위 두 테이블과 동일.

> 별도의 "공식 문서 연결" 테이블은 만들지 않았습니다. `comparisons.json`이 이미 항목마다
> `official` 필드로 그 정보를 갖고 있어서, 테이블을 나누면 테이블만 늘고 얻는 이득이 없습니다.

### 5.4 `user_material_state` (사용자별 데이터)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `uuid` | **PK**, DEFAULT `gen_random_uuid()` | |
| `user_id` | `uuid` | NOT NULL, **FK → auth.users(id)** ON DELETE CASCADE | |
| `material_id` | `text` | NOT NULL, **FK → materials(id)** ON DELETE CASCADE | |
| `progress_status` | `text` | NOT NULL, DEFAULT `'not_started'`, CHECK IN (`not_started`,`in_progress`,`completed`) | 학습 진도 + 완료 여부 통합 |
| `last_viewed_at` | `timestamptz` | NULL 허용 | 마지막 학습 시각 |
| `is_favorite` | `boolean` | NOT NULL, DEFAULT false | 즐겨찾기 |
| `note` | `text` | NULL 허용 | 사용자 메모 |
| `review_status` | `text` | NOT NULL, DEFAULT `'unreviewed'`, CHECK IN (`unreviewed`,`acknowledged`) | 점검 결과를 확인했는지 |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | |

- **UNIQUE**: `(user_id, material_id)` — 사용자당 자료당 한 행.
- **인덱스**: `(user_id)`, `(user_id, is_favorite)`, `(material_id)`.
- **공용/사용자별**: 사용자별.
- **RLS 방향**: `USING (auth.uid() = user_id)` / `WITH CHECK (auth.uid() = user_id)`을 `select`/`insert`/`update`/`delete` 전부에 적용 — 본인 행만 접근 가능.

### 5.5 텍스트 ERD

```
auth.users (Supabase 관리 테이블)
  id (uuid, PK)
      │
      │ 1
      ▼ N
user_material_state
  id (PK, uuid)
  user_id      ──FK──▶ auth.users.id
  material_id  ──FK──▶ materials.id
  progress_status, last_viewed_at, is_favorite, note, review_status
  UNIQUE(user_id, material_id)

materials
  id (PK, text = index.json docId)
  title, subject, kind, source_url, file_path, updated_at
      │ 1
      ▼ 1
study_priorities
  material_id (PK, FK → materials.id)
  subject, priority, counts(jsonb), topics(jsonb)

comparison_topics (standalone — materials와는 jsonb 배열로 느슨하게 연결)
  id (PK, text)
  subject, topic, kind, status, change_type, severity, reason
  official(jsonb), related_materials(jsonb: material_id 참조 포함)
  last_compared_at, needs_review
```

- `materials` ↔ `comparison_topics`는 강한 FK 대신 `related_materials`(jsonb) 참조로 느슨하게 연결했습니다.
  원본 `comparisons.json`에서도 토픽 하나가 여러 자료(`lessons`/`taughtIn`/`usedIn`)에 걸치는 M:N 구조라,
  중간 조인 테이블을 새로 만드는 대신 jsonb + GIN 인덱스로 단순하게 유지했습니다.

---

## 6. Supabase Free 플랜 규모 검토

실제 파일 크기와 레코드 수를 기준으로 계산했습니다 (본문 텍스트는 DB로 옮기지 않는 설계이므로,
JSON 파일 전체 크기가 아니라 **DB화 대상 컬럼만** 반영했습니다).

| 테이블 | 현재 예상 행 수 | 행당 대략 크기 | 예상 총 용량 |
|---|---|---|---|
| `materials` | 393 | ~250~350B | 약 100~140KB |
| `study_priorities` | 89 | ~500~700B (topics jsonb 포함) | 약 50~65KB |
| `comparison_topics` | 355 | ~1~1.8KB (jsonb 필드 포함, 인용은 한 줄 제한) | 약 400~650KB |
| `user_material_state` | 현재 0 (신규 기능) | ~200~300B | 개인 사용 규모에서는 수백 행 수준(< 100KB) |

**현재 합계**: 대략 0.6~1MB 수준 (인덱스 포함해도 수 MB를 넘지 않을 것으로 추정됩니다).
**자료가 2배가 되었을 때(약 786건 자료, 비교/우선순위도 비례 증가 가정)**: 대략 1.2~2MB 수준으로,
여전히 매우 작은 규모입니다.

**원본 파일(Storage) 이전은 이번 계획에 없으므로 별도로 구분합니다** — `data/materials/`(373MB)는
이 계산에 포함하지 않았습니다. 위 표는 어디까지나 "가공 데이터를 담는 DB 테이블"만의 예상치입니다.

> **확인이 필요한 부분**: Supabase 무료 플랜의 정확한 현재 DB 용량 한도·행 수 한도·API 요청 한도는
> 시점에 따라 바뀔 수 있어 이 문서에서 특정 수치(예: "무료 플랜은 몇 GB까지")를 단정하지 않았습니다.
> 다만 위에서 계산한 실제 데이터 규모(수백 KB~수 MB)는 어떤 무료 플랜 기준으로도 **매우 작은 축**에
> 속할 가능성이 높습니다. 정확한 한도는 실제 적용 전에 https://supabase.com/pricing 등에서
> 직접 확인해 주세요.

---

## 7. PROJECT_CONTEXT.md 확정사항과의 정합성 자체 점검

- 원본 수업자료 자체는 DB로 이전하지 않음 → 준수 (본문 없이 식별자·경로만 저장)
- 원본 실습자료는 파일 구조에 보존 → 준수 (`data/materials/`는 그대로, 코드 본문도 DB로 옮기지 않음)
- Supabase에는 가공·사용자별 데이터만 → 준수
- 원본과 가공 데이터의 명확한 분리 → 준수 (5절 각 테이블에 원본 본문 컬럼 없음)
- 하이브리드 구조 유지 → 준수 (뷰어는 여전히 파일에서 본문을 읽고, DB에서는 상태/메타데이터만 읽는 구조)
- Storage 일괄 이전 아님 → 준수 (Storage는 이 설계에서 다루지 않음)
