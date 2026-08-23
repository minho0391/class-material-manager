"use client";

/**
 * 페이지 이동용 부품 모음.
 *
 * ■ 왜 따로 만드는가
 *
 * MUI 부품은 전부 브라우저에서 도는 "클라이언트 컴포넌트"입니다.
 * 그런데 페이지(page.tsx)는 서버에서 도는 "서버 컴포넌트"입니다.
 *
 * 서버 컴포넌트에서 클라이언트 컴포넌트로 **함수를 넘길 수 없습니다.**
 * 그래서 아래처럼 쓰면 오류가 납니다.
 *
 *   // ❌ page.tsx (서버) 안에서
 *   <ListItemButton component={NextLink} href="/...">   ← NextLink 가 함수라서 실패
 *
 * 이 파일은 맨 위에 "use client" 가 붙어 있어 통째로 브라우저 쪽입니다.
 * 여기서 NextLink 를 연결해 두면, 페이지에서는 그냥 부품을 가져다 쓰면 됩니다.
 *
 *   // ✅ page.tsx 안에서
 *   <NavListItem href="/...">
 */
import NextLink from "next/link";
import type { ComponentProps } from "react";

import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import ListItemButton from "@mui/material/ListItemButton";

/** 목록 한 줄을 누르면 다른 화면으로 갑니다. */
export function NavListItem(props: Omit<ComponentProps<typeof ListItemButton<typeof NextLink>>, "component">) {
  return <ListItemButton component={NextLink} {...props} />;
}

/** 누를 수 있는 작은 딱지(과목 표시 등). */
export function NavChip(props: Omit<ComponentProps<typeof Chip<typeof NextLink>>, "component">) {
  return <Chip component={NextLink} clickable {...props} />;
}

/** 카드 전체를 누를 수 있게 합니다. */
export function NavCardArea(props: Omit<ComponentProps<typeof CardActionArea<typeof NextLink>>, "component">) {
  return <CardActionArea component={NextLink} {...props} />;
}
