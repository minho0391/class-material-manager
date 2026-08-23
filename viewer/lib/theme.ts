"use client";

/**
 * 화면 색과 글꼴 설정.
 *
 * 읽는 도구이므로 화려함보다 **오래 읽어도 편한 것**을 목표로 했습니다.
 * 밝은 화면과 어두운 화면 모두, 브라우저(운영체제) 설정을 그대로 따릅니다.
 */
import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  // 시스템 설정(밝게/어둡게)을 따라갑니다.
  colorSchemes: { light: true, dark: true },
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
  },
});
