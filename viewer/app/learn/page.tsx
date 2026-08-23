/**
 * 통합 학습자료 목록 — 공부를 시작하는 자리.
 *
 * ■ 왜 따로 있는가
 *
 * 수업자료는 393건인데 그 중 실습 코드까지 갖춘 것은 일부입니다.
 * "어디서부터 공부할까"를 물었을 때 393건을 다 보여주면 답이 되지 않습니다.
 *
 * 이 화면은 **강사 설명 + 실습 코드 + 공식 문서가 모두 갖춰진 자료만** 모아 보여줍니다.
 * 여기서 하나를 고르면 그대로 상세 화면으로 이어집니다.
 *
 * ■ 여기서 만들지 않습니다
 *
 * data/learning.json 을 읽어 보여주기만 합니다.
 * 학습자료를 새로 만드는 것은 CLI 의 `build-learning` 이 할 일입니다.
 */
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { NavCardArea } from "@/components/nav";
import { getLearningList, subjectLabel } from "@/lib/data";

export const metadata = { title: "통합 학습자료 · 수업자료 아카이브" };

export default async function LearnPage() {
  const items = await getLearningList();

  if (items.length === 0) {
    return (
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }} gutterBottom>
          통합 학습자료
        </Typography>
        <Typography color="text.secondary">
          아직 만들어진 학습자료가 없습니다. 터미널에서{" "}
          <Box component="code" sx={{ px: 0.7, py: 0.2, bgcolor: "action.hover", borderRadius: 0.5 }}>
            node src/index.ts build-learning
          </Box>{" "}
          을 실행하면 이 자리에 나타납니다.
        </Typography>
      </Box>
    );
  }

  // 과목별로 묶어 보여줍니다. 한 과목을 몰아서 공부하는 편이 자연스럽습니다.
  const bySubject = new Map<string, typeof items>();
  for (const item of items) {
    const list = bySubject.get(item.subject) ?? [];
    list.push(item);
    bySubject.set(item.subject, list);
  }

  const totals = {
    practice: items.reduce((sum, item) => sum + item.practiceCount, 0),
    code: items.reduce((sum, item) => sum + item.codeCount, 0),
    reference: items.reduce((sum, item) => sum + item.referenceCount, 0),
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }} gutterBottom>
        🎓 통합 학습자료
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        강사 수업 설명에 <strong>실제 실습 코드</strong>와 <strong>공식 문서</strong>를 함께 붙여 둔
        자료입니다. 하나를 고르면 설명 → 실습 코드 → 공식 문서 순서로 이어서 읽을 수 있습니다.
      </Typography>

      {/* ── 전체 규모 ── */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 4 }}>
        {[
          { label: "학습자료", value: items.length },
          { label: "연결된 실습파일", value: totals.practice },
          { label: "실습 코드 파일", value: totals.code },
          { label: "공식 문서", value: totals.reference },
        ].map((item) => (
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

      {/* ── 과목별 목록 ── */}
      {[...bySubject.entries()].map(([subject, list]) => (
        <Box key={subject} sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            {subjectLabel(subject)}
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
              gap: 2,
            }}
          >
            {list.map((item) => (
              <Card key={item.materialId} variant="outlined">
                <NavCardArea
                  href={`/m/${encodeURIComponent(item.materialId)}`}
                  sx={{ p: 2.5, height: "100%", alignItems: "flex-start" }}
                >
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1, flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {item.title}
                    </Typography>
                    <Chip
                      size="small"
                      label={item.bestConfidence === "high" ? "확실함" : "관련 있음"}
                      color={item.bestConfidence === "high" ? "primary" : "default"}
                      variant={item.bestConfidence === "high" ? "filled" : "outlined"}
                    />
                  </Box>

                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                    <Chip size="small" variant="outlined" label={`실습파일 ${item.practiceCount}`} />
                    <Chip size="small" variant="outlined" label={`코드 ${item.codeCount}`} />
                    {item.referenceCount > 0 && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="primary"
                        label={`공식문서 ${item.referenceCount}`}
                      />
                    )}
                  </Box>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", lineHeight: 1.6 }}
                  >
                    📦 {item.zipTitles.join(" · ")}
                  </Typography>
                </NavCardArea>
              </Card>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
