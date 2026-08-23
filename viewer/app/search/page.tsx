/**
 * 검색 결과.
 *
 * 제목·본문뿐 아니라 그 자료에 **딸린 실습 코드까지** 찾습니다.
 * 본문에는 없고 실습 코드에서만 걸린 자료에는 "💻 실습 코드" 딱지가 붙습니다.
 *
 * 결과 목록을 따로 만들지 않는 이유는 같은 수업자료가 두 번 나오지 않게 하기 위해서입니다.
 * 어느 쪽에서 걸렸든 한 줄로 보여주고, 누르면 설명·실습 코드·공식 문서가 다 있는 화면으로 갑니다.
 */

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { NavListItem } from "@/components/nav";
import { search, subjectLabel } from "@/lib/data";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (query.length < 2) {
    return (
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
          검색
        </Typography>
        <Typography color="text.secondary">
          위쪽 검색창에 두 글자 이상 입력해 주세요. 제목과 본문을 함께 찾습니다.
        </Typography>
      </Box>
    );
  }

  const { hits, totalMaterials, totalReferences } = await search(query);

  const materials = hits.filter((h) => h.type === "material");
  const references = hits.filter((h) => h.type === "reference");

  /** 표시 개수가 전체보다 적으면 "n건 중 m건" 으로 알려 줍니다. */
  const countLabel = (shown: number, total: number): string =>
    shown < total ? `${total}건 중 ${shown}건` : `${total}건`;

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
        “{query}” 검색 결과
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        수업자료 {countLabel(materials.length, totalMaterials)} · 공식 문서 요약{" "}
        {countLabel(references.length, totalReferences)}
      </Typography>

      {hits.length === 0 && (
        <Typography color="text.secondary">
          찾은 자료가 없습니다. 다른 낱말로 찾아보세요.
        </Typography>
      )}

      {[
        { label: "수업자료", items: materials, total: totalMaterials },
        { label: "공식 문서 요약", items: references, total: totalReferences },
      ].map(({ label, items, total }) =>
        items.length === 0 ? null : (
          <Paper key={label} variant="outlined" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ px: 2, pt: 2, pb: 1, fontWeight: 700 }}>
              {label} {countLabel(items.length, total)}
            </Typography>

            <List dense disablePadding>
              {items.map((hit) => (
                <NavListItem
                  key={hit.href}
                  href={hit.href}
                  sx={{ py: 1.2, alignItems: "flex-start" }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <span>{hit.title}</span>
                        <Chip size="small" variant="outlined" label={subjectLabel(hit.subject)} />
                        {hit.inTitle && <Chip size="small" color="primary" label="제목 일치" />}
                        {/* 본문에는 없고 딸린 실습 코드에서 걸린 자료임을 알려 줍니다. */}
                        {hit.inPractice && (
                          <Chip size="small" color="success" variant="outlined" label="💻 실습 코드" />
                        )}
                      </Box>
                    }
                    secondary={hit.snippet}
                    slotProps={{
                      primary: { sx: { fontSize: "0.9rem" } },
                      secondary: { sx: { fontSize: "0.78rem" } },
                    }}
                  />
                </NavListItem>
              ))}
            </List>
          </Paper>
        ),
      )}
    </Box>
  );
}
