/**
 * 과목별 자료 목록.
 *
 * 왼쪽에 수업자료, 오른쪽에 그 과목의 공식 문서 요약을 나란히 둡니다.
 * 배운 것과 공식 설명을 같은 화면에서 오갈 수 있게 하려는 배치입니다.
 */
import { notFound } from "next/navigation";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { NavChip, NavListItem } from "@/components/nav";
import {
  getMaterialsBySubject,
  getReferencesBySubject,
  getStudyForSubject,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  subjectLabel,
} from "@/lib/data";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  // Next.js 15 부터 params 는 Promise 로 옵니다.
  const { subject: raw } = await params;
  const subject = decodeURIComponent(raw);

  const [materials, references, study] = await Promise.all([
    getMaterialsBySubject(subject),
    getReferencesBySubject(subject),
    getStudyForSubject(subject),
  ]);

  if (materials.length === 0 && references.length === 0) notFound();

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
        {subjectLabel(subject)}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        수업자료 {materials.length}건 · 공식 문서 요약 {references.length}건
      </Typography>

      {/*
        ── 이 과목의 최신 상태 ── (15단계)
        "이 과목 자료 그냥 다시 봐도 되나" 에 한 줄로 답합니다.
        손볼 것이 없으면 아무 말도 하지 않습니다 — 없는 경고를 만들지 않기 위해서입니다.
      */}
      {study.materials.length > 0 && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3, alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary">
            복습 상태
          </Typography>
          {PRIORITY_ORDER.filter((level) => study.counts[level]).map((level) => (
            <Chip
              key={level}
              size="small"
              color={level === "KEEP" ? "default" : PRIORITY_COLOR[level] ?? "default"}
              variant={level === "KEEP" ? "outlined" : "filled"}
              label={`${PRIORITY_LABEL[level]} ${study.counts[level]}`}
            />
          ))}
          <NavChip
            size="small"
            variant="outlined"
            href={`/study?subject=${encodeURIComponent(subject)}`}
            label="다시 공부할 내용 →"
          />
        </Box>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 340px" },
          gap: 3,
          alignItems: "start",
        }}
      >
        {/* ── 수업자료 ── */}
        <Paper variant="outlined">
          <Typography variant="subtitle2" sx={{ px: 2, pt: 2, pb: 1, fontWeight: 700 }}>
            수업자료
          </Typography>

          <List dense disablePadding>
            {materials.map((material) => {
              const sections = [
                ...new Set(material.occurrences.map((o) => o.section).filter(Boolean)),
              ];

              return (
                <NavListItem
                  key={material.docId}
                  href={`/m/${encodeURIComponent(material.docId)}`}
                  sx={{ py: 1 }}
                >
                  <ListItemText
                    primary={material.title}
                    secondary={sections.join(" · ")}
                    slotProps={{
                      primary: { sx: { fontSize: "0.9rem" } },
                      secondary: { sx: { fontSize: "0.75rem" } },
                    }}
                  />
                  {material.downloadPath && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={material.pageCount ? `${material.pageCount}쪽` : "파일"}
                    />
                  )}
                </NavListItem>
              );
            })}

            {materials.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                이 과목의 수업자료는 없습니다.
              </Typography>
            )}
          </List>
        </Paper>

        {/* ── 공식 문서 요약 ── */}
        <Paper variant="outlined">
          <Typography variant="subtitle2" sx={{ px: 2, pt: 2, pb: 1, fontWeight: 700 }}>
            📘 공식 문서 요약
          </Typography>

          <List dense disablePadding>
            {references.map((reference) => (
              <NavListItem
                key={reference.slug}
                href={`/r/${encodeURIComponent(reference.subject)}/${encodeURIComponent(reference.slug)}`}
                sx={{ py: 1 }}
              >
                <ListItemText
                  primary={reference.title}
                  secondary={`수업자료에서 ${reference.mentions}번 언급`}
                  slotProps={{
                      primary: { sx: { fontSize: "0.875rem" } },
                      secondary: { sx: { fontSize: "0.72rem" } },
                    }}
                />
                {reference.language === "ko" && <Chip size="small" label="한국어" />}
              </NavListItem>
            ))}

            {references.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                아직 공식 문서 요약이 없습니다.
              </Typography>
            )}
          </List>
        </Paper>
      </Box>
    </Box>
  );
}
