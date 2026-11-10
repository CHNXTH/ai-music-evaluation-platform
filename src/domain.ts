import type {
  Annotation,
  EvaluationCase,
  GoldSetVersion,
  JudgeEvaluation,
  Rating,
  Rubric,
  Workspace,
  CaseStatus,
  Adjudication,
} from './model';
import { annotationSchema, adjudicationSchema, rubricSchema, workspaceSchema } from './model';
export function weightedScore(ratings: Record<string, Rating>, rubric: Rubric): number | null {
  let total = 0,
    weight = 0;
  for (const d of rubric.dimensions) {
    const v = ratings[d.id]?.score;
    if (typeof v === 'number') {
      total += v * d.weight;
      weight += d.weight;
    }
  }
  return weight ? total / weight : null;
}
export function validateRatings(ratings: Record<string, Rating>, r: Rubric) {
  for (const d of r.dimensions) {
    const v = ratings[d.id];
    if (!v || v.score === null) throw new Error(`请完成「${d.name}」评分`);
    if (!v.reason.trim()) throw new Error(`请填写「${d.name}」评分理由或 N/A 原因`);
    if (v.score === 'NA' && !d.allow_na) throw new Error(`「${d.name}」不允许 N/A`);
  }
  if (weightedScore(ratings, r) === null) throw new Error('至少需要一个有效评分维度');
  if (Object.keys(ratings).some((k) => !r.dimensions.some((d) => d.id === k)))
    throw new Error('存在未知评分维度');
}
export function submitted(w: Workspace, id: string, rv: string) {
  return w.annotations.filter(
    (a) => a.case_id === id && a.rubric_version === rv && a.status === 'submitted',
  );
}
export function latestAdjudication(w: Workspace, id: string, rv: string) {
  const list = submitted(w, id, rv);
  if (list.length < w.settings.required_annotations) return undefined;
  return [...w.adjudications]
    .reverse()
    .find(
      (a) =>
        a.case_id === id &&
        a.rubric_version === rv &&
        a.annotation_ids.length === list.length &&
        list.every((b) => a.annotation_ids.includes(b.id)),
    );
}
export function status(w: Workspace, id: string, rv: string): CaseStatus {
  const adjudication = latestAdjudication(w, id, rv);
  if (
    adjudication &&
    w.goldVersions.some((g) =>
      g.records.some(
        (r) =>
          r.case.case_id === id && r.rubric.version === rv && r.adjudication.id === adjudication.id,
      ),
    )
  )
    return 'Gold Confirmed';
  if (adjudication) return 'Adjudicated';
  const list = submitted(w, id, rv);
  if (list.length >= w.settings.required_annotations) return 'Pending Review';
  if (list.length) return 'Submitted';
  return w.annotations.some((a) => a.case_id === id && a.rubric_version === rv)
    ? 'In Progress'
    : 'Unassigned';
}
export const statusLabel: Record<CaseStatus, string> = {
  Unassigned: '未分配',
  'In Progress': '评估中',
  Submitted: '已提交',
  'Pending Review': '待复核',
  Adjudicated: '已裁定',
  'Gold Confirmed': '已入金标',
};
export function differences(annotations: Annotation[], rubric: Rubric, threshold: number) {
  return rubric.dimensions.map((d) => {
    const values = annotations.map((a) => a.ratings[d.id]?.score);
    const nums = values.filter((v): v is number => typeof v === 'number');
    const mixed = new Set(values).size > 1;
    const gap = nums.length ? Math.max(...nums) - Math.min(...nums) : 0;
    return {
      dimension: d,
      values,
      gap,
      mixed,
      priority: gap >= threshold || (mixed && values.includes('NA')),
    };
  });
}
export function pairAgreement(annotations: Annotation[], r: Rubric) {
  let n = 0,
    exact = 0,
    sum = 0;
  for (let i = 0; i < annotations.length; i++)
    for (let j = i + 1; j < annotations.length; j++)
      for (const d of r.dimensions) {
        const a = annotations[i].ratings[d.id]?.score,
          b = annotations[j].ratings[d.id]?.score;
        if (typeof a === 'number' && typeof b === 'number') {
          n++;
          exact += Number(a === b);
          sum += Math.abs(a - b);
        }
      }
  return { n, exact: n ? exact / n : null, mae: n ? sum / n : null };
}
export function deterministicIssues(c: EvaluationCase, r: Rubric) {
  const result: string[] = [];
  for (const rule of r.veto_rules.filter((v) => v.enabled)) {
    if (rule.kind === 'song_count' && c.songs.length !== r.required_songs)
      result.push(`${rule.label}：${c.songs.length} / ${r.required_songs}`);
    if (rule.kind === 'missing_id' && c.songs.some((s) => !s.song_id.trim()))
      result.push(rule.label);
    if (rule.kind === 'duplicate_id') {
      const ids = c.songs.map((s) => s.song_id).filter(Boolean);
      if (new Set(ids).size !== ids.length) result.push(rule.label);
    }
  }
  return result;
}
export function validateAnnotation(w: Workspace, input: Annotation) {
  const a = annotationSchema.parse(input);
  const r = w.rubrics.find((r) => r.version === a.rubric_version);
  const c = w.cases.find((c) => c.case_id === a.case_id);
  if (!r || !c || !w.reviewers.some((p) => p.id === a.reviewer_id))
    throw new Error('案例、标准或评估员不存在');
  if (
    w.annotations.some(
      (b) =>
        b.case_id === a.case_id &&
        b.rubric_version === a.rubric_version &&
        b.reviewer_id === a.reviewer_id &&
        b.id !== a.id,
    )
  )
    throw new Error('同一评估员只能保留一份评分');
  if (w.annotations.some((b) => b.id === a.id && b.status === 'submitted'))
    throw new Error('已提交评分不可修改；请使用新的 Rubric 版本重新评估');
  if (
    Object.values(a.ratings).some((v) =>
      v.evidence.song_ids.some((id) => !c.songs.some((s) => s.song_id === id)),
    )
  )
    throw new Error('证据引用了不存在的歌曲 ID');
  if (a.status === 'submitted') {
    validateRatings(a.ratings, r);
    if (a.veto_flags.length && !a.veto_reason.trim()) throw new Error('请填写业务否决项证据');
  }
  return a;
}
export function validateAdjudication(w: Workspace, input: Adjudication) {
  const a = adjudicationSchema.parse(input);
  const r = w.rubrics.find((r) => r.version === a.rubric_version);
  const list = submitted(w, a.case_id, a.rubric_version);
  const reviewer = w.reviewers.find((p) => p.id === a.reviewer_id);
  if (!r || !reviewer || reviewer.role === 'annotator') throw new Error('请切换至复核人员或管理员');
  if (list.length < w.settings.required_annotations) throw new Error('独立提交数量不足');
  if (a.annotation_ids.length !== list.length || list.some((b) => !a.annotation_ids.includes(b.id)))
    throw new Error('裁定必须覆盖全部当前提交');
  validateRatings(a.ratings, r);
  if (!a.veto_resolved || !a.veto_reason.trim()) throw new Error('请核验业务否决项并填写核验结论');
  return a;
}
export function createGold(
  w: Workspace,
  ids: string[],
  rv: string,
  version: string,
  actor: string,
  at: string,
): GoldSetVersion {
  if (!version.trim() || w.goldVersions.some((v) => v.version === version))
    throw new Error('金标版本不能为空或重复');
  if (!w.reviewers.some((p) => p.id === actor && p.role === 'admin'))
    throw new Error('发布金标需要管理员身份');
  const rubric = w.rubrics.find((r) => r.version === rv);
  if (!rubric || !ids.length || new Set(ids).size !== ids.length) throw new Error('请选择有效案例');
  return {
    version,
    created_by: actor,
    created_at: at,
    records: ids.map((id) => {
      const c = w.cases.find((c) => c.case_id === id),
        a = latestAdjudication(w, id, rv);
      if (!c || !a) throw new Error(`案例 ${id} 尚未完成完整人工裁定`);
      validateAdjudication(w, a);
      const value = weightedScore(a.ratings, rubric);
      if (value === null) throw new Error('缺少有效参考评分');
      return structuredClone({
        case: c,
        rubric,
        annotations: submitted(w, id, rv),
        adjudication: a,
        ratings: a.ratings,
        weighted_score: value,
        confirmed_by: actor,
        confirmed_at: at,
      });
    }),
  };
}
export type CalibrationPair = {
  human: number;
  judge: number;
  case_id: string;
  dimension_id: string;
  human_reason: string;
  judge_reason: string;
  scene: string;
};
export type CalibrationReport = {
  n: number;
  exact: number | null;
  within1: number | null;
  mae: number | null;
  kappa: number | null;
  kappa_reason: string;
  matrix: number[][];
  pairs: CalibrationPair[];
  unmatched: number;
};
export function calculateMetrics(pairs: CalibrationPair[], unmatched = 0): CalibrationReport {
  const n = pairs.length,
    matrix = Array.from({ length: 5 }, () => Array<number>(5).fill(0));
  for (const p of pairs) matrix[p.human - 1][p.judge - 1]++;
  let exact = 0,
    within1 = 0,
    errors = 0,
    observed = 0;
  const h = Array<number>(5).fill(0),
    j = Array<number>(5).fill(0);
  for (const p of pairs) {
    const diff = Math.abs(p.human - p.judge);
    exact += Number(diff === 0);
    within1 += Number(diff <= 1);
    errors += diff;
    observed += diff * diff;
    h[p.human - 1]++;
    j[p.judge - 1]++;
  }
  let expected = 0;
  for (let a = 0; a < 5; a++)
    for (let b = 0; b < 5; b++) expected += ((a - b) ** 2 * h[a] * j[b]) / (n || 1);
  const kappa = n >= 2 && expected > 0 ? 1 - observed / expected : null;
  return {
    n,
    exact: n ? exact / n : null,
    within1: n ? within1 / n : null,
    mae: n ? errors / n : null,
    kappa,
    kappa_reason: !n
      ? '无有效配对'
      : n < 2
        ? '有效配对少于 2 条'
        : expected === 0
          ? '评分分布无变化，期望加权分歧为 0'
          : '按有效维度配对计算，样本少时结果可能不稳定',
    matrix,
    pairs,
    unmatched,
  };
}
export function calibrate(
  gold: GoldSetVersion | undefined,
  judges: JudgeEvaluation[],
  filter: { model?: string; version?: string; scene?: string; dimension?: string } = {},
): CalibrationReport {
  const pairs: CalibrationPair[] = [];
  let unmatched = 0;
  for (const j of judges.filter(
    (j) =>
      (!filter.model || j.judge_model === filter.model) &&
      (!filter.version || j.judge_version === filter.version) &&
      (!filter.dimension || j.dimension_id === filter.dimension),
  )) {
    const g = gold?.records.find(
      (g) => g.case.case_id === j.case_id && g.rubric.version === j.rubric_version,
    );
    if (filter.scene && g?.case.scene !== filter.scene) continue;
    const h = g?.ratings[j.dimension_id];
    if (!g || typeof h?.score !== 'number') {
      unmatched++;
      continue;
    }
    pairs.push({
      human: h.score,
      judge: j.judge_score,
      case_id: j.case_id,
      dimension_id: j.dimension_id,
      human_reason: h.reason,
      judge_reason: j.judge_reason,
      scene: g.case.scene,
    });
  }
  return calculateMetrics(pairs, unmatched);
}
export const judgeKey = (j: JudgeEvaluation) =>
  JSON.stringify([j.case_id, j.judge_model, j.judge_version, j.rubric_version, j.dimension_id]);
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object')
    return `{${Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => JSON.stringify(k) + ':' + canonical(x))
      .join(',')}}`;
  return JSON.stringify(v);
}
export function validateWorkspace(input: unknown): Workspace {
  const w = workspaceSchema.parse(input);
  const unique = (xs: string[], name: string) => {
    if (new Set(xs).size !== xs.length) throw new Error(`${name}存在重复 ID`);
  };
  unique(
    w.cases.map((c) => c.case_id),
    '案例',
  );
  unique(
    w.datasets.map((x) => x.id),
    '评测集',
  );
  unique(
    w.reviewers.map((x) => x.id),
    '人员',
  );
  unique(
    w.rubrics.map((r) => r.version),
    '标准',
  );
  unique(
    w.annotations.map((a) => a.id),
    '标注',
  );
  unique(
    w.annotations.map((a) => JSON.stringify([a.case_id, a.rubric_version, a.reviewer_id])),
    '人员评分',
  );
  unique(
    w.adjudications.map((a) => a.id),
    '裁定',
  );
  unique(
    w.goldVersions.map((g) => g.version),
    '金标',
  );
  unique(w.judges.map(judgeKey), 'Judge 配对');
  for (const c of w.cases)
    if (!w.datasets.some((d) => d.id === c.dataset_id)) throw new Error('案例所属评测集不存在');
  for (const a of w.annotations) {
    validateAnnotation({ ...w, annotations: w.annotations.filter((x) => x.id !== a.id) }, a);
  }
  for (const a of w.adjudications) {
    const subset = {
      ...w,
      settings: { ...w.settings, required_annotations: 2 },
      annotations: w.annotations.filter((x) => a.annotation_ids.includes(x.id)),
    };
    validateAdjudication(subset, a);
  }
  for (const g of w.goldVersions) {
    unique(
      g.records.map((x) => x.case.case_id),
      '版本内金标案例',
    );
    for (const x of g.records) {
      unique(
        x.annotations.map((a) => a.id),
        '金标标注',
      );
      unique(
        x.annotations.map((a) => a.reviewer_id),
        '金标评估员',
      );
      rubricSchema.parse(x.rubric);
      validateRatings(x.ratings, x.rubric);
      if (Math.abs((weightedScore(x.ratings, x.rubric) ?? 0) - x.weighted_score) > 1e-9)
        throw new Error('金标综合分校验失败');
      if (canonical(x.ratings) !== canonical(x.adjudication.ratings))
        throw new Error('金标与裁定评分不一致');
      if (
        x.case.case_id !== x.adjudication.case_id ||
        x.rubric.version !== x.adjudication.rubric_version
      )
        throw new Error('金标快照关联错误');
      const historical = {
        ...w,
        settings: { ...w.settings, required_annotations: 2 },
        cases: [x.case],
        rubrics: [x.rubric],
        annotations: x.annotations,
      };
      for (const annotation of x.annotations) {
        if (
          annotation.status !== 'submitted' ||
          annotation.case_id !== x.case.case_id ||
          annotation.rubric_version !== x.rubric.version
        )
          throw new Error('金标历史标注关联错误');
        validateAnnotation(
          {
            ...historical,
            annotations: historical.annotations.filter((a) => a.id !== annotation.id),
          },
          annotation,
        );
      }
      if (!w.reviewers.some((p) => p.id === x.confirmed_by && p.role === 'admin'))
        throw new Error('金标确认人员无效');
      validateAdjudication(historical, x.adjudication);
    }
  }
  return w;
}
