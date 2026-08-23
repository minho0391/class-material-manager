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

**P1-1 실패 문서 우선 복구** — 진행 중

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
- [ ] P1-1 실패 문서 우선 복구 (failedDocuments 활용)
- [ ] P1-2 backup / restore
- [ ] P1-3 CLI 사용성 (help 정리)
- [ ] P1-4 Viewer 오류 fallback
- [ ] P1-5 Viewer 최종 사용성
- [ ] P1-6 자동 테스트 확장

### P2 — 품질 강화
- [ ] P2-1 Playwright E2E 검토/구현
- [ ] P2-2 성능 점검
- [ ] P2-3 코드 정리
- [ ] P2-4 재현성 검증

### P3 — 마무리
- [ ] P3-1 README FINAL
- [ ] P3-2 docs/FUTURE.md
- [ ] P3-3 전체 최종 테스트
- [ ] P3-4 보안 최종 검사
- [ ] P3-5 final commit + push
- [ ] P3-6 v1.0.0 tag 검토

### 17단계에서 넘어온 검토 항목
- [x] 민감정보 정리 / 공개 준비 → P0-4 에서 완료
- [x] 게시형 Google 문서 지문 → P0-5 에서 완료
- [ ] 실행 간 이어받기 → 가치 판단 필요
- [ ] failedDocuments 우선 재시도 → P1-1 에서

## 마지막 테스트 결과

```
155건 통과 / 0건 실패 (P0 완료)
```

## 마지막 정상 commit

```
8f34854  Google 게시 문서 지문 안정화 (P0-5) — origin/main 에 push 됨
```

## 다음 세션이 이어서 해야 할 일

위 "남은 작업" 의 체크되지 않은 첫 항목부터 진행하면 됩니다.
