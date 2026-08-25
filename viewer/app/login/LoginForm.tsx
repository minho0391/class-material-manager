"use client";

/**
 * 로그인 화면 — 이메일 · 비밀번호 · 로그인 버튼만 있습니다. (회원가입 없음)
 */
import { useActionState } from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { login, type LoginState } from "@/lib/supabase/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <Paper variant="outlined" sx={{ p: 4, width: 360, maxWidth: "90vw" }}>
      <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 3, textAlign: "center" }}>
        📚 수업자료 아카이브
      </Typography>

      <Box component="form" action={formAction} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          name="email"
          type="email"
          label="이메일"
          required
          autoFocus
          autoComplete="email"
          fullWidth
          size="small"
        />

        <TextField
          name="password"
          type="password"
          label="비밀번호"
          required
          autoComplete="current-password"
          fullWidth
          size="small"
        />

        {state?.error && (
          <Typography variant="body2" color="error" role="alert">
            {state.error}
          </Typography>
        )}

        <Button type="submit" variant="contained" disabled={pending} fullWidth>
          {pending ? "로그인 중…" : "로그인"}
        </Button>
      </Box>
    </Paper>
  );
}
