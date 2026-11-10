import { z } from 'zod';
const id = z.string().trim().min(1).max(160);
const text = z.string().max(100000);
const timestamp = z.string().datetime({ offset: true });
const score = z.number().int().min(1).max(5);
export const songSchema = z.object({
  song_id: text.default(''),
  song_name: id,
  singer: text.default(''),
  album: text.default(''),
  source: text.default(''),
  genre: text.default(''),
  mood: text.default(''),
  duration: z.union([z.number().nonnegative(), text]).default(''),
  music_url: z
    .string()
    .refine((v) => !v || /^https?:\/\//i.test(v), '音乐链接仅支持 HTTP / HTTPS')
    .default(''),
});
export const caseSchema = z.object({
  case_id: id,
  dataset_id: id.default('default'),
  scene: id,
  weather: text.default(''),
  atmosphere: text.default(''),
  time_context: text.default(''),
  destination_poi_type: text.default(''),
  user_preferences: text.default(''),
  candidate_sources: text.default(''),
  songs: z.array(songSchema).max(500),
  playlist_title: text.default(''),
  playlist_description: text.default(''),
  info: text.default(''),
  color_id: text.default(''),
  tags: z.array(z.string()).default([]),
  workflow_version: text.default(''),
  created_at: timestamp.default(() => new Date().toISOString()),
});
export type EvaluationCase = z.infer<typeof caseSchema>;
export const dimensionSchema = z.object({
  id,
  name: id,
  weight: z.number().positive().max(100),
  focus: id,
  importance: z.enum(['Essential', 'Important', 'Optional', 'Veto']),
  standards: z.array(id).length(5),
  allow_na: z.boolean(),
  na_rule: text,
  positive: text,
  negative: text,
  boundary: text,
});
export type RubricDimension = z.infer<typeof dimensionSchema>;
export const rubricSchema = z
  .object({
    version: id,
    name: id,
    dimensions: z.array(dimensionSchema).min(1).max(30),
    veto_rules: z.array(
      z.object({
        id,
        label: id,
        kind: z.enum(['song_count', 'duplicate_id', 'missing_id', 'manual']),
        enabled: z.boolean(),
      }),
    ),
    required_songs: z.number().int().min(1).max(500),
    created_at: timestamp,
  })
  .superRefine((r, c) => {
    if (Math.abs(r.dimensions.reduce((s, d) => s + d.weight, 0) - 100) > 0.001)
      c.addIssue({ code: 'custom', message: '维度权重总和必须为 100%' });
    if (new Set(r.dimensions.map((d) => d.id)).size !== r.dimensions.length)
      c.addIssue({ code: 'custom', message: '维度 ID 不得重复' });
  });
export type Rubric = z.infer<typeof rubricSchema>;
export const evidenceSchema = z.object({ song_ids: z.array(text), note: text });
export type AnnotationEvidence = z.infer<typeof evidenceSchema>;
export const ratingSchema = z.object({
  score: z.union([score, z.literal('NA'), z.null()]),
  reason: text,
  evidence: evidenceSchema,
});
export type Rating = z.infer<typeof ratingSchema>;
export const annotationSchema = z.object({
  id,
  case_id: id,
  reviewer_id: id,
  rubric_version: id,
  status: z.enum(['draft', 'submitted']),
  ratings: z.record(z.string(), ratingSchema),
  veto_flags: z.array(text),
  veto_reason: text,
  updated_at: timestamp,
});
export type Annotation = z.infer<typeof annotationSchema>;
export const reviewerSchema = z.object({
  id,
  name: id,
  role: z.enum(['annotator', 'reviewer', 'admin']),
});
export type Reviewer = z.infer<typeof reviewerSchema>;
export const adjudicationSchema = z.object({
  id,
  case_id: id,
  rubric_version: id,
  reviewer_id: id,
  annotation_ids: z.array(id).min(2),
  ratings: z.record(z.string(), ratingSchema),
  veto_resolved: z.boolean(),
  veto_reason: text,
  created_at: timestamp,
});
export type Adjudication = z.infer<typeof adjudicationSchema>;
export const goldSchema = z.object({
  case: caseSchema,
  rubric: rubricSchema,
  annotations: z.array(annotationSchema),
  adjudication: adjudicationSchema,
  ratings: z.record(z.string(), ratingSchema),
  weighted_score: z.number().min(1).max(5),
  confirmed_by: id,
  confirmed_at: timestamp,
});
export type GoldSet = z.infer<typeof goldSchema>;
export const goldVersionSchema = z.object({
  version: id,
  created_at: timestamp,
  created_by: id,
  records: z.array(goldSchema).min(1),
});
export type GoldSetVersion = z.infer<typeof goldVersionSchema>;
export const judgeSchema = z.object({
  case_id: id,
  judge_model: id,
  judge_version: id,
  rubric_version: id,
  dimension_id: id,
  judge_score: score,
  judge_reason: text.default(''),
  evaluation_timestamp: timestamp,
});
export type JudgeEvaluation = z.infer<typeof judgeSchema>;
export const datasetSchema = z.object({ id, name: id, created_at: timestamp });
export type Dataset = z.infer<typeof datasetSchema>;
export const workspaceSchema = z.object({
  schema_version: z.literal(1),
  datasets: z.array(datasetSchema),
  cases: z.array(caseSchema),
  rubrics: z.array(rubricSchema).min(1),
  annotations: z.array(annotationSchema),
  adjudications: z.array(adjudicationSchema),
  goldVersions: z.array(goldVersionSchema),
  judges: z.array(judgeSchema),
  reviewers: z.array(reviewerSchema),
  settings: z.object({
    threshold: z.number().int().min(1).max(4),
    required_annotations: z.number().int().min(2).max(20),
  }),
  audit: z.array(z.object({ id, at: timestamp, actor: id, action: id, entity: text })),
  revision: z.number().int().nonnegative(),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type CaseStatus =
  'Unassigned' | 'In Progress' | 'Submitted' | 'Pending Review' | 'Adjudicated' | 'Gold Confirmed';
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
const names = [
  '场景匹配度',
  '用户偏好匹配',
  '歌曲质量与多样性',
  '歌单整体连贯性',
  'AI 文案与 HMI 表达',
];
const focuses = [
  '当前场景、目标氛围及时间信息',
  '喜欢的歌手、歌曲与曲风',
  '非目标内容、同质化与来源集中情况',
  '情绪、节奏与播放顺序的协调性',
  'Info、歌单名称、色板与业务品牌要求',
];
const standards = [
  [
    '与目标场景和氛围明显冲突',
    '少量歌曲匹配，整体偏离场景',
    '基本符合场景，部分氛围或时间信息未体现',
    '大部分歌曲贴合场景、氛围与时间信息',
    '整体精准贴合场景，时间和氛围线索充分体现',
  ],
  [
    '与已知偏好明显冲突',
    '很少体现已知歌手或曲风偏好',
    '体现部分偏好，但主要偏好覆盖不足',
    '充分体现主要偏好，并有合理探索',
    '准确覆盖已知偏好，探索内容有明确关联',
  ],
  [
    '大量不相关内容或严重重复',
    '相关内容有限，曲风或来源高度集中',
    '歌曲总体相关，多样性仍有明显不足',
    '歌曲相关且在歌手、曲风或来源上较多样',
    '内容质量可靠，多样性与目标兼顾，有充分证据',
  ],
  [
    '情绪或节奏频繁冲突，播放顺序无明显逻辑',
    '多处情绪或节奏跳跃',
    '整体可接受，但部分过渡不自然',
    '整体连贯，节奏和情绪过渡自然',
    '编排完整，情绪与节奏推进细致且服务目标',
  ],
  [
    '文案与色彩严重偏离场景或业务规范',
    '信息表达不清，多处与场景不符',
    '基本准确，名称、文案或色板尚有局部不足',
    '名称、文案及色板清晰一致且符合场景',
    '表达准确简洁，名称、文案与色板形成一致体验',
  ],
];
export function defaultRubric(): Rubric {
  return {
    version: '1.0.0',
    name: '音乐推荐质量评分标准',
    created_at: '2026-11-11T00:00:00.000Z',
    required_songs: 12,
    dimensions: names.map((name, i) => ({
      id: ['scene', 'preference', 'quality', 'coherence', 'expression'][i],
      name,
      weight: [30, 25, 20, 15, 10][i],
      focus: focuses[i],
      importance: i < 2 ? 'Essential' : 'Important',
      standards: standards[i],
      allow_na: true,
      na_rule:
        i === 1
          ? '缺少明确用户偏好时，可说明缺失字段后选择 N/A。'
          : '缺少可验证的上下文、曲风、试听或品牌规范时，应说明证据缺失范围。',
      positive: '充分满足本维度要求且能引用具体上下文或歌曲证据。',
      negative: '存在可验证的冲突、缺失或质量问题。',
      boundary: '证据不完整时不得凭歌曲名称推断内容，需明确说明判断边界。',
    })),
    veto_rules: [
      { id: 'count', label: '歌曲数量不满足要求', kind: 'song_count', enabled: true },
      { id: 'missing', label: '歌曲 ID 缺失，需核验', kind: 'missing_id', enabled: true },
      { id: 'duplicate', label: '重复歌曲 ID', kind: 'duplicate_id', enabled: true },
      { id: 'playback', label: '歌曲 ID 错误或无法播放（需证据）', kind: 'manual', enabled: true },
      { id: 'format', label: '输出格式不符合业务约定', kind: 'manual', enabled: true },
      { id: 'severe', label: '严重违反业务规则', kind: 'manual', enabled: true },
    ],
  };
}
export function initialWorkspace(): Workspace {
  return {
    schema_version: 1,
    revision: 0,
    datasets: [{ id: 'default', name: '默认评测集', created_at: now() }],
    cases: [],
    rubrics: [defaultRubric()],
    annotations: [],
    adjudications: [],
    goldVersions: [],
    judges: [],
    reviewers: [],
    settings: { threshold: 2, required_annotations: 2 },
    audit: [],
  };
}
