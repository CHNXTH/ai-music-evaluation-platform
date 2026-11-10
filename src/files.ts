import Papa from 'papaparse';
import { z } from 'zod';
import { annotationSchema, caseSchema, judgeSchema, reviewerSchema, rubricSchema } from './model';
import type { Annotation, EvaluationCase, Workspace } from './model';
import { canonical, validateAnnotation } from './domain';
export function parseRows(content: string, filename: string): Record<string, unknown>[] {
  if (filename.toLowerCase().endsWith('.csv')) {
    const result = Papa.parse<Record<string, string>>(content.replace(/^\uFEFF/, ''), {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });
    if (result.errors.length) throw new Error(`CSV 格式错误：${result.errors[0].message}`);
    return result.data;
  }
  const json = JSON.parse(content);
  const rows = Array.isArray(json) ? json : (json.cases ?? json.judges ?? json.records);
  if (!Array.isArray(rows)) throw new Error('文件须包含对象数组，或 cases / judges / records 数组');
  return rows;
}
export function importCases(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
  dataset_id: string,
): EvaluationCase[] {
  if (!rows.length) throw new Error('文件中没有案例');
  const result = rows.map((raw, i) => {
    const obj: Record<string, unknown> = {};
    for (const [target, source] of Object.entries(mapping))
      if (source && raw[source] !== undefined) obj[target] = raw[source];
    for (const key of ['songs', 'tags']) {
      if (typeof obj[key] === 'string') {
        try {
          obj[key] = JSON.parse(obj[key] as string);
        } catch {
          throw new Error(`第 ${i + 1} 行：${key} 必须为 JSON 数组`);
        }
      }
    }
    obj.dataset_id = dataset_id;
    try {
      return caseSchema.parse(obj);
    } catch (e) {
      throw new Error(
        `第 ${i + 1} 行：${e instanceof z.ZodError ? e.issues.map((x) => x.path.join('.') + ' ' + x.message).join('；') : String(e)}`,
      );
    }
  });
  if (new Set(result.map((c) => c.case_id)).size !== result.length)
    throw new Error('导入文件存在重复 Case ID');
  return result;
}
export function parseJudges(content: string, filename: string) {
  const rows = parseRows(content, filename);
  if (!rows.length) throw new Error('文件中没有 Judge 评分');
  return rows.map((r, i) => {
    try {
      return judgeSchema.parse({
        ...r,
        judge_score: typeof r.judge_score === 'string' ? Number(r.judge_score) : r.judge_score,
      });
    } catch (e) {
      throw new Error(
        `第 ${i + 1} 行：${e instanceof z.ZodError ? e.issues.map((x) => x.path.join('.') + ' ' + x.message).join('；') : String(e)}`,
      );
    }
  });
}
export function toCSV(rows: unknown[]) {
  return (
    '\uFEFF' +
    Papa.unparse(
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row as Record<string, unknown>).map(([k, v]) => {
            let value = typeof v === 'object' ? JSON.stringify(v) : v;
            if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) value = "'" + value;
            return [k, value];
          }),
        ),
      ),
      { newline: '\r\n' },
    )
  );
}
export function download(filename: string, data: unknown, format: 'json' | 'csv' = 'json') {
  const text = format === 'json' ? JSON.stringify(data, null, 2) : toCSV(data as unknown[]);
  const url = URL.createObjectURL(
    new Blob([text], {
      type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const exchangeSchema = z.object({
  format: z.literal('music-annotations-v1'),
  cases: z.array(caseSchema),
  rubrics: z.array(rubricSchema),
  reviewers: z.array(reviewerSchema),
  annotations: z.array(annotationSchema),
});
export function exportAnnotations(w: Workspace, reviewer: string) {
  const annotations = w.annotations.filter(
    (a) => a.reviewer_id === reviewer && a.status === 'submitted',
  );
  return {
    format: 'music-annotations-v1',
    cases: w.cases.filter((c) => annotations.some((a) => a.case_id === c.case_id)),
    rubrics: w.rubrics.filter((r) => annotations.some((a) => a.rubric_version === r.version)),
    reviewers: w.reviewers.filter((r) => r.id === reviewer),
    annotations,
  };
}
export function mergeAnnotations(w: Workspace, content: unknown) {
  const bundle = exchangeSchema.parse(content);
  if (!bundle.annotations.length) throw new Error('文件没有已提交标注');
  for (const c of bundle.cases) {
    const local = w.cases.find((x) => x.case_id === c.case_id);
    if (!local || canonical(local) !== canonical(c))
      throw new Error(`案例 ${c.case_id} 与本地内容不一致，请先交换相同评测集`);
  }
  for (const r of bundle.rubrics) {
    const local = w.rubrics.find((x) => x.version === r.version);
    if (!local || canonical(local) !== canonical(r)) throw new Error(`Rubric ${r.version} 不一致`);
  }
  for (const p of bundle.reviewers) {
    const local = w.reviewers.find((x) => x.id === p.id);
    if (local && local.name !== p.name) throw new Error(`评估员 ID ${p.id} 存在姓名冲突`);
    if (!local) w.reviewers.push({ ...p, role: 'annotator' });
  }
  let count = 0;
  for (const a of bundle.annotations) {
    if (a.status !== 'submitted') throw new Error('交换文件只能包含已提交标注');
    const existing = w.annotations.find((x) => x.id === a.id);
    if (existing) {
      if (canonical(existing) !== canonical(a)) throw new Error('标注 ID 冲突');
      continue;
    }
    const validated = validateAnnotation(w, a);
    w.annotations.push(validated);
    count++;
  }
  return count;
}
export function flattenAnnotations(annotations: Annotation[]) {
  return annotations.flatMap((a) =>
    Object.entries(a.ratings).map(([dimension_id, r]) => ({
      annotation_id: a.id,
      case_id: a.case_id,
      reviewer_id: a.reviewer_id,
      rubric_version: a.rubric_version,
      status: a.status,
      dimension_id,
      ...r,
      updated_at: a.updated_at,
    })),
  );
}
