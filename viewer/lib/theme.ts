"use client";

/**
 * 화면 색과 글꼴 설정.
 *
 * 읽는 도구이므로 화려함보다 **오래 읽어도 편한 것**을 목표로 했습니다.
 * 밝은 화면과 어두운 화면 모두, 브라우저(운영체제) 설정을 그대로 따릅니다.
 */
import { createTheme } from "@mui/material/styles";

/**
 * Light/Dark 팔레트 (design-mockups-v2 기준).
 *
 * Light — 밝고 깨끗한 neutral/cool 계열. teal 은 포인트 컬러로만 씁니다.
 * Dark — 장시간 코드/문서 학습에 맞춘 낮은 밝기. 보조 텍스트와 코드 배경의
 *        대비를 Light 보다 한 단계 더 올렸습니다 (V2 디자인 검토 반영 항목).
 */
export const theme = createTheme({
  // 시스템 설정을 기본값으로 따르되, AppShell 의 토글로 사용자가 직접 바꿀 수 있습니다.
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#0d9488", dark: "#0f766e", light: "#5eead4", contrastText: "#ffffff" },
        background: { default: "#f6f8f8", paper: "#ffffff" },
        text: { primary: "#1b2427", secondary: "#54646b" },
        divider: "#e1e7e8",
        action: { hover: "#eef2f2", selected: "#e3f2f0" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#2dd4bf", dark: "#14b8a6", light: "#99f6e4", contrastText: "#06201d" },
        background: { default: "#12181b", paper: "#1a2225" },
        text: { primary: "#e7edee", secondary: "#b7c3c6" },
        divider: "#2c3639",
        action: { hover: "#212b2e", selected: "#1c3532" },
      },
    },
  },
  cssVariables: { colorSchemeSelector: "class" },

  typography: {
    // 한글이 잘 나오는 글꼴을 앞에 둡니다.
    fontFamily: [
      "Pretendard",
      "-apple-system",
      "Malgun Gothic",
      "맑은 고딕",
      "system-ui",
      "sans-serif",
    ].join(","),
    // 본문은 조금 크게 — 코드와 설명을 오래 읽게 되므로
    body1: { fontSize: "0.95rem", lineHeight: 1.75 },
    body2: { fontSize: "0.875rem", lineHeight: 1.7 },
  },

  shape: { borderRadius: 6 },

  components: {
    // 표와 코드가 많아 여백을 조금 줄입니다.
    MuiListItemButton: {
      styleOverrides: { root: { paddingTop: 4, paddingBottom: 4 } },
    },
    // 과도한 그림자를 피하고 테두리로만 카드를 구분합니다 (V2 디자인 방향).
    MuiPaper: {
      defaultProps: { elevation: 0 },
    },
  },
});
