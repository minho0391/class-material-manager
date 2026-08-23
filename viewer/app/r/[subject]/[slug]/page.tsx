/**
 * 공식 문서 요약 상세.
 *
 * 요약본 자체가 이미 Markdown 이라 그대로 그려 주면 됩니다.
 * 위에는 출처와 조회일을 붙여, 언제 기준의 내용인지 알 수 있게 합니다.
 */
import { notFound } from "next/navigation";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";

import { Markdown } from "@/components/Markdown";
import { NavChip } from "@/components/nav";
import { getReference, subjectLabel } from "@/lib/data";

export default async function ReferencePage({
  params,
}: {
  params: Promise<{ subject: string; slug: string }>;
}) {
  const { subject: rawSubject, slug: rawSlug } = await params;
  const reference = await getReference(decodeURIComponent(rawSubject), decodeURIComponent(rawSlug));

  if (!reference) notFound();

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        공식 문서 요약
      </Typography>

      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
        {reference.title}
      </Typography>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <NavChip
          size="small"
          color="primary"
          href={`/s/${encodeURIComponent(reference.subject)}`}
          label={subjectLabel(reference.subject)}
        />
        <Chip size="small" variant="outlined" label={reference.sourceName} />
        {reference.language === "ko" && <Chip size="small" label="한국어" />}
        <Chip size="small" variant="outlined" label={`수업자료에서 ${reference.mentions}번 언급`} />
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 3 }}>
        <Button
          size="small"
          variant="outlined"
          href={reference.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          🔗 공식 문서 원문
        </Button>
        <Typography variant="caption" color="text.secondary">
          {reference.fetchedAt} 기준 · 원문의 핵심만 옮겨 적었습니다
        </Typography>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Markdown>{reference.body}</Markdown>
    </Box>
  );
}
