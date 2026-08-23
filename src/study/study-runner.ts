/**
 * 학습 설명을 만들어 저장합니다.
 *
 * ■ 다시 만들지 않는 때
 *
 * 설명은 비교 결과에서만 나옵니다. 그러니 **비교 결과가 그대로면 설명도 그대로입니다.**
 * `comparisons.json` 의 `generatedAt` 을 적어 두었다가 같으면 건너뜁니다.
 *
 * template 을 고쳤을 때는 그 값이 같아도 다시 만들어야 하므로 `--force` 를 둡니다.
 */
import { loadComparisons } from "../store/comparison-store.ts";
import {
  loadStudyGuides,
  saveStudyGuides,
  type LearningPriority,
  type StudyData,
} from "../store/study-store.ts";
import { buildStudyGuides } from "./study-builder.ts";

export interface StudyOptions {
  /** 비교 결과가 그대로여도 다시 만듭니다 (설명 template 을 고쳤을 때) */
  force?: boolean;
  /** 결과만 보여주고 파일은 쓰지 않습니다 */
  dryRun?: boolean;
}

export interface StudySummary {
  data: StudyData;
  /** 실제로 만들었는지, 있던 것을 그대로 두었는지 */
  rebuilt: boolean;
  byPriority: Map<LearningPriority, number>;
}

/**
 * 학습 설명을 만듭니다.
 *
 * 비교 결과가 없으면 아무것도 하지 않습니다. 없는 것을 지어내지 않기 위해서입니다.
 */
export async function buildStudy(options: StudyOptions = {}): Promise<StudySummary | null> {
  const comparisons = await loadComparisons();
  if (!comparisons) return null;

  const existing = await loadStudyGuides();

  // 견준 결과가 그대로면 설명도 그대로입니다.
  if (
    !options.force &&
    existing &&
    existing.comparisonsGeneratedAt === comparisons.generatedAt &&
    existing.guides.length === comparisons.items.length
  ) {
    return {
      data: existing,
      rebuilt: false,
      byPriority: countBy(existing),
    };
  }

  const now = new Date().toISOString();
  const data = buildStudyGuides(comparisons, now);

  if (!options.dryRun) await saveStudyGuides(data);

  return { data, rebuilt: true, byPriority: countBy(data) };
}

function countBy(data: StudyData): Map<LearningPriority, number> {
  const counts = new Map<LearningPriority, number>();
  for (const guide of data.guides) {
    counts.set(guide.learningPriority, (counts.get(guide.learningPriority) ?? 0) + 1);
  }
  return counts;
}
