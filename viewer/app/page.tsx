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
  getDataHealth,
} from "@/lib/data";

export default async function HomePage() {
  const [subjects, stats, learning, comparisons, study, collect, health] = await Promise.all([
    getSubjects(),
    getStats(),
    getLearningList(),
    getComparisons(),
    getStudyGuides(),
    getCollectStatus(),
    getDataHealth(),
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

  // ── 자료를 읽지 못했으면 그것부터 알립니다 ── (18단계)
  //
  // 조용히 빈 화면을 보여주면, 자료가 사라진 것인지 아직 안 만든 것인지 알 수 없습니다.
  if (!health.ok) {
    return (
      <Box sx={{ maxWidth: "60ch" }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
          수업자료 아카이브
        </Typography>

        {health.problem === "unreadable" ? (
          <Paper variant="outlined" sx={{ p: 3, borderColor: "error.main" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              ✗ 자료 파일을 읽지 못했습니다
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              <code>data/index.json</code> 이 깨졌을 수 있습니다. 자료가 사라진 것은 아닙니다 —
              파일 하나를 읽지 못한 것입니다.
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              백업으로 되돌릴 수 있습니다.
            </Typography>
            <Box component="pre" sx={{ m: 0, p: 1.5, bgcolor: "action.hover", borderRadius: 1, fontSize: "0.8rem" }}>
              npm run restore
            </Box>
          </Paper>
        ) : (
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              아직 자료가 없습니다
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              터미널에서 아래를 차례로 실행하면 이 자리에 수업자료가 나타납니다.
            </Typography>
            <Box component="pre" sx={{ m: 0, p: 1.5, bgcolor: "action.hover", borderRadius: 1, fontSize: "0.8rem" }}>
{`node src/index.ts auth      # 처음 한 번만
node src/index.ts extract
npm run refresh`}
            </Box>
          </Paper>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
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
              component="p"
             
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
        <Card
          variant="outlined"
          sx={{
            mb: 5,
            borderColor: "primary.main",
            // 첫 행동을 눈에 띄게 — 통계 카드보다 이 카드가 먼저 눈에 들어와야 합니다.
            // 서버 컴포넌트에서는 라이트/다크를 직접 분기할 함수를 넘길 수 없으므로,
            // lib/theme.ts 가 스킴별로 이미 다르게 정의해 둔 팔레트 토큰(action.selected)을 그대로 씁니다.
            bgcolor: "action.selected",
          }}
        >
          {/*
            가로형 배너 — design-mockups-v2 01번(홈) 기준.
            아이콘 · 설명 · CTA 를 한 줄에 두어 "다음 행동"이 세로 카드보다 바로 보이게 합니다.
          */}
          <NavCardArea href="/learn" sx={{ p: 3, flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.4rem",
                bgcolor: "primary.main",
                color: "primary.contrastText",
              }}
            >
              🎓
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
                통합 학습자료 {learning.length}편부터 시작하세요
              </Typography>
              <Typography variant="body2" color="text.secondary">
                강사 수업 설명에 실제 실습 코드 {learningCode}개와 공식 문서를 함께 붙여 두었습니다.
                설명 → 실습 코드 → 공식 문서 순서로 이어서 읽을 수 있습니다.
              </Typography>
            </Box>
            <Chip
              size="small"
              color="primary"
              label="학습자료 보러가기 →"
              sx={{ flexShrink: 0, display: { xs: "none", sm: "inline-flex" } }}
            />
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
            <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
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
            <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
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
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 2 }}>
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
