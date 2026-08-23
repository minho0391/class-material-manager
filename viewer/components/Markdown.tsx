"use client";

/**
 * 마크다운을 화면에 그리는 부분.
 *
 * 수업자료는 Google Docs 에서 받아온 마크다운이라
 * 제목·표·코드블록·링크가 모두 들어 있습니다.
 * remark-gfm 을 붙이는 이유는 **표**를 그리기 위해서입니다.
 * (기본 마크다운에는 표가 없습니다)
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Box from "@mui/material/Box";

/**
 * 본문 제목을 한 단계씩 낮춥니다. (18단계)
 *
 * 강사님 문서는 `# 제목` 으로 시작합니다. 그대로 그리면 한 화면에 `<h1>` 이 여럿 생기고,
 * 화면 제목과 본문 제목이 같은 높이가 됩니다. 화면 낭독기는 그것을 보고
 * "이 페이지의 주제가 여덟 개" 라고 읽습니다.
 *
 * 보이는 크기는 그대로 두고 **의미만** 한 단계 내립니다 — h1→h2, h2→h3 …
 * 페이지 제목이 유일한 `<h1>` 이 되고, 본문은 그 아래로 들어갑니다.
 */
const DEMOTED_HEADINGS = {
  h1: "h2",
  h2: "h3",
  h3: "h4",
  h4: "h5",
  h5: "h6",
} as const;

export function Markdown({ children }: { children: string }) {
  return (
    <Box
      sx={{
        // 읽기 좋은 너비로 제한합니다. 글줄이 너무 길면 눈이 따라가기 힘듭니다.
        maxWidth: "72ch",
        wordBreak: "break-word",

        // 제목을 한 단계 낮춰 그리므로, 크기 규칙도 한 단계씩 옮겨 적습니다.
        // 보이는 모습은 예전과 똑같습니다.
        "& h2": { fontSize: "1.6rem", mt: 4, mb: 1.5, fontWeight: 700 },
        "& h3": { fontSize: "1.3rem", mt: 3.5, mb: 1.2, fontWeight: 700 },
        "& h4": { fontSize: "1.1rem", mt: 3, mb: 1, fontWeight: 600 },
        "& h4, & h5, & h6": { fontSize: "1rem", mt: 2.5, mb: 0.8, fontWeight: 600 },

        "& p": { my: 1.5, lineHeight: 1.8 },
        "& ul, & ol": { pl: 3, my: 1.5 },
        "& li": { my: 0.5 },

        "& a": { color: "primary.main" },

        // 코드블록 — 강사님이 표 안에 넣어 두신 코드를 5단계에서 복원해 두었습니다.
        "& pre": {
          bgcolor: "action.hover",
          p: 2,
          borderRadius: 1,
          overflowX: "auto",
          fontSize: "0.85rem",
          lineHeight: 1.6,
        },
        "& code": {
          fontFamily: "'D2Coding', 'Consolas', monospace",
          fontSize: "0.875em",
        },
        // 문장 속 코드에만 배경을 넣습니다 (코드블록 안에는 넣지 않습니다)
        "& :not(pre) > code": {
          bgcolor: "action.hover",
          px: 0.7,
          py: 0.2,
          borderRadius: 0.5,
        },

        // 표는 가로로 넘칠 수 있으므로 스스로 스크롤되게 합니다.
        "& table": {
          borderCollapse: "collapse",
          display: "block",
          overflowX: "auto",
          maxWidth: "100%",
          my: 2,
          fontSize: "0.875rem",
        },
        "& th, & td": {
          border: "1px solid",
          borderColor: "divider",
          px: 1.5,
          py: 0.8,
          textAlign: "left",
          verticalAlign: "top",
        },
        "& th": { bgcolor: "action.hover", fontWeight: 600 },

        "& blockquote": {
          borderLeft: "3px solid",
          borderColor: "divider",
          pl: 2,
          ml: 0,
          my: 2,
          color: "text.secondary",
        },

        "& img": { maxWidth: "100%" },
        "& hr": { border: 0, borderTop: "1px solid", borderColor: "divider", my: 3 },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <Box component={DEMOTED_HEADINGS.h1}>{children}</Box>,
          h2: ({ children }) => <Box component={DEMOTED_HEADINGS.h2}>{children}</Box>,
          h3: ({ children }) => <Box component={DEMOTED_HEADINGS.h3}>{children}</Box>,
          h4: ({ children }) => <Box component={DEMOTED_HEADINGS.h4}>{children}</Box>,
          h5: ({ children }) => <Box component={DEMOTED_HEADINGS.h5}>{children}</Box>,
        }}>{children}</ReactMarkdown>
    </Box>
  );
}
