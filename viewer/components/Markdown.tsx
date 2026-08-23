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

export function Markdown({ children }: { children: string }) {
  return (
    <Box
      sx={{
        // 읽기 좋은 너비로 제한합니다. 글줄이 너무 길면 눈이 따라가기 힘듭니다.
        maxWidth: "72ch",
        wordBreak: "break-word",

        "& h1": { fontSize: "1.6rem", mt: 4, mb: 1.5, fontWeight: 700 },
        "& h2": { fontSize: "1.3rem", mt: 3.5, mb: 1.2, fontWeight: 700 },
        "& h3": { fontSize: "1.1rem", mt: 3, mb: 1, fontWeight: 600 },
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
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </Box>
  );
}
