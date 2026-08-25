/**
 * 복습 화면 — "어디부터 다시 공부해야 해?"
 *
 * ■ /compare 와 무엇이 다른가
 *
 * `/compare` 는 **판정 결과**를 봅니다 — 무엇이 사용 중단이고 무엇이 버전 차이인가.
 * 여기는 **공부 순서**를 봅니다 — 무엇부터 다시 보면 되는가.
 *
 * 같은 자료를 다른 각도로 보는 것이라, 둘 다 있는 편이 낫습니다.
 *
 * ■ 경고를 남발하지 않습니다
 *
 * 354건 중 307건이 "그대로 복습" 입니다. 그것이 사실입니다.
 * 그래서 기본 화면은 **먼저 볼 것부터** 보여 주고,
 * "그대로 복습" 은 조용히 개수만 알립니다. 온통 빨간 화면을 만들지 않기 위해서입니다.
 */
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { StudyCard } from "@/components/StudyCard";
import { NavChip, NavListItem } from "@/components/nav";
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  PRIORITY_MEANING,
  PRIORITY_ORDER,
  getStudyGuides,
  subjectLabel,
  type LearningPriority,
} from "@/lib/data";

export const metadata = { title: "다시 공부하기 · 수업자료 아카이브" };

/** 한 화면에 너무 많이 쏟지 않습니다. 필터로 좁혀 보게 합니다. */
const LIMIT = 40;

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ priority?: string; subject?: string }>;
}) {
  const { priority, subject } = await searchParams;
  const { guides, materials, generatedAt } = await getStudyGuides();

  if (guides.length === 0) {
    return (
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
          다시 공부하기
        </Typography>
        <Typography color="text.secondary">
          아직 학습 설명이 없습니다. 터미널에서{" "}
          <Box component="code" sx={{ px: 0.7, py: 0.2, bgcolor: "action.hover", borderRadius: 0.5 }}>
            node src/index.ts study
          </Box>{" "}
          를 실행하면 이 자리에 나타납니다.
        </Typography>
      </Box>
    );
  }

  const counts = new Map<string, number>();
  for (const guide of guides) {
    counts.set(guide.learningPriority, (counts.get(guide.learningPriority) ?? 0) + 1);
  }

  const subjects = [...new Set(guides.map((guide) => guide.subject))].sort();

  const selected = priority && PRIORITY_LABEL[priority] ? priority : "";
  const selectedSubject = subject && subjects.includes(subject) ? subject : "";

  const shown = guides.filter(
    (guide) =>
      (!selected || guide.learningPriority === selected) &&
      (!selectedSubject || guide.subject === selectedSubject),
  );

  const sorted = [...shown].sort(
    (a, b) =>
      PRIORITY_ORDER.indexOf(a.learningPriority) - PRIORITY_ORDER.indexOf(b.learningPriority) ||
      a.subject.localeCompare(b.subject) ||
      a.topic.localeCompare(b.topic, "ko"),
  );

  // ── 먼저 볼 자료 — 그대로 복습해도 되는 자료는 여기 넣지 않습니다 ──
  const notableMaterials = materials
    .filter((material) => material.priority !== "KEEP")
    .filter((material) => !selectedSubject || material.subject === selectedSubject);

  const link = (nextPriority: string, nextSubject: string): string => {
    const parts: string[] = [];
    if (nextPriority) parts.push(`priority=${nextPriority}`);
    if (nextSubject) parts.push(`subject=${encodeURIComponent(nextSubject)}`);
    return parts.length > 0 ? `/study?${parts.join("&")}` : "/study";
  };

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
        📚 다시 공부하기
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 1 }}>
        수업에서 배운 것을 <strong>지금 기준으로 다시 볼 때</strong> 무엇을 어떻게 보면 되는지 정리했습니다.
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 3 }}>
        설명은 공식 문서가 밝힌 상태와 package.json 의 버전에서만 나옵니다. 근거가 없는 말은 적지 않습니다.
        {generatedAt && ` · 마지막 정리 ${generatedAt.slice(0, 10)}`}
      </Typography>

      {/* ── 복습 필터 ── */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1, alignItems: "center" }}>
        <NavChip
          href={link("", selectedSubject)}
          size="small"
          color={selected ? "default" : "primary"}
          variant={selected ? "outlined" : "filled"}
          label={`전체 ${guides.length}`}
        />
        {PRIORITY_ORDER.filter((level) => counts.get(level)).map((level) => (
          <NavChip
            key={level}
            href={link(selected === level ? "" : level, selectedSubject)}
            size="small"
            color={selected === level ? PRIORITY_COLOR[level] ?? "default" : "default"}
            variant={selected === level ? "filled" : "outlined"}
            label={`${PRIORITY_LABEL[level]} ${counts.get(level)}`}
          />
        ))}
      </Box>

      {/* ── 과목 필터 ── */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
        <Typography variant="caption" color="text.secondary">
          과목
        </Typography>
        {subjects.map((name) => (
          <NavChip
            key={name}
            href={link(selected, selectedSubject === name ? "" : name)}
            size="small"
            color={selectedSubject === name ? "primary" : "default"}
            variant={selectedSubject === name ? "filled" : "outlined"}
            label={subjectLabel(name)}
          />
        ))}
      </Box>

      {selected && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          {PRIORITY_MEANING[selected]}
        </Typography>
      )}

      <Divider sx={{ mb: 3 }} />

      {/* ── 먼저 볼 자료 ── */}
      {!selected && notableMaterials.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
            먼저 볼 자료
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            손볼 것이 있는 자료만 모았습니다. 나머지 자료는 그대로 다시 봐도 됩니다.
          </Typography>
          <Paper variant="outlined">
            <List dense disablePadding>
              {notableMaterials.slice(0, 12).map((material) => (
                <NavListItem key={material.materialId} href={`/m/${encodeURIComponent(material.materialId)}`}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <span>{material.title}</span>
                        <Chip
                          size="small"
                          color={PRIORITY_COLOR[material.priority] ?? "default"}
                          label={PRIORITY_LABEL[material.priority]}
                        />
                      </Box>
                    }
                    secondary={material.topics
                      .filter((entry) => entry.priority !== "KEEP")
                      .slice(0, 5)
                      .map((entry) => entry.topic)
                      .join(", ")}
                    slotProps={{
                      primary: { sx: { fontSize: "0.875rem" } },
                      secondary: { sx: { fontSize: "0.72rem", fontFamily: "'D2Coding', monospace" } },
                    }}
                  />
                </NavListItem>
              ))}
            </List>
          </Paper>
        </Box>
      )}

      {/*
        ── 설명 카드 ──
        필터를 고르지 않았으면 우선순위별로 절을 나눠 보여줍니다.
        "새 방식으로 교체"부터 눈에 띄어야 하므로, 급한 갈래를 먼저 · 따로 보여줍니다.
        (design-mockups-v2 03번 — "새 방식으로 교체 N건" 처럼 갈래별 제목이 붙습니다)
      */}
      {selected ? (
        <>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            {PRIORITY_LABEL[selected]}
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {sorted.length}건
            </Typography>
          </Typography>
          {sorted.slice(0, LIMIT).map((guide) => (
            <StudyCard key={guide.comparisonId} guide={guide} showSubject={!selectedSubject} />
          ))}
        </>
      ) : (
        PRIORITY_ORDER.filter((level) => level !== "KEEP" && counts.get(level)).map((level) => {
          const group = sorted.filter((guide) => guide.learningPriority === level);
          return (
            <Box key={level} sx={{ mb: 4 }}>
              <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
                {PRIORITY_LABEL[level]}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {group.length}건
                </Typography>
              </Typography>
              {group.slice(0, LIMIT).map((guide) => (
                <StudyCard key={guide.comparisonId} guide={guide} showSubject={!selectedSubject} />
              ))}
            </Box>
          );
        })
      )}

      {sorted.length > LIMIT && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          {sorted.length}건 중 {LIMIT}건을 보여주고 있습니다. 위 딱지로 좁혀 보세요.
        </Typography>
      )}
    </Box>
  );
}
