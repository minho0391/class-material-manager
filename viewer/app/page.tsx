/**
 * 홈 화면 — 전체 규모와 과목별 카드.
 */
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { NavCardArea } from "@/components/nav";
import {
  getComparisons,
  getLearningList,
  getStats,
  getStudyGuides,
  getSubjects,
  COLLECT_LABEL,
  COLLECT_MEANING,
  getCollectStatus,
} from "@/lib/data";

export default async function HomePage() {
  const [subjects, stats, learning, comparisons, study, collect] = await Promise.all([
    getSubjects(),
    getStats(),
    getLearningList(),
    getComparisons(),
    getStudyGuides(),
    getCollectStatus(),
  ]);

  // 눈여겨볼 것(그대로 사용 가능이 아닌 것)만 셉니다.
  const checkCount = comparisons.items.filter((item) => item.status !== "CURRENT").length;

  // 복습이 필요한 자료 — "그대로 복습" 이 아닌 것만 셉니다. (15단계)
  const relearnCount = study.materials.filter((material) => material.priority !== "KEEP").length;

  const learningCode = learning.reduce((sum, item) => sum + item.codeCount, 0);

  const numbers = [
    { label: "수업자료", value: stats.materials },
    { label: "공식 문서 요약", value: stats.references },
    { label: "과목", value: stats.subjects },
    { label: "원본 파일", value: stats.files },
  ];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }} gutterBottom>
        수업자료 아카이브
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        오르미 프론트엔드 13기 수업자료를 과목별로 정리하고, 각 기술의 공식 문서 요약을 함께 담았습니다.
      </Typography>

      {/* ── 전체 규모 ── */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 5 }}>
        {numbers.map((item) => (
          <Paper
            key={item.label}
            variant="outlined"
            sx={{ px: 3, py: 2, minWidth: 130, flex: "1 1 130px" }}
          >
            <Typography
              variant="h4"
             
              sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}
            >
              {item.value}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.label}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/*
        ── 공부를 시작하는 자리 ──
        자료를 "찾아보는" 것과 "공부를 시작하는" 것은 다릅니다.
        393건을 늘어놓기 전에, 바로 읽을 수 있게 갖춰진 자료로 안내합니다.
      */}
      {learning.length > 0 && (
        <Card variant="outlined" sx={{ mb: 5, borderColor: "primary.main" }}>
          <NavCardArea href="/learn" sx={{ p: 3, alignItems: "flex-start" }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              🎓 통합 학습자료 {learning.length}편부터 시작하세요
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              강사 수업 설명에 실제 실습 코드 {learningCode}개와 공식 문서를 함께 붙여 두었습니다.
              설명 → 실습 코드 → 공식 문서 순서로 이어서 읽을 수 있습니다.
            </Typography>
            <Chip size="small" color="primary" label="학습자료 보러 가기 →" />
          </NavCardArea>
        </Card>
      )}

      {/*
        ── 수업 방식 점검 ──
        수업자료는 시간이 지나면 낡습니다. 무엇을 다시 봐야 하는지 여기서 알립니다.
      */}
      {/*
        ── 공식 문서가 최신인가 ── (16단계)
        정상일 때는 아무 말도 하지 않습니다. 알릴 것이 있을 때만 한 줄 나옵니다.
      */}
      {collect && collect.status !== "SUCCESS" && (
        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 3, borderColor: collect.status === "FAILED" ? "error.main" : "warning.main" }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            ⚠ 공식 문서: {COLLECT_LABEL[collect.status] ?? collect.status}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {COLLECT_MEANING[collect.status]}
            {collect.rateLimited && " GitHub API 요청 한도를 넘겼습니다."}
            {collect.failedDocumentCount > 0 &&
              ` 공식 문서 ${collect.failedDocumentCount}건을 받지 못했습니다.`}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            마지막 시도 {collect.checkedAt.slice(0, 10)}
            {collect.lastSuccessAt && ` · 마지막 성공 ${collect.lastSuccessAt.slice(0, 10)}`}
            {collect.staleSubjects.length > 0 && ` · 못 받은 과목: ${collect.staleSubjects.join(", ")}`}
          </Typography>
        </Paper>
      )}

      {/*
        ── 다시 공부하기 ── (15단계)
        점검 결과가 "무엇이 달라졌나" 라면, 이쪽은 "그래서 어디부터 볼까" 입니다.
      */}
      {relearnCount > 0 && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <NavCardArea href="/study" sx={{ p: 3, alignItems: "flex-start" }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              📚 다시 공부하기 — 먼저 볼 자료 {relearnCount}건
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              수업에서 배운 것을 지금 기준으로 다시 볼 때 무엇을 어떻게 보면 되는지 정리했습니다.
              나머지 자료는 그대로 다시 봐도 됩니다.
            </Typography>
            <Chip size="small" label="복습 목록 보기 →" />
          </NavCardArea>
        </Card>
      )}

      {checkCount > 0 && (
        <Card variant="outlined" sx={{ mb: 5 }}>
          <NavCardArea href="/compare" sx={{ p: 3, alignItems: "flex-start" }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              ⚖️ 수업 방식 점검 — 다시 볼 것 {checkCount}건
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              수업 때 쓴 기술을 현재 공식 문서와 견주었습니다. 사용이 중단됐거나 버전이 벌어진 것을
              근거와 함께 보여줍니다.
            </Typography>
            <Chip size="small" label="점검 결과 보기 →" />
          </NavCardArea>
        </Card>
      )}

      {/* ── 과목별 카드 ── */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
        과목
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
          gap: 2,
        }}
      >
        {subjects.map((subject) => (
          <Card key={subject.id} variant="outlined">
            <NavCardArea
              href={`/s/${encodeURIComponent(subject.id)}`}
              sx={{ p: 2.5, height: "100%", alignItems: "flex-start" }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {subject.label}
              </Typography>

              <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                <Chip size="small" label={`자료 ${subject.count}건`} />
                {subject.referenceCount > 0 && (
                  <Chip
                    size="small"
                    variant="outlined"
                    color="primary"
                    label={`공식문서 ${subject.referenceCount}`}
                  />
                )}
              </Box>
            </NavCardArea>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
