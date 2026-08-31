/**
 * 실전 예제 목록 — Momentalk 프로젝트 코드로 개념 복습하기.
 *
 * ■ 수업자료와 무엇이 다른가
 *
 * 수업자료(/learn)는 개념 학습의 중심이고, 이 화면은 그 개념이 **실제 팀 프로젝트에서
 * 어떻게 쓰였는지** 보는 자리입니다. 각 예제는 원본 저장소의 고정 커밋 한 지점을 가리키며,
 * 코드는 원문 그대로입니다.
 *
 * ■ 여기서 만들지 않습니다
 *
 * project_examples 테이블(없으면 project-examples/*.json)을 읽어 보여주기만 합니다.
 * 예제 추가·수정은 project-examples/*.json 을 고치고 `node src/index.ts sync-project-examples`.
 */
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { NavCardArea } from "@/components/nav";
import { subjectLabel } from "@/lib/data";
import { getProjectExamples } from "@/lib/projectExamples";

export const metadata = { title: "실전 예제 · 수업자료 아카이브" };

export default async function ExamplesPage() {
  const examples = await getProjectExamples();

  if (examples.length === 0) {
    return (
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
          실전 예제
        </Typography>
        <Typography color="text.secondary">
          아직 등록된 실전 예제가 없습니다. 터미널에서{" "}
          <Box component="code" sx={{ px: 0.7, py: 0.2, bgcolor: "action.hover", borderRadius: 0.5 }}>
            node src/index.ts sync-project-examples
          </Box>{" "}
          를 실행하거나 <code>project-examples/*.json</code> 을 확인하세요.
        </Typography>
      </Box>
    );
  }

  const projects = [...new Set(examples.map((e) => e.project))];
  const bySubject = new Map<string, typeof examples>();
  for (const example of examples) {
    const key = example.subject ?? "_unclassified";
    const list = bySubject.get(key) ?? [];
    list.push(example);
    bySubject.set(key, list);
  }

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
        🧩 실전 예제
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 1 }}>
        수업에서 배운 개념이 실제 팀 프로젝트 코드에서 어떻게 쓰였는지 보는 자리입니다. 개념 학습의
        중심은 <strong>통합 학습자료</strong>이고, 여기서는 그 개념을 실제 코드와 연결해 복습합니다.
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 3 }}>
        출처: {projects.join(", ")} · 코드는 원본 저장소의 고정 커밋에서 원문 그대로 가져왔습니다.
        팀 프로젝트이므로 파일 단위 작성자는 추정하지 않습니다.
      </Typography>

      {[...bySubject.entries()].map(([subject, list]) => (
        <Box key={subject} sx={{ mb: 4 }}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
            {subject === "_unclassified" ? "기타" : subjectLabel(subject)}
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
              gap: 2,
            }}
          >
            {list.map((example) => (
              <Card key={example.id} variant="outlined">
                <NavCardArea
                  href={`/examples/${encodeURIComponent(example.id)}`}
                  sx={{ p: 2.5, height: "100%", alignItems: "flex-start" }}
                >
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1, flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {example.title}
                    </Typography>
                    <Chip size="small" variant="outlined" label={example.project} />
                  </Box>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", fontFamily: "'D2Coding', 'Consolas', monospace", mb: 1 }}
                  >
                    {example.filePath}
                    {example.lineStart != null && example.lineEnd != null
                      ? `  (${example.lineStart}–${example.lineEnd})`
                      : ""}
                  </Typography>

                  <Box sx={{ display: "flex", gap: 0.7, flexWrap: "wrap" }}>
                    {example.concepts.slice(0, 5).map((concept) => (
                      <Chip key={concept} size="small" label={concept} />
                    ))}
                  </Box>
                </NavCardArea>
              </Card>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
