"use client";

/**
 * 화면 뼈대 — 위쪽 막대와 왼쪽 과목 목록.
 *
 * 모든 페이지가 이 안에 담깁니다.
 * 과목과 자료 수가 항상 보여서 어디에 무엇이 있는지 파악하기 쉽습니다.
 */
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import NextLink from "next/link";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import Paper from "@mui/material/Paper";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

import type { SubjectInfo } from "@/lib/data";

const DRAWER_WIDTH = 240;

/** 위쪽 검색창 */
function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <Paper
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        if (query.length >= 2) router.push(`/search?q=${encodeURIComponent(query)}`);
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        px: 1.5,
        py: 0.3,
        width: { xs: 160, sm: 280, md: 360 },
      }}
      elevation={0}
    >
      <Box component="span" sx={{ mr: 1, opacity: 0.6 }}>
        🔍
      </Box>
      <InputBase
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="제목·본문 검색 (2글자 이상)"
        sx={{ flex: 1, fontSize: "0.9rem" }}
        inputProps={{ "aria-label": "자료 검색" }}
      />
    </Paper>
  );
}

/** 왼쪽 과목 목록 */
function SubjectList({ subjects, onNavigate }: { subjects: SubjectInfo[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  // 기술 과목과 그 밖의 것을 나눠서 보여줍니다.
  const technical = subjects.filter((s) => !s.id.startsWith("others/") && s.id !== "_unclassified");
  const others = subjects.filter((s) => s.id.startsWith("others/") || s.id === "_unclassified");

  const renderItem = (subject: SubjectInfo) => {
    const href = `/s/${encodeURIComponent(subject.id)}`;
    const selected = pathname === href;
    // jQuery 처럼 하위 과목이면 살짝 들여씁니다.
    const nested = subject.id.includes("/") && !subject.id.startsWith("others/");

    return (
      <ListItemButton
        key={subject.id}
        component={NextLink}
        href={href}
        selected={selected}
        onClick={onNavigate}
        sx={{ pl: nested ? 4 : 2 }}
      >
        <ListItemText
          primary={nested ? `└ ${subject.label}` : subject.label}
          slotProps={{ primary: { sx: { fontSize: "0.875rem" } } }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {subject.count}
        </Typography>
      </ListItemButton>
    );
  };

  return (
    <Box sx={{ overflowY: "auto" }}>
      <List
        dense
        subheader={<ListSubheader sx={{ bgcolor: "transparent" }}>과목</ListSubheader>}
      >
        {technical.map(renderItem)}
      </List>

      <Divider />

      <List
        dense
        subheader={<ListSubheader sx={{ bgcolor: "transparent" }}>그 밖의 자료</ListSubheader>}
      >
        {others.map(renderItem)}
      </List>
    </Box>
  );
}

export function AppShell({
  subjects,
  referenceTotal,
  children,
}: {
  subjects: SubjectInfo[];
  referenceTotal: number;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up("md"));
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const drawerContent = (
    <>
      <Toolbar />

      {/*
        공부를 시작하는 자리를 맨 위에 둡니다.
        과목 목록은 "찾아보기"이고, 이쪽은 "바로 공부하기"입니다.
      */}
      <List dense sx={{ pt: 1 }}>
        <ListItemButton
          component={NextLink}
          href="/learn"
          selected={pathname === "/learn"}
          onClick={() => setOpen(false)}
        >
          <ListItemText
            primary="🎓 통합 학습자료"
            secondary="설명 + 실습 코드 + 공식 문서"
            slotProps={{
              primary: { sx: { fontSize: "0.9rem", fontWeight: 600 } },
              secondary: { sx: { fontSize: "0.7rem" } },
            }}
          />
        </ListItemButton>

        <ListItemButton
          component={NextLink}
          href="/compare"
          selected={pathname === "/compare"}
          onClick={() => setOpen(false)}
        >
          <ListItemText
            primary="⚖️ 수업 방식 점검"
            secondary="지금도 그대로 써도 되나"
            slotProps={{
              primary: { sx: { fontSize: "0.9rem", fontWeight: 600 } },
              secondary: { sx: { fontSize: "0.7rem" } },
            }}
          />
        </ListItemButton>

        <ListItemButton
          component={NextLink}
          href="/study"
          selected={pathname === "/study"}
          onClick={() => setOpen(false)}
        >
          <ListItemText
            primary="📚 다시 공부하기"
            secondary="어디부터 다시 보면 되나"
            slotProps={{
              primary: { sx: { fontSize: "0.9rem", fontWeight: 600 } },
              secondary: { sx: { fontSize: "0.7rem" } },
            }}
          />
        </ListItemButton>
      </List>

      <Divider />
      <SubjectList subjects={subjects} onNavigate={() => setOpen(false)} />
      <Divider />
      <Box sx={{ p: 2 }}>
        <Chip
          component={NextLink}
          href="/"
          clickable
          size="small"
          label={`공식 문서 요약 ${referenceTotal}건`}
          sx={{ width: "100%" }}
        />
      </Box>
    </>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        elevation={0}
        color="default"
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          {!isWide && (
            <IconButton edge="start" onClick={() => setOpen(!open)} aria-label="과목 목록 열기">
              ☰
            </IconButton>
          )}

          <Typography
            component={NextLink}
            href="/"
            variant="h6"
            sx={{
              fontSize: "1rem",
              fontWeight: 700,
              textDecoration: "none",
              color: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            📚 수업자료 아카이브
          </Typography>

          <Box sx={{ flex: 1 }} />
          <SearchBox />
        </Toolbar>
      </AppBar>

      {/* 넓은 화면에서는 항상 보이고, 좁으면 버튼으로 엽니다. */}
      <Drawer
        variant={isWide ? "permanent" : "temporary"}
        open={isWide || open}
        onClose={() => setOpen(false)}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            borderRight: "1px solid",
            borderColor: "divider",
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
