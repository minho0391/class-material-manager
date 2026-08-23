/**
 * 모든 페이지를 감싸는 바깥 틀.
 *
 * 여기서 과목 목록을 한 번 읽어 화면 뼈대(AppShell)에 넘겨줍니다.
 * 사이드바는 어느 페이지에서나 같아야 하므로 이 자리가 알맞습니다.
 */
import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";

import { theme } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";
import { getStats, getSubjects } from "@/lib/data";

export const metadata: Metadata = {
  title: "수업자료 아카이브",
  description: "오르미 프론트엔드 13기 수업자료와 공식 문서 요약을 모아 읽는 곳",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [subjects, stats] = await Promise.all([getSubjects(), getStats()]);

  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {/* 화면이 처음 그려질 때 밝게/어둡게가 깜빡이지 않도록 미리 정합니다. */}
        <InitColorSchemeScript attribute="class" />

        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <AppShell subjects={subjects} referenceTotal={stats.references}>
              {children}
            </AppShell>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
