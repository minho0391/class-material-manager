import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 뷰어 설정.
 *
 * ■ turbopack.root 를 지정하는 이유
 *
 * 이 프로젝트에는 package-lock.json 이 두 개 있습니다.
 *   · 위쪽(class-material-manager) — CLI 도구용
 *   · 여기(viewer)               — 뷰어용
 *
 * 그대로 두면 Next.js 가 어느 쪽이 프로젝트 뿌리인지 헷갈려서
 * 위쪽 폴더를 뿌리로 골라 버립니다. 여기가 뿌리임을 분명히 알려 줍니다.
 */
const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: { root: here },

  // 서버에서만 쓰는 패키지가 브라우저로 딸려가지 않게 합니다.
  serverExternalPackages: ["gray-matter"],
};

export default nextConfig;
