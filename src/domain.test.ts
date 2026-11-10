import { describe, expect, it } from 'vitest';
import {
  caseSchema,
  defaultRubric,
  initialWorkspace,
  now,
  rubricSchema,
  type Annotation,
  type Rating,
  type Workspace,
} from './model';
import {
  calibrate,
  calculateMetrics,
  canonical,
  createGold,
  deterministicIssues,
  differences,
  latestAdjudication,
  pairAgreement,
  status,
  validateAdjudication,
  validateAnnotation,
  validateWorkspace,
  weightedScore,
} from './domain';
import {
  exportAnnotations,
  importCases,
  mergeAnnotations,
  parseJudges,
  parseRows,
  toCSV,
} from './files';
import { LocalRepository } from './storage';
const ratings = (scores: (number | 'NA' | null)[] = [3, 4, 5, 2, 1]): Record<string, Rating> =>
  Object.fromEntries(
    defaultRubric().dimensions.map((d, i) => [
      d.id,
      { score: scores[i], reason: '基于上下文核验', evidence: { song_ids: [], note: '' } },
    ]),
  );
function setup(): Workspace {
  const w = initialWorkspace();
  w.cases.push(
    caseSchema.parse({
      case_id: 'C1',
      scene: '通勤',
      songs: [],
      created_at: '2026-11-11T00:00:00.000Z',
    }),
  );
  w.reviewers = [
    { id: 'a', name: '人员 A', role: 'annotator' },
    { id: 'b', name: '人员 B', role: 'annotator' },
    { id: 'r', name: '复核人', role: 'reviewer' },
    { id: 'admin', name: '管理员', role: 'admin' },
  ];
  return w;
}
const annotation = (id: string, reviewer_id = id): Annotation => ({
  id,
  reviewer_id,
  case_id: 'C1',
  rubric_version: '1.0.0',
  status: 'submitted',
  ratings: ratings(),
  veto_flags: [],
  veto_reason: '',
  updated_at: now(),
});
function ready() {
  const w = setup();
  w.annotations = [annotation('a'), annotation('b')];
  w.adjudications = [
    {
      id: 'adj',
      case_id: 'C1',
      rubric_version: '1.0.0',
      reviewer_id: 'r',
      annotation_ids: ['a', 'b'],
      ratings: ratings(),
      veto_resolved: true,
      veto_reason: '已核验歌曲数量及缺失范围，作为低质量案例保留',
      created_at: now(),
    },
  ];
  return w;
}
describe('评分计算与状态', () => {
  it('按权重计算实际综合分', () =>
    expect(weightedScore(ratings(), defaultRubric())).toBeCloseTo(3.3));
  it('N/A 排除分子与分母并重新归一化', () =>
    expect(weightedScore(ratings(['NA', 4, 5, 2, 1]), defaultRubric())).toBeCloseTo(2.4 / 0.7));
  it('未评分与 1 分不同，全部 N/A 无数值', () => {
    expect(weightedScore(ratings([null, null, null, null, null]), defaultRubric())).toBeNull();
    expect(weightedScore(ratings([1, null, null, null, null]), defaultRubric())).toBe(1);
    expect(weightedScore(ratings(['NA', 'NA', 'NA', 'NA', 'NA']), defaultRubric())).toBeNull();
  });
  it('不允许未完成评分或缺少 N/A 理由提交', () => {
    const w = setup(),
      a = annotation('a');
    a.ratings.scene.score = null;
    expect(() => validateAnnotation(w, a)).toThrow('请完成');
    a.ratings.scene = { ...a.ratings.scene, score: 'NA', reason: '' };
    expect(() => validateAnnotation(w, a)).toThrow('理由');
  });
  it('遵守维度 N/A 开关', () => {
    const w = setup();
    w.rubrics[0].dimensions[0].allow_na = false;
    const a = annotation('a');
    a.ratings.scene.score = 'NA';
    expect(() => validateAnnotation(w, a)).toThrow('不允许');
  });
  it('保存草稿不要求全部维度评分', () => {
    const w = setup(),
      a = annotation('a');
    a.status = 'draft';
    a.ratings = ratings([null, null, null, null, null]);
    expect(validateAnnotation(w, a).status).toBe('draft');
  });
  it('已提交评分不可覆盖，禁止同人员双重提交', () => {
    const w = setup();
    w.annotations = [annotation('a')];
    expect(() => validateAnnotation(w, annotation('a'))).toThrow('已提交');
    expect(() => validateAnnotation(w, annotation('other', 'a'))).toThrow('一份评分');
  });
  it('分歧阈值只影响优先级，不跳过裁定', () => {
    const w = setup();
    const a = annotation('a'),
      b = annotation('b');
    b.ratings.scene.score = 4;
    w.annotations = [a, b];
    const d = differences(w.annotations, w.rubrics[0], 2);
    expect(d[0].gap).toBe(1);
    expect(d[0].priority).toBe(false);
    expect(status(w, 'C1', '1.0.0')).toBe('Pending Review');
    expect(() => createGold(w, ['C1'], '1.0.0', 'v1', 'admin', now())).toThrow('裁定');
    expect(differences(w.annotations, w.rubrics[0], 1)[0].priority).toBe(true);
  });
  it('混合 N/A 也标为重点复核', () => {
    const a = annotation('a'),
      b = annotation('b');
    b.ratings.scene.score = 'NA';
    expect(differences([a, b], defaultRubric(), 2)[0].priority).toBe(true);
  });
  it('双人一致性排除 N/A', () => {
    const a = annotation('a'),
      b = annotation('b');
    b.ratings.scene.score = 'NA';
    b.ratings.preference.score = 5;
    const x = pairAgreement([a, b], defaultRubric());
    expect(x.n).toBe(4);
    expect(x.exact).toBe(0.75);
    expect(x.mae).toBe(0.25);
  });
  it('所有合法流程状态可区分', () => {
    const w = setup();
    expect(status(w, 'C1', '1.0.0')).toBe('Unassigned');
    w.annotations = [{ ...annotation('a'), status: 'draft' }];
    expect(status(w, 'C1', '1.0.0')).toBe('In Progress');
    w.annotations[0].status = 'submitted';
    expect(status(w, 'C1', '1.0.0')).toBe('Submitted');
    w.annotations.push(annotation('b'));
    expect(status(w, 'C1', '1.0.0')).toBe('Pending Review');
  });
  it('确定性规则不凭歌曲名称判断无法播放', () => {
    const w = setup();
    const result = deterministicIssues(w.cases[0], w.rubrics[0]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('数量');
    expect(result.join()).not.toContain('无法播放');
  });
});
describe('裁定与不可变金标', () => {
  it('必须有足够独立提交与规则核验结论', () => {
    const w = ready();
    w.annotations.pop();
    expect(() => validateAdjudication(w, w.adjudications[0])).toThrow('不足');
    const x = ready();
    x.adjudications[0].veto_reason = '';
    expect(() => createGold(x, ['C1'], '1.0.0', 'v1', 'admin', now())).toThrow('核验');
  });
  it('评估员不能裁定，复核人不能发布', () => {
    const w = ready();
    expect(() => validateAdjudication(w, { ...w.adjudications[0], reviewer_id: 'a' })).toThrow(
      '管理员',
    );
    expect(() => createGold(w, ['C1'], '1.0.0', 'v1', 'r', now())).toThrow('管理员');
  });
  it('必须逐维度给出最终参考分和理由', () => {
    const w = ready();
    w.adjudications[0].ratings.scene.reason = '';
    expect(() => createGold(w, ['C1'], '1.0.0', 'v1', 'admin', now())).toThrow('理由');
  });
  it('发布保存独立快照，后续原始修改不改变旧版本', () => {
    const w = ready(),
      g = createGold(w, ['C1'], '1.0.0', 'v1', 'admin', now());
    w.goldVersions.push(g);
    expect(status(w, 'C1', '1.0.0')).toBe('Gold Confirmed');
    w.cases[0].info = '后续变更';
    w.adjudications[0].ratings.scene.score = 5;
    expect(g.records[0].case.info).toBe('');
    expect(g.records[0].ratings.scene.score).toBe(3);
    expect(() => createGold(w, ['C1'], '1.0.0', 'v1', 'admin', now())).toThrow('重复');
  });
  it('新增评估员提交使旧裁定失效，旧金标不变', () => {
    const w = ready();
    w.goldVersions.push(createGold(w, ['C1'], '1.0.0', 'v1', 'admin', now()));
    w.annotations.push(annotation('c', 'admin'));
    expect(latestAdjudication(w, 'C1', '1.0.0')).toBeUndefined();
    expect(status(w, 'C1', '1.0.0')).toBe('Pending Review');
    expect(() => createGold(w, ['C1'], '1.0.0', 'v2', 'admin', now())).toThrow('裁定');
    expect(w.goldVersions[0].records[0].annotations).toHaveLength(2);
  });
  it('备份校验拒绝伪造综合分', () => {
    const w = ready();
    w.goldVersions.push(createGold(w, ['C1'], '1.0.0', 'v1', 'admin', now()));
    expect(validateWorkspace(w).goldVersions).toHaveLength(1);
    w.goldVersions[0].records[0].weighted_score = 1;
    expect(() => validateWorkspace(w)).toThrow('综合分');
  });
  it('历史版本不受后续独立标注数量配置改变影响', () => {
    const w = ready();
    w.goldVersions.push(createGold(w, ['C1'], '1.0.0', 'v1', 'admin', now()));
    w.settings.required_annotations = 3;
    expect(validateWorkspace(w).goldVersions[0].records).toHaveLength(1);
    expect(() => createGold(w, ['C1'], '1.0.0', 'v2', 'admin', now())).toThrow('裁定');
  });
  it('权重、标准数量和维度 ID 均校验', () => {
    const r = defaultRubric();
    r.dimensions[0].weight = 20;
    expect(() => rubricSchema.parse(r)).toThrow('100%');
    r.dimensions[0].weight = 30;
    r.dimensions[1].id = 'scene';
    expect(() => rubricSchema.parse(r)).toThrow('不得重复');
  });
});
describe('JSON / CSV 与独立标注交换', () => {
  it('JSON / CSV 往返嵌套歌曲与中文字段', () => {
    const c = setup().cases[0];
    c.songs = [
      {
        song_id: 's1',
        song_name: '测试曲目，甲',
        singer: '测试人员',
        album: '',
        source: '',
        genre: '',
        mood: '',
        duration: '',
        music_url: '',
      },
    ];
    const csv = toCSV([c]),
      rows = parseRows(csv, 'cases.csv');
    const mapping = Object.fromEntries(Object.keys(c).map((k) => [k, k]));
    expect(importCases(rows, mapping, 'default')[0]).toEqual(c);
    expect(parseRows(JSON.stringify([c]), 'cases.json')[0].case_id).toBe('C1');
  });
  it('导入支持字段映射，不补造缺失偏好', () => {
    const rows = [{ 编号: 'new', 场景: '通勤', 歌曲: '[]' }];
    expect(
      importCases(rows, { case_id: '编号', scene: '场景', songs: '歌曲' }, 'default')[0]
        .user_preferences,
    ).toBe('');
  });
  it('拒绝重复案例、非法文件与必填缺失', () => {
    const c = setup().cases[0],
      map = { case_id: 'case_id', scene: 'scene', songs: 'songs' };
    expect(() => importCases([c, c], map, 'default')).toThrow('重复');
    expect(() => importCases([{ case_id: 'x' }], map, 'default')).toThrow('第 1 行');
    expect(() => parseRows('bad', 'x.json')).toThrow();
    expect(() => importCases([{ case_id: 'x', scene: 'a', songs: 'bad' }], map, 'default')).toThrow(
      'JSON 数组',
    );
  });
  it('拒绝危险音乐链接并避免 CSV 公式执行', () => {
    expect(() =>
      caseSchema.parse({
        case_id: 'x',
        scene: 'a',
        songs: [{ song_name: 'x', music_url: 'javascript:alert(1)' }],
      }),
    ).toThrow();
    expect(toCSV([{ name: '=1+1' }])).toContain("'=1+1");
  });
  it('合并检查案例与标准一致性，完全重复幂等', () => {
    const source = setup();
    source.annotations = [annotation('a')];
    const bundle = exportAnnotations(source, 'a'),
      target = setup();
    expect(mergeAnnotations(target, bundle)).toBe(1);
    expect(mergeAnnotations(target, bundle)).toBe(0);
    const conflict = setup();
    conflict.cases[0].scene = '不同场景';
    expect(() => mergeAnnotations(conflict, bundle)).toThrow('不一致');
    const rubricConflict = setup();
    rubricConflict.rubrics[0].name = '已修改';
    expect(() => mergeAnnotations(rubricConflict, bundle)).toThrow('不一致');
  });
  it('不同评估员文件保持独立归属，冲突同人记录被拒绝', () => {
    const source = setup();
    source.annotations = [annotation('b')];
    const target = setup();
    target.annotations = [annotation('a')];
    mergeAnnotations(target, exportAnnotations(source, 'b'));
    expect(target.annotations.map((a) => a.reviewer_id)).toEqual(['a', 'b']);
    source.annotations = [annotation('new', 'a')];
    expect(() => mergeAnnotations(target, exportAnnotations(source, 'a'))).toThrow('一份评分');
  });
  it('Judge CSV 数值解析及非法分数被拒绝', () => {
    const j = {
      case_id: 'C1',
      judge_model: 'J',
      judge_version: 'v1',
      rubric_version: '1.0.0',
      dimension_id: 'scene',
      judge_score: 4,
      judge_reason: '已核验',
      evaluation_timestamp: now(),
    };
    expect(parseJudges(toCSV([j]), 'j.csv')[0]).toEqual(j);
    expect(() => parseJudges(JSON.stringify([{ ...j, judge_score: 0 }]), 'j.json')).toThrow();
  });
});
describe('校准统计', () => {
  it('准确计算 Exact、Within-1、MAE 与 QWK', () => {
    const pairs = [1, 2, 3, 4, 5].map((h, i) => ({
      human: h,
      judge: [1, 3, 2, 4, 5][i],
      case_id: String(i),
      dimension_id: 'scene',
      human_reason: '',
      judge_reason: '',
      scene: '通勤',
    }));
    const m = calculateMetrics(pairs);
    expect(m.exact).toBe(0.6);
    expect(m.within1).toBe(1);
    expect(m.mae).toBe(0.4);
    expect(m.kappa).toBeCloseTo(0.9);
    expect(m.matrix[1][2]).toBe(1);
    expect(m.matrix.flat().reduce((a, b) => a + b, 0)).toBe(5);
  });
  it('空样本、单样本、退化分布不返回虚假 Kappa', () => {
    expect(calculateMetrics([]).exact).toBeNull();
    const p = {
      human: 5,
      judge: 5,
      case_id: 'x',
      dimension_id: 'scene',
      human_reason: '',
      judge_reason: '',
      scene: '通勤',
    };
    expect(calculateMetrics([p]).kappa).toBeNull();
    expect(calculateMetrics([p, p]).kappa).toBeNull();
  });
  it('严格匹配案例、Rubric 和维度，排除参考 N/A', () => {
    const w = ready();
    w.adjudications[0].ratings.preference.score = 'NA';
    const g = createGold(w, ['C1'], '1.0.0', 'v1', 'admin', now());
    const base = {
      case_id: 'C1',
      judge_model: 'J',
      judge_version: 'v1',
      rubric_version: '1.0.0',
      dimension_id: 'scene',
      judge_score: 4,
      judge_reason: '',
      evaluation_timestamp: now(),
    };
    const m = calibrate(g, [
      base,
      { ...base, dimension_id: 'preference' },
      { ...base, rubric_version: '2' },
      { ...base, case_id: 'other' },
    ]);
    expect(m.n).toBe(1);
    expect(m.unmatched).toBe(3);
    expect(m.mae).toBe(1);
    expect(calibrate(g, [base], { scene: '不存在' }).n).toBe(0);
    expect(calibrate(g, [base], { model: 'other' }).n).toBe(0);
  });
});
describe('IndexedDB 事务与刷新', () => {
  it('关闭重开后仍保留数据与审计', async () => {
    const name = 'test-' + crypto.randomUUID(),
      db = new LocalRepository(name);
    await db.read();
    await db.mutate('admin', '创建案例', 'C1', (w) => {
      w.cases.push(setup().cases[0]);
    });
    db.close();
    const reopened = new LocalRepository(name),
      w = await reopened.read();
    expect(w.cases).toHaveLength(1);
    expect(w.audit[0].actor).toBe('admin');
    expect(w.revision).toBe(1);
    await reopened.delete();
  });
  it('异常时整批回滚且并发更新不丢失', async () => {
    const db = new LocalRepository('tx-' + crypto.randomUUID());
    await db.read();
    await expect(
      db.mutate('a', '导入', 'x', (w) => {
        w.cases.push(setup().cases[0]);
        throw new Error('冲突');
      }),
    ).rejects.toThrow('冲突');
    expect((await db.read()).cases).toHaveLength(0);
    await Promise.all([
      db.mutate('a', '设置', '1', (w) => {
        w.settings.threshold = 3;
      }),
      db.mutate('b', '设置', '2', (w) => {
        w.settings.required_annotations = 3;
      }),
    ]);
    const w = await db.read();
    expect(w.settings).toEqual({ threshold: 3, required_annotations: 3 });
    expect(w.audit).toHaveLength(2);
    await db.delete();
  });
  it('对象规范化忽略键顺序但保留值差异', () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: '1' }));
  });
});
