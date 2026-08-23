# 18단계 (v1 FINAL) — 진행 기록

> 이 파일은 **세션이 중간에 끊겨도 이어서 작업할 수 있게** 하려고 둡니다.
> 새 세션은 `README.md` → 이 파일 → `git log` → `git status` 순으로 읽으면 됩니다.

## 목적

1~17단계에서 만든 것을 **실제로 계속 쓸 수 있는 Class Material Manager v1** 으로 닫습니다.
새 실험을 더 붙이는 단계가 아니라, 안전성·복구·사용성·문서를 마무리하는 단계입니다.

## 시작 checkpoint

```
commit  5c49088bb431e299864544a53e964d5a9b6546e5
branch  main
remote  https://github.com/minho0391/class-material-manager (private)
```

이 commit 은 v1 직전 안전 지점입니다. **force push · history rewrite 금지.**

## Baseline (18단계 시작 시점)

| 항목 | 값 |
|---|---|
| 자동 테스트 | 120건 통과 (27 suites) |
| package.json version | 0.1.0 |
| scripts | refresh · extract · typecheck · test |
| docs | OAUTH-SETUP.md |

회귀 기준 (17단계 완료 시)

```
자료 393 · ZIP 116 · PDF 15 · 소스 837
연결 62 (high 19 / medium 20 / low 23)
학습자료 27 · 코드 109 · 공식문서 연결 82
공식문서 요약 203 · INDEX.md 8 · data/references 전체 .md 211
비교 355 · 학습 설명 355 · 수업자료 묶음 89 · 손볼 자료 19
```

---

## 현재 작업

**끝났습니다 — v1.0.0 마감 완료.**

## 완료된 작업

- [x] P0-1 `docs/FINAL-PROGRESS.md` 생성
- [x] P0-2 baseline 확보 (테스트 120건 통과)

## 남은 작업

### P0 — 반드시 먼저
- [x] P0-3 데이터 안전성 — 쓰기 16곳 전부 원자적으로 (commit 415b316)
- [x] P0-4 민감정보 검사 — `npm run security-check` · 자료/git 대상 구분 · 값 마스킹
- [x] P0-5 Google 게시 문서 지문 안정화 — 되풀이 저장·분류 멈춤 확인
- [x] P0-6 보안 검사 자기 검증 — allowlist 표시 + 건너뛴 줄 수 보고

### P1 — v1 완성
- [x] P1-1 실패 문서 우선 복구 — 순서만 바꿈(건너뛰기 아님) · 이름 충돌 승자 안정화
- [x] P1-2 backup / restore — 3.8MB · refresh 전 자동 백업 · 실제 손상 복구 검증
- [x] P1-3 CLI 사용성 — 명령 16개 도움말 일치 확인 · 처음 순서/Viewer 실행 추가
- [x] P1-4 Viewer 오류 fallback — 500 → 안내 화면 (없음/못 읽음 구분)
- [x] P1-5 Viewer 최종 사용성 — heading 구조 바로잡음 (h1 1개/페이지)
- [x] P1-6 자동 테스트 — 120 → 174건 확장

### P2 — 품질 강화
- [x] P2-1 Playwright E2E — 13건 (브라우저 캐시가 이미 있어 설치 비용 작음)
- [x] P2-2 성능 점검 — 명백한 병목 없음 (파일 캐시·증분 갱신이 이미 있음)
- [x] P2-3 코드 정리 — 죽은 함수 2개 · 미사용 import 16파일
- [x] P2-4 재현성 — 연속 3회 refresh 에서 내용 동일 (시각만 바뀜)

### P3 — 마무리
- [x] P3-1 README FINAL — 14~18단계 추가 · 명령 모음 · v1.0.0 마감 표
- [x] P3-2 docs/FUTURE.md — 알려진 한계 5가지와 이유
- [x] P3-3 전체 최종 테스트 — typecheck · 174건 · E2E 13건 전부 통과
- [x] P3-4 보안 최종 검사 — 통과 (git 추적 파일에는 없음)
- [x] P3-5 final commit + push
- [x] P3-6 v1.0.0 tag

### 17단계에서 넘어온 검토 항목
- [x] 민감정보 정리 / 공개 준비 → P0-4 에서 완료
- [x] 게시형 Google 문서 지문 → P0-5 에서 완료
- [x] 실행 간 이어받기 → **하지 않기로 결정** (이유는 docs/FUTURE.md 한계 3)
- [x] failedDocuments 우선 재시도 → P1-1 에서 완료

## 마지막 테스트 결과

```
typecheck        통과
npm test         174건 전부 통과 (43 suites)
npm run e2e      13건 전부 통과 (chromium)
security-check   통과 — git 추적 106개 파일에 민감정보 없음
                 자료(data/) 의심 7건은 .gitignore 대상이라 새어 나가지 않음

자료 회귀 확인 (17단계 기준과 같음)
  자료 393 · ZIP 116 · PDF 15 · 소스 837
  연결 62 (high 19 / medium 20 / low 23)
  학습자료 27 · 코드 109
  공식문서 요약 .md 211 · INDEX.md 8
  비교 355 · 학습 설명 355 · 수업자료 묶음 89 · 손볼 자료 19
```

## 마감 중에 실제로 고친 것

### 줄바꿈이 CRLF 로 받아지면 시험 하나가 깨졌습니다

**어떻게 드러났나** — 세션이 끊겨 작업 폴더의 추적 파일이 전부 사라져 있었습니다.
`git checkout` 으로 되살렸더니 `npm test` 가 174건 중 **1건 실패**했습니다.

```
tests/viewer-fallback.test.ts
  학습자료·비교·학습설명·수집상태 읽기가 모두 붙잡혀 있습니다
  → loadLearning 의 끝을 찾지 못했습니다
```

**원인** — 저장소 안(blob)은 LF 인데 Windows 기본값 `core.autocrlf=true` 가
checkout 할 때 CRLF 로 바꿉니다. 이 시험은 `viewer/lib/data.ts` 를 글자 그대로 읽어
`"
}
"` 으로 함수의 끝을 찾는데, CRLF 파일에서는 그 자리가 `"
}
"` 이라
영영 찾지 못합니다.

**중요한 점** — 이미 받아 둔 폴더에서는 재현되지 않습니다.
**새로 clone 한 사람에게서만** 터집니다. P2-4 재현성 확인은 같은 폴더에서 돌린 것이라
이 문제를 지나쳤고, 18단계 최종 검증에서야 잡혔습니다.

**고친 방법** — `.gitattributes` 를 만들어 `* text=auto eol=lf` 로 못 박았습니다.
소스는 한 줄도 고치지 않았습니다 (내용 해시가 HEAD 와 같은 것을 확인).
어떤 OS·어떤 설정에서 clone 해도 작업 폴더가 LF 로 통일됩니다.

**확인** — 고친 뒤 174건 전부 통과. 새로 clone 해서도 LF 로 받아지는 것을 따로 확인했습니다.

## 마지막 정상 commit

```
v1.0.0 — 18단계 마감. origin/main 에 push 됨
```

## 다음 세션이 이어서 해야 할 일

**없습니다. 18단계는 끝났습니다.**
19단계를 시작한다면 [docs/FUTURE.md](FUTURE.md) 의 "해 볼 만한 것" 부터 보면 됩니다.
