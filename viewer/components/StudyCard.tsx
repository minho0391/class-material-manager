/**
 * 학습 설명 한 장.
 *
 * ■ 이 카드가 답하려는 것
 *
 *   "이거 그냥 다시 공부해도 돼?"
 *   "예전 코드랑 지금 방식이 어떻게 달라?"
 *
 * ■ 없는 칸은 그리지 않습니다
 *
 * 근거가 없으면 15단계가 그 칸을 아예 비워 둡니다.
 * 화면도 그것을 그대로 따릅니다 — 빈 칸에 "없음" 이라고 적으면
 * 마치 확인해 본 결과 없는 것처럼 보이기 때문입니다.
 */
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { NavChip } from "@/components/nav";
import {
  CHANGE_TYPE_LABEL,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  subjectLabel,
  type StudyGuide,
} from "@/lib/data";

const CODE_FONT = { fontFamily: "'D2Coding', monospace" as const };

/** 코드 한 토막 — 원본을 그대로 보여 줍니다. 고치거나 지어내지 않습니다. */
function CodeBlock({ label, code, tone }: { label: string; code: string; tone: "old" | "new" }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.5 }}>
        {label}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.2,
          borderRadius: 1,
          bgcolor: "action.hover",
          borderLeft: "3px solid",
          borderColor: tone === "old" ? "text.disabled" : "success.main",
          overflowX: "auto",
          ...CODE_FONT,
          fontSize: "0.78rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {code}
      </Box>
    </Box>
  );
}

/** 한 줄짜리 절 — 제목과 내용 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 1.2 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, display: "block", color: "text.secondary" }}>
        {title}
      </Typography>
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
}

export function StudyCard({ guide, showSubject = true }: { guide: StudyGuide; showSubject?: boolean }) {
  // 수업 당시 코드와 지금 방식 — 둘 중 **하나라도** 근거가 있을 때만 그립니다.
  const hasOld = Boolean(guide.oldCode ?? guide.oldPattern);
  const hasNew = Boolean(guide.currentPattern);

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
      {/* ── 머리 ── */}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1.2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, ...CODE_FONT }}>
          {guide.topic}
        </Typography>
        <Chip
          size="small"
          color={PRIORITY_COLOR[guide.learningPriority] ?? "default"}
          label={PRIORITY_LABEL[guide.learningPriority] ?? guide.learningPriority}
        />
        {showSubject && (
          <NavChip
            size="small"
            variant="outlined"
            href={`/s/${encodeURIComponent(guide.subject)}`}
            label={subjectLabel(guide.subject)}
          />
        )}
        {guide.changeType !== "NONE" && (
          <Chip
            size="small"
            variant="outlined"
            label={CHANGE_TYPE_LABEL[guide.changeType] ?? guide.changeType}
          />
        )}
        <Chip size="small" variant="outlined" label={guide.kind === "package" ? "패키지 버전" : "문법·API"} />
      </Box>

      {/* ── 한 문단짜리 답 ── */}
      <Typography variant="body2" sx={{ mb: 2 }}>
        {guide.explanation}
      </Typography>

      {/* ── 1~3 ── */}
      {guide.lessonSummary && <Section title="수업에서 배운 내용">{guide.lessonSummary}</Section>}
      <Section title="현재 상태">{guide.statusSummary}</Section>
      <Section title="무엇이 달라졌는가">{guide.changeSummary}</Section>

      {/* ── 4~5. 예전 방식 ↔ 지금 방식 ── */}
      {(hasOld || hasNew) && (
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", my: 2 }}>
          {hasOld && (
            <CodeBlock label="수업 당시" code={guide.oldCode ?? guide.oldPattern ?? ""} tone="old" />
          )}
          {hasNew && <CodeBlock label="현재 방식" code={guide.currentPattern ?? ""} tone="new" />}
        </Box>
      )}

      {/* 공식 문서가 적어 둔 대안 — 우리가 지어낸 말이 아닙니다 */}
      {guide.recommendedAlternative && (
        <Box sx={{ mb: 1.5, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
            공식 문서가 적어 둔 대안
          </Typography>
          <Typography variant="caption" sx={{ display: "block", wordBreak: "break-word" }}>
            {guide.recommendedAlternative}
          </Typography>
        </Box>
      )}

      {/* ── 6. 공부 포인트 ── */}
      <Box sx={{ my: 1.5, p: 1.5, borderLeft: "3px solid", borderColor: "primary.main" }}>
        <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
          지금 다시 공부할 때
        </Typography>
        <Typography variant="body2">{guide.studyPoint}</Typography>
      </Box>

      {/* ── 어디서 나왔는가 ── */}
      {guide.materials.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap", mb: 1 }}>
          {guide.materials.slice(0, 3).map((material) => (
            <NavChip
              key={material.materialId}
              size="small"
              variant="outlined"
              href={`/m/${encodeURIComponent(material.materialId)}`}
              label={`📄 ${material.title.slice(0, 26)}`}
            />
          ))}
        </Box>
      )}
      {guide.practice.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          📦 {guide.practice.slice(0, 2).map((site) => site.zipTitle).join(", ")}
          {guide.practice.length > 2 && ` 외 ${guide.practice.length - 2}건`}
        </Typography>
      )}

      {/* ── 7. 직접 확인할 근거 ── */}
      <Box sx={{ mt: 1.5, pl: 1.5, borderLeft: "3px solid", borderColor: "divider" }}>
        <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.5 }}>
          직접 확인할 근거
        </Typography>
        {guide.evidence.map((entry, index) => (
          <Box key={index} sx={{ mb: 0.8 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {entry.source}
            </Typography>
            <Typography variant="caption" sx={{ display: "block", ...CODE_FONT, wordBreak: "break-word" }}>
              {entry.text}
            </Typography>
            {entry.where && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {entry.where.startsWith("http") ? (
                  <Link href={entry.where} target="_blank" rel="noopener noreferrer">
                    {entry.where}
                  </Link>
                ) : (
                  entry.where
                )}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
