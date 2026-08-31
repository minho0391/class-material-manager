/**
 * 실전 예제 상세 — 원본 저장소·파일 경로·개념·코드·적합 이유·연결된 수업자료.
 *
 * 코드는 원본 저장소의 고정 커밋에서 라인 범위만 잘라 온 원문입니다. 이 화면은 읽기
 * 전용이며, PracticeCode 와 같은 집(등폭 글꼴 + 옅은 배경, 문법 색칠 없음) 스타일을 씁니다.
 */
import { notFound } from "next/navigation";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { NavChip, NavListItem } from "@/components/nav";
import { getMaterial, subjectLabel } from "@/lib/data";
import { getProjectExample } from "@/lib/projectExamples";
import { safeHref } from "@/lib/url";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const example = await getProjectExample(decodeURIComponent(id));
  return { title: example ? `${example.title} · 실전 예제` : "실전 예제" };
}

export default async function ExampleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const example = await getProjectExample(decodeURIComponent(raw));
  if (!example) notFound();

  const repoHref = safeHref(example.repoUrl);
  const fileHref = safeHref(example.fileUrl);

  // 연결된 수업자료 제목을 함께 보여줍니다 (없으면 링크만).
  interface RelatedMaterial {
    docId: string;
    title: string;
    subject: string | undefined;
  }
  const relatedResults = await Promise.all(
    example.relatedMaterialIds.map(async (docId): Promise<RelatedMaterial | null> => {
      try {
        const found = await getMaterial(docId);
        if (!found) return null;
        return { docId, title: found.material.title, subject: found.material.subject };
      } catch {
        return null;
      }
    }),
  );
  const related = relatedResults.filter((v): v is RelatedMaterial => v !== null);

  const lineLabel =
    example.lineStart != null && example.lineEnd != null
      ? `${example.lineStart}–${example.lineEnd}행`
      : null;

  return (
    <Box sx={{ maxWidth: 1000 }}>
      <Typography variant="caption" color="text.secondary">
        <NavChip size="small" href="/examples" label="← 실전 예제" clickable />
      </Typography>

      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 2 }} gutterBottom>
        {example.title}
      </Typography>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Chip size="small" variant="outlined" label={example.project} />
        {example.subject && (
          <NavChip
            size="small"
            color="primary"
            href={`/s/${encodeURIComponent(example.subject)}`}
            label={subjectLabel(example.subject)}
          />
        )}
        {example.language && <Chip size="small" variant="outlined" label={example.language} />}
      </Box>

      <Typography
        variant="body2"
        sx={{ fontFamily: "'D2Coding', 'Consolas', monospace", color: "text.secondary", mb: 2 }}
      >
        {example.filePath}
        {lineLabel ? `  ·  ${lineLabel}` : ""}
      </Typography>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3 }}>
        {fileHref && (
          <Button size="small" variant="outlined" href={fileHref} target="_blank" rel="noopener noreferrer">
            🔗 원본 파일 (고정 커밋)
          </Button>
        )}
        {repoHref && (
          <Button size="small" variant="text" href={repoHref} target="_blank" rel="noopener noreferrer">
            저장소
          </Button>
        )}
      </Box>

      {/* ── 개념 태그 ── */}
      {example.concepts.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.7, flexWrap: "wrap", mb: 3 }}>
          {example.concepts.map((concept) => (
            <Chip key={concept} size="small" label={concept} />
          ))}
        </Box>
      )}

      <Divider sx={{ mb: 3 }} />

      {/* ── 왜 학습 예제로 적합한가 ── */}
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
        이 코드가 학습 예제로 적합한 이유
      </Typography>
      <Typography variant="body1" sx={{ mb: 4, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
        {example.summary}
      </Typography>

      {/* ── 코드 (원문 그대로) ── */}
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
        💻 코드
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        원본 저장소의 고정 커밋에서 {lineLabel ? `${lineLabel}을 ` : ""}그대로 가져왔습니다. 수정하지 않았습니다.
      </Typography>
      <Paper variant="outlined" sx={{ overflow: "hidden", mb: 4 }}>
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: "action.hover",
            display: "flex",
            gap: 1,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontFamily: "'D2Coding', 'Consolas', monospace", fontWeight: 600 }}
          >
            {example.filePath}
          </Typography>
          {example.language && <Chip size="small" variant="outlined" label={example.language} />}
        </Box>
        <Box
          component="pre"
          sx={{
            m: 0,
            px: 2,
            py: 1.5,
            maxHeight: 620,
            overflow: "auto",
            fontSize: "0.86rem",
            lineHeight: 1.75,
            fontFamily: "'D2Coding', 'Consolas', monospace",
          }}
        >
          <code>{example.code}</code>
        </Box>
      </Paper>

      {/* ── 연결된 수업자료 ── */}
      {(related.length > 0 || example.relatedMaterialIds.length > 0) && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
            📚 연결된 수업자료
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            같은 개념을 다루는 수업자료입니다. 개념 학습은 이쪽을 중심으로 하세요.
          </Typography>
          <Paper variant="outlined">
            <List dense disablePadding>
              {related.map((material) => (
                <NavListItem key={material.docId} href={`/m/${encodeURIComponent(material.docId)}`}>
                  <ListItemText
                    primary={material.title}
                    secondary={material.subject ? subjectLabel(material.subject) : undefined}
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

      {/* ── 팀 역할 메모 ── */}
      {example.authorshipNote && (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            {example.authorshipNote}
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
