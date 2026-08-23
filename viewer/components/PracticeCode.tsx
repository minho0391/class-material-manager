/**
 * 관련 실습 코드를 보여주는 부분.
 *
 * ■ 무엇을 보여주는가
 *
 * 수업 설명을 읽은 뒤 "그래서 실제 코드는 어떻게 생겼나"를 바로 볼 수 있게 합니다.
 * 강사님이 준 실습파일 안의 코드를 **그대로** 보여줍니다. 고치거나 다듬지 않습니다.
 *
 * ■ 왜 연결 근거까지 보여주는가
 *
 * 이 연결은 사람이 하나하나 확인한 것이 아니라 규칙으로 찾아낸 것입니다.
 * 그래서 "왜 이 코드가 여기 붙었는지"를 함께 보여줍니다.
 * 근거가 보이면 어긋난 연결을 사용자가 스스로 알아볼 수 있습니다.
 *
 * ■ 문법 색칠(syntax highlighting)을 넣지 않은 이유
 *
 * 라이브러리를 하나 더 들이는 값에 견주어 얻는 것이 적습니다.
 * 등폭 글꼴과 옅은 배경만으로도 코드는 충분히 읽힙니다.
 * (뷰어의 다른 코드블록도 같은 방식입니다 — 화면이 서로 어긋나지 않습니다)
 */
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import type { LearningPractice } from "@/lib/data";

/** 신뢰도를 사람이 읽을 말로 */
const CONFIDENCE_LABEL: Record<string, string> = {
  high: "확실함",
  medium: "관련 있음",
};

export function PracticeCode({ practice }: { practice: LearningPractice[] }) {
  if (practice.length === 0) return null;

  return (
    <Box sx={{ mt: 5, maxWidth: "72ch" }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        💻 관련 실습 코드
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        수업에서 쓴 실습파일에서 이 내용과 관련 있는 코드만 골라 왔습니다. 코드는 원본 그대로입니다.
      </Typography>

      {practice.map((item) => (
        <Paper key={item.zipId} variant="outlined" sx={{ mb: 3, overflow: "hidden" }}>
          {/* ── 실습파일 머리말 ── */}
          <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                📦 {item.zipTitle}
              </Typography>
              <Chip
                size="small"
                label={CONFIDENCE_LABEL[item.confidence] ?? item.confidence}
                color={item.confidence === "high" ? "primary" : "default"}
                variant={item.confidence === "high" ? "filled" : "outlined"}
              />
              <Typography variant="caption" color="text.secondary">
                {item.sourceFiles.length}개 파일
              </Typography>
            </Box>

            {/* ── 왜 이어졌는지 ── */}
            <Box
              component="ul"
              sx={{ m: 0, pl: 2.5, listStyleType: "'· '", color: "text.secondary" }}
            >
              {item.reasons.map((reason) => (
                <Typography
                  key={reason}
                  component="li"
                  variant="caption"
                  sx={{ display: "list-item", lineHeight: 1.7 }}
                >
                  {reason}
                </Typography>
              ))}
            </Box>
          </Box>

          {/* ── 소스 파일들 ── */}
          {item.sourceFiles.map((file) => (
            <Box key={file.path}>
              <Divider />
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  bgcolor: "action.hover",
                  display: "flex",
                  gap: 1,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ fontFamily: "'D2Coding', 'Consolas', monospace", fontWeight: 600 }}
                >
                  {file.path}
                </Typography>
                <Chip size="small" variant="outlined" label={file.language} />
                {file.reason && (
                  <Typography variant="caption" color="text.secondary">
                    {file.reason}
                  </Typography>
                )}
              </Box>

              {/*
                긴 파일도 화면을 다 잡아먹지 않게 높이를 제한하고 안에서 스크롤되게 합니다.
                가로로도 넘칠 수 있으므로 줄바꿈하지 않고 가로 스크롤을 씁니다.
                (코드는 줄을 접으면 오히려 읽기 어렵습니다)
              */}
              <Box
                component="pre"
                sx={{
                  m: 0,
                  px: 2,
                  py: 1.5,
                  maxHeight: 460,
                  overflow: "auto",
                  fontSize: "0.8rem",
                  lineHeight: 1.65,
                  fontFamily: "'D2Coding', 'Consolas', monospace",
                }}
              >
                <code>{file.code}</code>
              </Box>
            </Box>
          ))}
        </Paper>
      ))}
    </Box>
  );
}
