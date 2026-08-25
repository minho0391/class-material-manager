/**
 * 수업자료 상세 — 통합 학습자료 화면.
 *
 * ■ 읽는 순서
 *
 *   1. 강사 수업 설명   ← 학습의 중심
 *   2. 관련 실습 코드   ← 8·9단계가 찾아낸 실제 실습파일 코드
 *   3. 공식 문서 보충   ← 6단계 요약
 *
 * 실습 코드와 공식 문서는 **있을 때만** 나옵니다.
 * 없다고 빈 칸이나 오류를 보여주지 않습니다. 대부분의 자료에는 둘 다 없습니다.
 */
import { notFound } from "next/navigation";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { Markdown } from "@/components/Markdown";
import { NavChip, NavListItem } from "@/components/nav";
import { StudyCard } from "@/components/StudyCard";
import { PracticeCode } from "@/components/PracticeCode";
import { TableOfContents } from "@/components/TableOfContents";
import { extractTopHeadings } from "@/lib/toc";
import {
  COMPARISON_LABEL,
  SEVERITY_LABEL,
  getComparisonsFor,
  getLearning,
  getMaterial,
  getRelatedReferences,
  subjectLabel,
  getStudyFor,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  PRIORITY_MEANING,
} from "@/lib/data";

/** 바이트를 읽기 좋은 크기로 */
function humanSize(bytes?: number): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function MaterialPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId: raw } = await params;
  const found = await getMaterial(decodeURIComponent(raw));

  if (!found) notFound();

  const { material, body } = found;
  const related = await getRelatedReferences(material);
  // 아직 build-learning 을 돌리지 않았거나 실습 코드가 없으면 null 입니다.
  const learning = await getLearning(material.docId);
  // 이 자료에서 다룬 기술이 지금도 유효한지 (13단계). 없으면 영역이 나오지 않습니다.
  const checks = await getComparisonsFor(material.docId);
  const study = await getStudyFor(material.docId);
  // 급한 것부터 보여 줍니다. 8건만 보여 주므로, 무게 순서가 곧 무엇이 잘리느냐를 정합니다.
  const SEVERITY_ORDER = ["HIGH", "MEDIUM", "LOW", "NONE"];
  const notable = checks
    .filter((item) => item.status !== "CURRENT")
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity ?? "NONE") - SEVERITY_ORDER.indexOf(b.severity ?? "NONE"),
    );

  const sections = [...new Set(material.occurrences.map((o) => o.section).filter(Boolean))];
  const size = humanSize(material.sizeBytes);

  const headings = extractTopHeadings(body);
  const practiceCount = learning?.practice.length ?? 0;
  const reviewCount = notable.length;
  const docsCount = related.length;
  const hasSidePanel = headings.length > 0 || practiceCount > 0 || reviewCount > 0 || docsCount > 0;

  return (
    // 전체 폭을 제한해 아주 넓은 화면에서 본문과 오른쪽 패널 사이가
    // 한없이 벌어지지 않게 합니다 (Codex 검토 반영 — 본문 폭·빈 공간 개선).
    <Box sx={{ display: "flex", gap: 4, alignItems: "flex-start", maxWidth: 1180 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
      {/* ── 머리말 ── */}
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
        {material.title}
      </Typography>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
        {material.subject && (
          <NavChip
            size="small"
            color="primary"
            href={`/s/${encodeURIComponent(material.subject)}`}
            label={subjectLabel(material.subject)}
          />
        )}
        {sections.map((section) => (
          <Chip key={section} size="small" variant="outlined" label={section} />
        ))}
        {material.pageCount && <Chip size="small" variant="outlined" label={`${material.pageCount}쪽`} />}
        {size && <Chip size="small" variant="outlined" label={size} />}
      </Box>

      <Typography variant="caption" color="text.secondary">
        마지막 수정 {material.modifiedTime.slice(0, 10)} · 수집 {material.updatedAt.slice(0, 10)}
      </Typography>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2, mb: 3 }}>
        <Button
          size="small"
          variant="outlined"
          href={material.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          🔗 원본 열기
        </Button>
        {material.downloadPath && (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
            원본 파일: <code>{material.downloadPath}</code>
          </Typography>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* ── 1. 강사 수업 설명 (학습의 중심) ── */}
      <Markdown>{body}</Markdown>

      {/* ── 2. 관련 실습 코드 — 있을 때만 ── */}
      {learning && learning.practice.length > 0 && (
        <Box id="practice-code">
          <PracticeCode practice={learning.practice} />
        </Box>
      )}

      {/* ── 2-2. 수업 방식 점검 — 눈여겨볼 것이 있을 때만 ── */}
      {notable.length > 0 && (
        <Box id="review" sx={{ mt: 5, maxWidth: "82ch" }}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
            ⚖️ 지금도 그대로 써도 되나
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            이 자료에서 다룬 기술을 현재 공식 문서와 견준 결과입니다. 판단이 아니라 확인할 거리입니다.
          </Typography>
          <Paper variant="outlined">
            <List dense disablePadding>
              {notable.slice(0, 8).map((item) => (
                <NavListItem key={item.id} href={`/compare?status=${item.status}`}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <Box component="span" sx={{ fontFamily: "'D2Coding', monospace" }}>
                          {item.topic}
                        </Box>
                        <Chip
                          size="small"
                          color={item.status === "DEPRECATED" ? "error" : "warning"}
                          label={COMPARISON_LABEL[item.status] ?? item.status}
                        />
                        {item.severity === "HIGH" && (
                          <Chip size="small" color="error" variant="outlined" label={SEVERITY_LABEL.HIGH} />
                        )}
                      </Box>
                    }
                    secondary={item.reason}
                    slotProps={{
                      primary: { sx: { fontSize: "0.875rem" } },
                      secondary: { sx: { fontSize: "0.72rem" } },
                    }}
                  />
                </NavListItem>
              ))}
            </List>
          </Paper>
        </Box>
      )}

      {/* ── 2-3. 다시 공부하기 — 손볼 것이 있을 때만 ── (15단계) */}
      {study.material && study.material.priority !== "KEEP" && (
        <Box id="study-priority" sx={{ mt: 5, maxWidth: "82ch" }}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
            📚 이 자료 그냥 다시 공부해도 되나
          </Typography>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
            <Chip
              size="small"
              color={PRIORITY_COLOR[study.material.priority] ?? "default"}
              label={PRIORITY_LABEL[study.material.priority]}
            />
            <Typography variant="caption" color="text.secondary">
              {PRIORITY_MEANING[study.material.priority]}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
            이 자료에서 다룬 주제 {study.guides.length}건 중 손볼 것 {
              study.guides.filter((guide) => guide.learningPriority !== "KEEP").length
            }건입니다. 나머지는 그대로 다시 봐도 됩니다.
          </Typography>

          {study.guides
            .filter((guide) => guide.learningPriority !== "KEEP")
            .slice(0, 6)
            .map((guide) => (
              <StudyCard key={guide.comparisonId} guide={guide} showSubject={false} />
            ))}

          <NavChip href={`/study?subject=${encodeURIComponent(material.subject ?? "")}`} label="이 과목 복습 전체 보기 →" size="small" />
        </Box>
      )}

      {/* ── 3. 공식 문서 보충 — 있을 때만 ── */}
      {related.length > 0 && (
        <Box id="official-docs" sx={{ mt: 5, maxWidth: "82ch" }}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
            📘 이 주제의 공식 문서
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            수업자료를 대신하는 것이 아니라 모자란 설명을 채우는 자리입니다.
          </Typography>
          <Paper variant="outlined">
            <List dense disablePadding>
              {related.map((reference) => (
                <NavListItem
                  key={reference.slug}
                  href={`/r/${encodeURIComponent(reference.subject)}/${encodeURIComponent(reference.slug)}`}
                >
                  <ListItemText
                    primary={reference.title}
                    secondary={reference.sourceName}
                    slotProps={{
                      primary: { sx: { fontSize: "0.875rem" } },
                      secondary: { sx: { fontSize: "0.72rem" } },
                    }}
                  />
                  {reference.language === "ko" && <Chip size="small" label="한국어" />}
                </NavListItem>
              ))}
            </List>
          </Paper>
        </Box>
      )}

      <Divider sx={{ my: 4, maxWidth: "82ch" }} />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", maxWidth: "82ch" }}>
        이 화면은 읽기 전용입니다. 내용을 고치려면{" "}
        <Link href={material.sourceUrl} target="_blank" rel="noopener noreferrer">
          원본 문서
        </Link>
        에서 수정한 뒤 <code>node src/index.ts collect</code> 로 다시 받아오세요.
      </Typography>
      </Box>

      {/*
        ── 오른쪽 정보 패널 ──
        넓은 화면에서 남는 공간을 목차·관련 정보로 채웁니다 (design-mockups-v2 02·05번).
        좁은 화면(lg 미만)에서는 숨깁니다 — 본문을 읽는 데 방해가 되지 않도록.
      */}
      {hasSidePanel && (
        <Box
          sx={{
            display: { xs: "none", lg: "block" },
            width: 260,
            flexShrink: 0,
            position: "sticky",
            top: 88,
          }}
        >
          {headings.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <TableOfContents headings={headings} />
            </Paper>
          )}

          {(practiceCount > 0 || reviewCount > 0 || docsCount > 0) && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 1 }}>
                관련 정보
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
                {practiceCount > 0 && (
                  <Link href="#practice-code" underline="hover" variant="body2" sx={{ color: "text.primary" }}>
                    💻 실습 코드 {practiceCount}건
                  </Link>
                )}
                {reviewCount > 0 && (
                  <Link href="#review" underline="hover" variant="body2" sx={{ color: "text.primary" }}>
                    ⚖️ 점검할 것 {reviewCount}건
                  </Link>
                )}
                {docsCount > 0 && (
                  <Link href="#official-docs" underline="hover" variant="body2" sx={{ color: "text.primary" }}>
                    📘 공식 문서 {docsCount}건
                  </Link>
                )}
              </Box>
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
}
