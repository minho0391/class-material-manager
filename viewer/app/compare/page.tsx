/**
 * 수업 방식 ↔ 공식 문서 비교 결과.
 *
 * ■ 이 화면이 답하려는 것
 *
 *   "수업 때 배운 이 방식, 지금도 그대로 써도 되나?"
 *
 * ■ 판단을 여기서 하지 않습니다
 *
 * data/comparisons.json 을 읽어 보여주기만 합니다.
 * 그리고 **왜 그렇게 판단했는지 근거를 함께 보여줍니다.**
 * 사용자가 직접 공식 문서로 가서 확인할 수 있어야 하기 때문입니다.
 */
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { NavChip } from "@/components/nav";
import {
  CHANGE_TYPE_LABEL,
  CHANGE_TYPE_MEANING,
  COMPARISON_LABEL,
  COMPARISON_MEANING,
  SEVERITY_LABEL,
  getComparisons,
  subjectLabel,
  type ComparisonItem,
} from "@/lib/data";

export const metadata = { title: "수업 방식 점검 · 수업자료 아카이브" };

/** 상태별 색 — 눈여겨볼 것이 눈에 띄게 */
const COLOR: Record<string, "default" | "error" | "warning" | "info" | "success"> = {
  DEPRECATED: "error",
  UNSTABLE: "warning",
  VERSION_GAP: "warning",
  REVIEW_REQUIRED: "info",
  NOT_FOUND: "default",
  CURRENT: "success",
};

/** 보여줄 순서 — 문제 있는 것부터 */
const ORDER = ["DEPRECATED", "UNSTABLE", "VERSION_GAP", "REVIEW_REQUIRED", "NOT_FOUND", "CURRENT"];

/** 무게별 색 — 급한 것이 눈에 먼저 들어오게 */
const SEVERITY_COLOR: Record<string, "default" | "error" | "warning" | "info"> = {
  HIGH: "error",
  MEDIUM: "warning",
  LOW: "info",
  NONE: "default",
};

/** 무게 순서 — 급한 것부터 */
const SEVERITY_ORDER = ["HIGH", "MEDIUM", "LOW", "NONE"];

/**
 * 예전 방식 → 지금 방식.
 *
 * **공식 문서가 말한 것만 보여 줍니다.** 우리가 지어낸 권장안은 여기 오지 않습니다.
 */
function PatternShift({ item }: { item: ComparisonItem }) {
  if (!item.oldPattern && !item.currentPattern && !item.recommendedAlternative) return null;

  const code = { fontFamily: "'D2Coding', monospace", wordBreak: "break-word" as const };

  return (
    <Box sx={{ mb: 1.5, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
      {item.oldPattern && (
        <Typography variant="caption" sx={{ display: "block", ...code }}>
          수업 때 <strong>{item.oldPattern}</strong>
        </Typography>
      )}
      {item.currentPattern && (
        <Typography variant="caption" sx={{ display: "block", ...code }}>
          지금은 <strong>{item.currentPattern}</strong>
        </Typography>
      )}
      {item.recommendedAlternative && item.recommendedAlternative !== item.currentPattern && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          공식 문서가 이렇게 적어 두었습니다 — {item.recommendedAlternative}
        </Typography>
      )}
    </Box>
  );
}

function ItemCard({ item }: { item: ComparisonItem }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontFamily: "'D2Coding', monospace" }}>
          {item.topic}
        </Typography>
        <Chip size="small" color={COLOR[item.status] ?? "default"} label={COMPARISON_LABEL[item.status] ?? item.status} />
        <NavChip
          size="small"
          variant="outlined"
          href={`/s/${encodeURIComponent(item.subject)}`}
          label={subjectLabel(item.subject)}
        />
        <Chip size="small" variant="outlined" label={item.kind === "package" ? "패키지 버전" : "문법·API"} />
        {item.changeType && item.changeType !== "NONE" && (
          <Chip size="small" variant="outlined" label={CHANGE_TYPE_LABEL[item.changeType] ?? item.changeType} />
        )}
        {item.severity && item.severity !== "NONE" && (
          <Chip
            size="small"
            color={SEVERITY_COLOR[item.severity] ?? "default"}
            label={SEVERITY_LABEL[item.severity] ?? item.severity}
          />
        )}
        {item.needsReview && <Chip size="small" color="info" label="공식문서가 바뀜 — 다시 볼 것" />}
      </Box>

      <Typography variant="body2" sx={{ mb: 0.5 }}>
        {item.reason}
      </Typography>

      {item.changeType && CHANGE_TYPE_MEANING[item.changeType] && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          {CHANGE_TYPE_MEANING[item.changeType]}
        </Typography>
      )}

      <PatternShift item={item} />

      {/* ── 버전 ── */}
      {item.versions && (
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            수업 때 <strong>{item.versions.atLesson}</strong>
          </Typography>
          {item.versions.latestInCourse && (
            <Typography variant="caption" color="text.secondary">
              수업자료 안 최신 <strong>{item.versions.latestInCourse}</strong>
            </Typography>
          )}
          {item.versions.inThisProject && (
            <Typography variant="caption" color="text.secondary">
              이 저장소 <strong>{item.versions.inThisProject}</strong>
            </Typography>
          )}
        </Box>
      )}

      {/* ── 어디서 배웠고 어디서 썼는가 ── */}
      {item.taughtIn.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          📄 수업 설명자료: {item.taughtIn.map((t) => t.title).join(", ")}
        </Typography>
      )}
      {item.usedIn.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          📦 실습 코드: {item.usedIn.slice(0, 3).map((u) => u.zipTitle).join(", ")}
          {item.usedIn.length > 3 && ` 외 ${item.usedIn.length - 3}건`}
        </Typography>
      )}

      {/* ── 근거 ── */}
      <Box sx={{ mt: 1.5, pl: 1.5, borderLeft: "3px solid", borderColor: "divider" }}>
        {item.evidence.map((ev, index) => (
          <Box key={index} sx={{ mb: 0.8 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {ev.source}
            </Typography>
            <Typography
              variant="caption"
              sx={{ display: "block", fontFamily: "'D2Coding', monospace", wordBreak: "break-word" }}
            >
              {ev.text}
            </Typography>
            {ev.where && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {ev.where.startsWith("http") ? (
                  <Link href={ev.where} target="_blank" rel="noopener noreferrer">
                    {ev.where}
                  </Link>
                ) : (
                  ev.where
                )}
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      {/* ── 확인하러 가기 ── */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5, alignItems: "center" }}>
        {item.official && (
          <Link href={item.official.sourceUrl} target="_blank" rel="noopener noreferrer" variant="caption">
            🔗 공식 문서 원문
          </Link>
        )}
        {item.lessons.slice(0, 2).map((lesson) => (
          <NavChip
            key={lesson.materialId}
            size="small"
            variant="outlined"
            href={`/m/${encodeURIComponent(lesson.materialId)}`}
            label={`학습자료: ${lesson.title.slice(0, 22)}`}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          확인 {item.lastComparedAt.slice(0, 10)}
          {item.official?.fetchedAt ? ` · 공식문서 ${item.official.fetchedAt}` : ""}
        </Typography>
      </Box>
    </Paper>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string }>;
}) {
  const { status, severity } = await searchParams;
  const { items, generatedAt } = await getComparisons();

  if (items.length === 0) {
    return (
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }} gutterBottom>
          수업 방식 점검
        </Typography>
        <Typography color="text.secondary">
          아직 비교한 결과가 없습니다. 터미널에서{" "}
          <Box component="code" sx={{ px: 0.7, py: 0.2, bgcolor: "action.hover", borderRadius: 0.5 }}>
            node src/index.ts compare
          </Box>{" "}
          를 실행하면 이 자리에 나타납니다.
        </Typography>
      </Box>
    );
  }

  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);

  const severityCounts = new Map<string, number>();
  for (const item of items) {
    const key = item.severity ?? "NONE";
    severityCounts.set(key, (severityCounts.get(key) ?? 0) + 1);
  }

  const selected = status && COMPARISON_LABEL[status] ? status : "";
  const selectedSeverity = severity && SEVERITY_LABEL[severity] ? severity : "";

  const shown = items.filter(
    (item) =>
      (!selected || item.status === selected) &&
      (!selectedSeverity || (item.severity ?? "NONE") === selectedSeverity),
  );

  // 급한 것부터 보여 줍니다. 무게가 같으면 예전 순서(상태 → 과목 → 이름)를 따릅니다.
  const sorted = [...shown].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity ?? "NONE") - SEVERITY_ORDER.indexOf(b.severity ?? "NONE") ||
      ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
      a.subject.localeCompare(b.subject) ||
      a.topic.localeCompare(b.topic, "ko"),
  );

  // 화면이 너무 길어지지 않게 끊습니다. 필터로 좁혀 볼 수 있습니다.
  const LIMIT = 60;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }} gutterBottom>
        ⚖️ 수업 방식 점검
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 1 }}>
        수업 때 쓴 기술을 <strong>지금 공식 문서</strong>와 견준 결과입니다. 판단의 근거를 함께 보여주니
        직접 확인해 보세요.
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 3 }}>
        공식 문서가 스스로 밝힌 상태와 package.json 의 버전만 근거로 씁니다. 확인하지 못한 것은 확정하지 않습니다.
        {generatedAt && ` · 마지막 확인 ${generatedAt.slice(0, 10)}`}
      </Typography>

      {/* ── 상태 필터 ── */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <NavChip
          href="/compare"
          size="small"
          color={selected || selectedSeverity ? "default" : "primary"}
          variant={selected || selectedSeverity ? "outlined" : "filled"}
          label={`전체 ${items.length}`}
        />
        {ORDER.filter((s) => counts.get(s)).map((s) => (
          <NavChip
            key={s}
            href={`/compare?status=${s}${selectedSeverity ? `&severity=${selectedSeverity}` : ""}`}
            size="small"
            color={selected === s ? COLOR[s] ?? "default" : "default"}
            variant={selected === s ? "filled" : "outlined"}
            label={`${COMPARISON_LABEL[s] ?? s} ${counts.get(s)}`}
          />
        ))}
      </Box>

      {/* ── 무게로 좁혀 보기 ── */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1, alignItems: "center" }}>
        <Typography variant="caption" color="text.secondary">
          급한 정도
        </Typography>
        {SEVERITY_ORDER.filter((level) => severityCounts.get(level)).map((level) => (
          <NavChip
            key={level}
            href={
              selectedSeverity === level
                ? selected
                  ? `/compare?status=${selected}`
                  : "/compare"
                : `/compare?${selected ? `status=${selected}&` : ""}severity=${level}`
            }
            size="small"
            color={selectedSeverity === level ? SEVERITY_COLOR[level] ?? "default" : "default"}
            variant={selectedSeverity === level ? "filled" : "outlined"}
            label={`${SEVERITY_LABEL[level]} ${severityCounts.get(level)}`}
          />
        ))}
      </Box>

      {selected && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          {COMPARISON_MEANING[selected]}
        </Typography>
      )}

      <Divider sx={{ mb: 3 }} />

      {sorted.slice(0, LIMIT).map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}

      {sorted.length > LIMIT && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          {sorted.length}건 중 {LIMIT}건을 보여주고 있습니다. 위 딱지로 상태를 골라 좁혀 보세요.
        </Typography>
      )}
    </Box>
  );
}
