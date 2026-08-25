/**
 * 로그인 화면.
 *
 * 이메일 · 비밀번호 · 로그인 버튼만 둡니다. 회원가입은 만들지 않습니다 —
 * 계정은 Supabase 쪽에서 미리 만들어 둔 것만 씁니다.
 */
import type { Metadata } from "next";
import Box from "@mui/material/Box";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "로그인 — 수업자료 아카이브",
};

export default function LoginPage() {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", p: 2 }}>
      <LoginForm />
    </Box>
  );
}
