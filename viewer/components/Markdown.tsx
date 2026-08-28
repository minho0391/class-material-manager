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

import { createHeadingIdAssigner } from "@/lib/toc";
import { safeMarkdownUrl } from "@/lib/url";

/** 제목 자식(문자열·강조 등이 섞인 React 트리)을 순수 텍스트로 풀어냅니다. */
function flattenText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return flattenText((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
}

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
  // 최상위 제목(h1)마다 "이 페이지" 목차(lib/toc.ts)와 같은 규칙으로 id 를 매깁니다.
  // 렌더링마다 새로 만들어야 문서가 바뀌어도 번호가 어긋나지 않습니다.
  const assignId = createHeadingIdAssigner();

  return (
    <Box
      sx={{
        // 읽기 좋은 너비로 제한합니다. 글줄이 너무 길면 눈이 따라가기 힘듭니다.
        maxWidth: "82ch",
        wordBreak: "break-word",

        // 제목을 한 단계 낮춰 그리므로, 크기 규칙도 한 단계씩 옮겨 적습니다.
        // 보이는 모습은 예전과 똑같습니다.
        "& h2": { fontSize: "1.6rem", mt: 4, mb: 1.5, fontWeight: 700, scrollMarginTop: 88 },
        "& h3": { fontSize: "1.3rem", mt: 3.5, mb: 1.2, fontWeight: 700 },
        "& h4": { fontSize: "1.1rem", mt: 3, mb: 1, fontWeight: 600 },
        "& h4, & h5, & h6": { fontSize: "1rem", mt: 2.5, mb: 0.8, fontWeight: 600 },

        "& p": { my: 1.5, lineHeight: 1.8 },
        "& ul, & ol": { pl: 3, my: 1.5 },
        "& li": { my: 0.5 },

        "& a": { color: "primary.main" },

        // 코드블록 — 강사님이 표 안에 넣어 두신 코드를 5단계에서 복원해 두었습니다.
        // 장시간 학습을 감안해 글자 크기·행간을 본문 코드보다 넉넉하게 잡고,
        // 옅은 테두리로 배경과의 경계를 분명히 합니다 (Dark 대비 개선, V2 검토 반영).
        "& pre": {
          bgcolor: "action.hover",
          border: "1px solid",
          borderColor: "divider",
          p: 2,
          borderRadius: 1,
          // 긴 한 줄 코드도 화면 폭 안에서 접히게 합니다. `pre-wrap` 은 원문의 공백·개행을
          // 그대로 두면서 **공백 위치에서 우선** 줄을 접고, `overflow-wrap: anywhere` 는
          // 공백 없는 아주 긴 토큰(URL·해시 등)만 강제로 끊습니다. 저장된 Markdown/DB
          // 원문에는 개행을 넣지 않으므로 이는 화면 표시 방식일 뿐입니다.
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          overflowX: "auto",
          fontSize: "0.9rem",
          lineHeight: 1.7,
        },
        "& code": {
          fontFamily: "'D2Coding', 'Consolas', monospace",
          fontSize: "0.9em",
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
        urlTransform={safeMarkdownUrl}
        components={{
          h1: ({ children }) => (
            <Box id={assignId(flattenText(children))} component={DEMOTED_HEADINGS.h1}>
              {children}
            </Box>
          ),
          h2: ({ children }) => <Box component={DEMOTED_HEADINGS.h2}>{children}</Box>,
          h3: ({ children }) => <Box component={DEMOTED_HEADINGS.h3}>{children}</Box>,
          h4: ({ children }) => <Box component={DEMOTED_HEADINGS.h4}>{children}</Box>,
          h5: ({ children }) => <Box component={DEMOTED_HEADINGS.h5}>{children}</Box>,
        }}>{children}</ReactMarkdown>
    </Box>
  );
}
