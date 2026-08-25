"use client";

/**
 * 자료 상세 화면 오른쪽의 "이 페이지" 목차.
 *
 * design-mockups-v2 의 자료 상세 화면(02·05번)에는 넓은 화면에서 남는 오른쪽 공간에
 * 목차와 "관련 정보"를 두고 있습니다. 지금 읽는 절을 스크롤에 맞춰 굵게 표시해
 * 본문과 목차가 서로 연결되어 있다는 것을 보여줍니다 (V2 디자인 검토 반영 항목).
 */
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import type { TocHeading } from "@/lib/toc";

export function TableOfContents({ headings }: { headings: TocHeading[] }) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? "");

  useEffect(() => {
    if (headings.length === 0) return;

    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    // 화면 위쪽 30% 안에 들어온 절 중 가장 먼저 있는 것을 "지금 읽는 곳"으로 봅니다.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 1 }}>
        📑 이 페이지
      </Typography>
      <Box component="nav" aria-label="이 페이지 목차">
        {headings.map((heading) => {
          const active = activeId === heading.id;
          return (
            <Box
              key={heading.id}
              component="a"
              href={`#${heading.id}`}
              sx={{
                display: "block",
                py: 0.6,
                pl: 1.3,
                fontSize: "0.8rem",
                lineHeight: 1.4,
                textDecoration: "none",
                color: active ? "primary.main" : "text.secondary",
                fontWeight: active ? 700 : 400,
                borderLeft: "2px solid",
                borderColor: active ? "primary.main" : "divider",
                "&:hover": { color: "primary.main" },
              }}
            >
              {heading.text}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
