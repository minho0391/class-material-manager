"use server";

/**
 * 로그인 · 로그아웃.
 *
 * 회원가입은 만들지 않습니다 — 계정은 Supabase 쪽에서 미리 만들어 둔 것만 씁니다.
 */
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

export async function login(_prevState: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력하세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  redirect("/");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
