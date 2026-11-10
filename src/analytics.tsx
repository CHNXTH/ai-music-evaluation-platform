import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  Activity,
  ArrowUpRight,
  ArrowRight,
  Database,
  CheckCircle2,
  ClipboardList,
  GitCompareArrows,
  ShieldCheck,
  Target,
  Printer,
} from 'lucide-react';
import { useApp } from './context';
import {
  calculateMetrics,
  calibrate,
  judgeKey,
  latestAdjudication,
  pairAgreement,
  status,
  submitted,
  weightedScore,
  type CalibrationReport,
} from './domain';
import { parseJudges } from './files';
import {
  Badge,
  Button,
  Card,
  Empty,
  Exports,
  FileButton,
  date,
  number,
  percent,
} from './components/ui';
import type { Workspace, Rubric } from './model';
function average(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function summary(w: Workspace, r: Rubric, scene = '') {
  const cases = w.cases.filter((c) => !scene || c.scene === scene),
    ids = new Set(cases.map((c) => c.case_id)),
    anns = w.annotations.filter(
      (a) => a.status === 'submitted' && a.rubric_version === r.version && ids.has(a.case_id),
    );
  const scores = anns
    .map((a) => weightedScore(a.ratings, r))
    .filter((v): v is number => v !== null);
  const dims = r.dimensions.map((d) => ({
    name: d.name,
    score: average(
      anns.map((a) => a.ratings[d.id]?.score).filter((v): v is number => typeof v === 'number'),
    ),
  }));
  return {
    cases,
    anns,
    scores,
    dims,
    mean: average(scores),
    distribution: [1, 2, 3, 4, 5].map((score) => ({
      name: String(score) + ' 分',
      count: scores.filter((v) => Math.min(5, Math.round(v)) === score).length,
    })),
    scenes: [...new Set(cases.map((c) => c.scene))].map((s) => ({
      name: s,
      score: average(
        anns
          .filter((a) => cases.find((c) => c.case_id === a.case_id)?.scene === s)
          .map((a) => weightedScore(a.ratings, r))
          .filter((v): v is number => v !== null),
      ),
    })),
  };
}
export function ScoreChart({
  data,
  dataKey = 'score',
  max = 5,
}: {
  data: unknown[];
  dataKey?: string;
  max?: number;
}) {
  return (
    <div className="chart" role="img" aria-label="评分统计柱状图">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 14, right: 25, top: 12, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, max]} tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip />
          <Bar
            isAnimationActive={false}
            dataKey={dataKey}
            name={dataKey === 'score' ? '平均分' : '标注数量'}
            fill="var(--blue)"
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
function Metric({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string | number;
  icon?: typeof Activity;
  detail?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        {Icon && <Icon size={17} />}
      </div>
      <strong>{value}</strong>
      <small>{detail ?? '基于当前工作区实际记录'}</small>
    </div>
  );
}
export function OverviewPage() {
  const { w, rubric, navigate } = useApp();
  const s = summary(w, rubric);
  const complete = s.cases.filter(
      (c) => submitted(w, c.case_id, rubric.version).length >= w.settings.required_annotations,
    ).length,
    review = s.cases.filter(
      (c) =>
        submitted(w, c.case_id, rubric.version).length >= w.settings.required_annotations &&
        !latestAdjudication(w, c.case_id, rubric.version),
    );
  const gold = w.goldVersions.at(-1),
    model = w.judges[0];
  const cal = calibrate(gold, w.judges, {
    model: model?.judge_model,
    version: model?.judge_version,
  });
  const recent = [...s.anns].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  return (
    <>
      <div className="overview-intro">
        <div>
          <Badge tone="blue">
            <Activity size={12} />
            Evaluation workspace
          </Badge>
          <h2>从独立判断，到可信金标。</h2>
          <p>统一人工评估流程，持续校准音乐推荐质量。</p>
        </div>
        <Button variant="primary" onClick={() => navigate('human')}>
          进入人工评估
          <ArrowUpRight size={16} />
        </Button>
      </div>
      <div className="pipeline">
        {[
          ['评测集', String(s.cases.length), 'dataset'],
          ['人工标注', String(s.anns.length), 'human'],
          ['分歧复核', String(review.length), 'review'],
          ['金标版本', String(w.goldVersions.length), 'gold'],
          ['评估器校准', String(w.judges.length), 'judge'],
          ['评测报告', '查看分析', 'reports'],
        ].map(([name, v, page], i) => (
          <div key={page}>
            <button onClick={() => navigate(page)}>
              <span>
                <b>{String(i + 1).padStart(2, '0')}</b>
                {name}
              </span>
              <strong>{v}</strong>
            </button>
            {i < 5 && <ArrowRight size={13} />}
          </div>
        ))}
      </div>
      <div className="metrics-grid">
        <Metric label="Dataset Case 总数" value={s.cases.length} icon={Database} />
        <Metric
          label="已完成标注 Case"
          value={complete}
          icon={CheckCircle2}
          detail={`至少 ${w.settings.required_annotations} 名独立评估员提交`}
        />
        <Metric label="待评估 Case" value={s.cases.length - complete} icon={ClipboardList} />
        <Metric label="待复核案例" value={review.length} icon={GitCompareArrows} />
        <Metric
          label="Gold Set Case"
          value={gold?.records.length ?? 0}
          icon={ShieldCheck}
          detail={gold ? '最新版本 ' + gold.version : '尚未发布金标版本'}
        />
        <Metric
          label="Judge–Human Agreement"
          value={percent(cal.exact)}
          icon={Target}
          detail={
            model
              ? `${model.judge_model} / ${model.judge_version} · ${cal.n} 个配对`
              : '尚无有效校准配对'
          }
        />
        <Metric
          label="平均人工综合评分"
          value={number(s.mean)}
          icon={Activity}
          detail={`Rubric ${rubric.version} · ${s.scores.length} 份有效标注`}
        />
      </div>
      <div className="analytics-grid">
        <Card
          title="各评估维度表现"
          description={`Rubric ${rubric.version} · 有效人工评分均值`}
          action={<Badge>1–5 分</Badge>}
        >
          {s.scores.length ? (
            <ScoreChart data={s.dims} />
          ) : (
            <Empty title="暂无维度评分" description="提交人工评分后自动生成统计。" />
          )}
        </Card>
        <Card title="综合评分分布" description="每份已提交标注的综合分，按最近整数分组">
          {s.scores.length ? (
            <ScoreChart
              data={s.distribution}
              dataKey="count"
              max={Math.max(1, ...s.distribution.map((d) => d.count))}
            />
          ) : (
            <Empty title="暂无评分分布" description="综合分正确排除 N/A 并重新归一化权重。" />
          )}
        </Card>
        <Card title="评估任务完成情况" description="按当前 Rubric 版本统计">
          <div className="progress-list">
            {Object.entries({
              Unassigned: '未分配',
              'In Progress': '评估中',
              Submitted: '已提交，等待补充标注',
              'Pending Review': '待人工复核',
              Adjudicated: '已裁定',
              'Gold Confirmed': '已入金标',
            }).map(([key, name]) => {
              const n = w.cases.filter((c) => status(w, c.case_id, rubric.version) === key).length;
              return (
                <div key={key}>
                  <span>{name}</span>
                  <div className="progress-track">
                    <div
                      style={{ width: (s.cases.length ? (n / s.cases.length) * 100 : 0) + '%' }}
                    />
                  </div>
                  <b>{n}</b>
                </div>
              );
            })}
          </div>
        </Card>
        <Card
          title="待复核案例"
          description="优先处理已完成独立标注的案例"
          action={
            <Button variant="ghost" onClick={() => navigate('review')}>
              查看全部 →
            </Button>
          }
        >
          {review.length ? (
            <div className="activity-list">
              {review.slice(0, 5).map((c) => (
                <button key={c.case_id} onClick={() => navigate('review')}>
                  <span>
                    <strong className="mono">{c.case_id}</strong>
                    <small>{c.scene}</small>
                  </span>
                  <Badge tone="amber">待复核</Badge>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="暂无待复核案例"
              description="完成必要数量的独立标注后，案例将进入复核队列。"
            />
          )}
        </Card>
        <Card
          title="最近标注记录"
          description="仅展示提交归属与时间，独立评分工作台隐藏其他人员评分"
        >
          {recent.length ? (
            <div className="activity-list">
              {recent.map((a) => (
                <div key={a.id}>
                  <span>
                    <strong className="mono">{a.case_id}</strong>
                    <small>
                      {w.reviewers.find((p) => p.id === a.reviewer_id)?.name} · {date(a.updated_at)}
                    </small>
                  </span>
                  <Badge tone="green">已提交</Badge>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="暂无已提交标注" description="从人工评估工作台开始第一份评分。" />
          )}
        </Card>
        <Card
          title="Judge 校准概览"
          description={
            model
              ? `${model.judge_model} / ${model.judge_version} · 最新金标版本`
              : '导入离线 Judge 评分后计算一致性'
          }
        >
          {cal.n ? (
            <div className="calibration-summary">
              <div>
                <span>Exact Agreement</span>
                <strong>{percent(cal.exact)}</strong>
              </div>
              <div>
                <span>Within-1</span>
                <strong>{percent(cal.within1)}</strong>
              </div>
              <div>
                <span>MAE</span>
                <strong>{number(cal.mae)}</strong>
              </div>
              <div>
                <span>QWK</span>
                <strong>{number(cal.kappa)}</strong>
              </div>
            </div>
          ) : (
            <Empty
              title="暂无有效校准配对"
              description="先发布人工金标，再导入相同案例和 Rubric 版本的 Judge 评分。"
            />
          )}
          <Button variant="ghost" onClick={() => navigate('judge')}>
            前往评估器校准 →
          </Button>
        </Card>
      </div>
    </>
  );
}
export function Matrix({ report: r }: { report: CalibrationReport }) {
  const max = Math.max(1, ...r.matrix.flat());
  return (
    <div className="matrix">
      <p className="muted">行：人工参考分 · 列：Judge 评分</p>
      <table>
        <thead>
          <tr>
            <th>人工 / Judge</th>
            {[1, 2, 3, 4, 5].map((n) => (
              <th key={n}>{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.matrix.map((row, i) => (
            <tr key={i}>
              <th>{i + 1}</th>
              {row.map((n, j) => (
                <td
                  key={j}
                  style={{
                    background: n ? `rgba(37,99,235,${0.04 + (n / max) * 0.36})` : 'var(--surface)',
                    color: 'var(--text)',
                  }}
                >
                  {n}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function JudgePage() {
  const { w, rubric, mutate, notify, busy } = useApp();
  const [gv, setGv] = useState(''),
    [model, setModel] = useState(''),
    [ver, setVer] = useState(''),
    [scene, setScene] = useState(''),
    [dimension, setDimension] = useState('');
  const gold = w.goldVersions.find((g) => g.version === gv) ?? w.goldVersions.at(-1),
    models = [...new Set(w.judges.map((j) => j.judge_model))],
    m = models.includes(model) ? model : (models[0] ?? ''),
    versions = [
      ...new Set(w.judges.filter((j) => j.judge_model === m).map((j) => j.judge_version)),
    ],
    v = versions.includes(ver) ? ver : (versions[0] ?? '');
  const report = calibrate(gold, w.judges, { model: m, version: v, scene, dimension });
  const dims = [
    ...new Map(
      gold?.records.flatMap((g) => g.rubric.dimensions.map((d) => [d.id, d.name] as const)) ??
        rubric.dimensions.map((d) => [d.id, d.name] as const),
    ),
  ];
  const byVersion = versions.map((version) => {
    const r = calibrate(gold, w.judges, { model: m, version, scene, dimension });
    return { name: version, exact: r.exact === null ? null : r.exact * 100, mae: r.mae, n: r.n };
  });
  async function load(f: File) {
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error('文件大小不能超过 20 MB');
      const rows = parseJudges(await f.text(), f.name);
      await mutate('导入 Judge 评分', f.name, (w) => {
        const keys = new Set(w.judges.map(judgeKey));
        for (const j of rows) {
          const key = judgeKey(j);
          if (keys.has(key))
            throw new Error(`Judge 配对重复：${j.case_id} / ${j.dimension_id}。请使用新版本编号`);
          keys.add(key);
        }
        w.judges.push(...rows);
      });
    } catch (e) {
      notify(String(e), true);
    }
  }
  return (
    <>
      <div className="page-actions">
        <p className="muted">按 Case ID + Rubric 版本 + 维度 ID 匹配金标</p>
        <div className="actions">
          <Exports
            name="judge-calibration"
            data={{
              gold_version: gold?.version,
              judge_model: m,
              judge_version: v,
              filters: { scene, dimension },
              ...report,
            }}
            csvData={report.pairs}
          />
          <FileButton label="导入 Judge 评分" busy={busy} onFile={load} />
        </div>
      </div>
      <div className="filter-bar">
        <select
          aria-label="校准金标版本"
          value={gold?.version ?? ''}
          onChange={(e) => setGv(e.target.value)}
        >
          {!gold && <option value="">暂无金标版本</option>}
          {w.goldVersions.map((g) => (
            <option key={g.version} value={g.version}>
              金标 {g.version}
            </option>
          ))}
        </select>
        <select
          aria-label="Judge 模型"
          value={m}
          onChange={(e) => {
            setModel(e.target.value);
            setVer('');
          }}
        >
          {!m && <option value="">暂无 Judge 模型</option>}
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select aria-label="Judge 版本" value={v} onChange={(e) => setVer(e.target.value)}>
          {!v && <option value="">暂无版本</option>}
          {versions.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select aria-label="校准场景" value={scene} onChange={(e) => setScene(e.target.value)}>
          <option value="">全部场景</option>
          {[...new Set(gold?.records.map((r) => r.case.scene))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="校准维度"
          value={dimension}
          onChange={(e) => setDimension(e.target.value)}
        >
          <option value="">全部维度</option>
          {dims.map(([id, name]) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <CalibrationMetrics report={report} />
      <div className="notice">
        有效配对 {report.n} 条 · 未匹配或参考分为 N/A：{report.unmatched} 条。{report.kappa_reason}
        。所有比例按维度配对数计算，不将未匹配数据计为 0 分。
      </div>
      {!report.n && (
        <Card>
          <Empty
            title="暂无有效配对评分"
            description="请先发布人工金标，再导入 1–5 整数评分。导入字段及文件规范见系统设置中的使用说明。"
          />
        </Card>
      )}
      <div className="analytics-grid">
        <Card title="分维度一致性" description="同一金标、模型、版本与场景下的评分表现">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>维度</th>
                  <th>配对</th>
                  <th>一致率</th>
                  <th>MAE</th>
                </tr>
              </thead>
              <tbody>
                {dims
                  .filter(([id]) => !dimension || id === dimension)
                  .map(([id, name]) => {
                    const r = calculateMetrics(report.pairs.filter((p) => p.dimension_id === id));
                    return (
                      <tr key={id}>
                        <td>{name}</td>
                        <td>{r.n}</td>
                        <td>{percent(r.exact)}</td>
                        <td>{number(r.mae)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="评分混淆矩阵" description="展示有效人工参考分与 Judge 评分的计数">
          <Matrix report={report} />
        </Card>
        <Card title="Judge 版本对比" description="各版本独立配对，样本量不同需谨慎比较">
          {byVersion.length ? (
            <>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={byVersion}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="exact"
                      name="完全一致率 %"
                      stroke="var(--blue)"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>版本</th>
                      <th>配对数</th>
                      <th>MAE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byVersion.map((x) => (
                      <tr key={x.name}>
                        <td>{x.name}</td>
                        <td>{x.n}</td>
                        <td>{number(x.mae)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Empty
              title="暂无 Judge 版本"
              description="导入不同 judge_version 的评分文件进行比较。"
            />
          )}
        </Card>
        <Card title="分数分布" description="已筛选的有效配对评分分布">
          {report.n ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>维度 / 分数</th>
                    <th>1</th>
                    <th>2</th>
                    <th>3</th>
                    <th>4</th>
                    <th>5</th>
                  </tr>
                </thead>
                <tbody>
                  {dims
                    .filter(([id]) => !dimension || id === dimension)
                    .map(([id, name]) => (
                      <tr key={id}>
                        <td>{name}</td>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <td key={n}>
                            {
                              report.pairs.filter((p) => p.dimension_id === id && p.human === n)
                                .length
                            }{' '}
                            /{' '}
                            {
                              report.pairs.filter((p) => p.dimension_id === id && p.judge === n)
                                .length
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="muted padded">每格为人工 / Judge 计数。</p>
            </div>
          ) : (
            <Empty title="暂无评分分布" />
          )}
        </Card>
      </div>
      <Card title="典型评分分歧" description="按绝对误差从高到低排列，可查看理由差异。">
        <PairTable report={report} dims={dims} />
      </Card>
      <Card title="模型对比" description="同一金标版本与场景，分别统计每个模型及版本的实际配对。">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>模型 / 版本</th>
                <th>配对数</th>
                <th>Exact</th>
                <th>Within-1</th>
                <th>MAE</th>
                <th>QWK</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...new Set(w.judges.map((j) => JSON.stringify([j.judge_model, j.judge_version]))),
              ].map((key) => {
                const [model, version] = JSON.parse(key) as string[],
                  r = calibrate(gold, w.judges, { model, version, scene, dimension });
                return (
                  <tr key={key}>
                    <td>
                      {model} / {version}
                    </td>
                    <td>{r.n}</td>
                    <td>{percent(r.exact)}</td>
                    <td>{percent(r.within1)}</td>
                    <td>{number(r.mae)}</td>
                    <td>{number(r.kappa)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
export function CalibrationMetrics({ report: r }: { report: CalibrationReport }) {
  return (
    <div className="metrics-grid four">
      <Metric label="Exact Agreement" value={percent(r.exact)} detail={`${r.n} 个有效维度配对`} />
      <Metric label="Within-1 Agreement" value={percent(r.within1)} detail="绝对分差 ≤ 1 的比例" />
      <Metric label="Mean Absolute Error" value={number(r.mae)} detail="平均绝对评分误差" />
      <Metric
        label="Quadratic Weighted Kappa"
        value={number(r.kappa, 3)}
        detail={r.kappa === null ? r.kappa_reason : '1–5 级有序评分加权一致性'}
      />
    </div>
  );
}
export function PairTable({
  report,
  dims,
}: {
  report: CalibrationReport;
  dims: readonly (readonly [string, string])[];
}) {
  const pairs = report.pairs
    .filter((p) => p.human !== p.judge)
    .sort((a, b) => Math.abs(b.human - b.judge) - Math.abs(a.human - a.judge));
  return !pairs.length ? (
    <Empty
      title="暂无有效评分分歧"
      description={report.n ? '当前有效配对评分完全一致。' : '尚无有效校准配对。'}
    />
  ) : (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Case ID</th>
            <th>维度</th>
            <th>人工</th>
            <th>Judge</th>
            <th>偏差</th>
            <th>评分理由对照</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p) => (
            <tr key={p.case_id + p.dimension_id}>
              <td className="mono">{p.case_id}</td>
              <td>{dims.find((d) => d[0] === p.dimension_id)?.[1] ?? p.dimension_id}</td>
              <td>{p.human}</td>
              <td>{p.judge}</td>
              <td>
                <Badge tone={p.judge > p.human ? 'amber' : 'blue'}>
                  {p.judge > p.human ? '高估' : '低估'} {Math.abs(p.judge - p.human)}
                </Badge>
              </td>
              <td>
                <details>
                  <summary>查看理由</summary>
                  <p>人工：{p.human_reason}</p>
                  <p>Judge：{p.judge_reason || '未提供理由'}</p>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ReportsPage() {
  const { w, rubric } = useApp();
  const [scene, setScene] = useState(''),
    [model, setModel] = useState(''),
    [goldVersion, setGoldVersion] = useState(''),
    [conclusion, setConclusion] = useState(localStorage.getItem('music-report-conclusion') ?? '');
  const s = summary(w, rubric, scene),
    gold = w.goldVersions.find((g) => g.version === goldVersion) ?? w.goldVersions.at(-1),
    keys = [...new Set(w.judges.map((j) => JSON.stringify([j.judge_model, j.judge_version])))],
    selected = keys.includes(model) ? model : keys[0];
  const [m, v] = selected ? (JSON.parse(selected) as string[]) : [];
  const cal = calibrate(gold, w.judges, { model: m, version: v, scene });
  const agreements = s.cases.map((c) =>
    pairAgreement(submitted(w, c.case_id, rubric.version), rubric),
  );
  const n = agreements.reduce((n, a) => n + a.n, 0),
    exact = n ? agreements.reduce((n, a) => n + (a.exact ?? 0) * a.n, 0) / n : null,
    mae = n ? agreements.reduce((n, a) => n + (a.mae ?? 0) * a.n, 0) / n : null;
  const bad = new Map<string, number>();
  for (const a of s.anns) for (const id of a.veto_flags) bad.set(id, (bad.get(id) ?? 0) + 1);
  const completed = s.cases.filter(
    (c) => submitted(w, c.case_id, rubric.version).length >= w.settings.required_annotations,
  ).length;
  const report = {
    generated_at: new Date().toISOString(),
    rubric_version: rubric.version,
    scene: scene || '全部场景',
    coverage: { cases: s.cases.length, completed, annotations: s.anns.length },
    human_mean: s.mean,
    dimensions: s.dims,
    distribution: s.distribution,
    scenes: s.scenes,
    human_agreement: { pairs: n, exact, mae },
    gold_version: gold?.version ?? null,
    gold_cases: gold?.records.filter((g) => !scene || g.case.scene === scene).length ?? 0,
    judge_model: m,
    judge_version: v,
    calibration: cal,
    bad_case_categories: [...bad].map(([id, count]) => ({
      rule: rubric.veto_rules.find((r) => r.id === id)?.label ?? id,
      count,
    })),
    conclusion,
  };
  return (
    <>
      <div className="page-actions no-print">
        <div className="actions">
          <select aria-label="报告场景" value={scene} onChange={(e) => setScene(e.target.value)}>
            <option value="">全部场景</option>
            {[...new Set(w.cases.map((c) => c.scene))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="报告金标版本"
            value={gold?.version ?? ''}
            onChange={(e) => setGoldVersion(e.target.value)}
          >
            {!gold && <option value="">暂无金标版本</option>}
            {w.goldVersions.map((g) => (
              <option key={g.version} value={g.version}>
                金标 {g.version}
              </option>
            ))}
          </select>
          <select
            aria-label="报告 Judge 模型版本"
            value={selected ?? ''}
            onChange={(e) => setModel(e.target.value)}
          >
            {!selected && <option value="">暂无 Judge 评分</option>}
            {keys.map((k) => (
              <option key={k} value={k}>
                {(JSON.parse(k) as string[]).join(' / ')}
              </option>
            ))}
          </select>
        </div>
        <div className="actions">
          <Exports
            name="evaluation-report"
            data={report}
            csvData={[{ ...report, calibration: cal }]}
          />
          <Button onClick={() => window.print()}>
            <Printer size={15} />
            打印 / 保存 PDF
          </Button>
        </div>
      </div>
      <div className="report-header">
        <Badge tone="blue">Evaluation Report</Badge>
        <h2>AI 音乐推荐质量评测报告</h2>
        <p>
          {new Date().toLocaleDateString('zh-CN')} · Rubric {rubric.version} · {scene || '全部场景'}{' '}
          · 金标 {gold?.version ?? '未发布'}
        </p>
      </div>
      <div className="metrics-grid four">
        <Metric label="Case 覆盖数量" value={s.cases.length} />
        <Metric label="完成人工标注" value={completed} />
        <Metric label="人工综合均分" value={number(s.mean)} />
        <Metric label="Gold Set 数量" value={report.gold_cases} />
      </div>
      <CalibrationMetrics report={cal} />
      <div className="analytics-grid">
        <Card title="五个评估维度表现" description="按当前选择的 Rubric 维度计算">
          {s.anns.length ? <ScoreChart data={s.dims} /> : <Empty title="暂无人工评分" />}
        </Card>
        <Card title="不同场景表现">
          {s.anns.length ? <ScoreChart data={s.scenes} /> : <Empty title="暂无场景评分" />}
        </Card>
        <Card title="评分分布" description="综合分按最近整数分组">
          {s.scores.length ? (
            <ScoreChart
              data={s.distribution}
              dataKey="count"
              max={Math.max(1, ...s.distribution.map((d) => d.count))}
            />
          ) : (
            <Empty title="暂无评分分布" />
          )}
        </Card>
        <Card title="评分人员一致性">
          <div className="calibration-summary">
            <div>
              <span>人工维度配对数</span>
              <strong>{n}</strong>
            </div>
            <div>
              <span>完全一致率</span>
              <strong>{percent(exact)}</strong>
            </div>
            <div>
              <span>平均绝对分差</span>
              <strong>{number(mae)}</strong>
            </div>
            <div>
              <span>标注数量</span>
              <strong>{s.anns.length}</strong>
            </div>
          </div>
          <p className="muted padded">
            仅比较同 Case、同 Rubric 的不同评估员已提交有效数值评分；N/A 不参与数值配对。
          </p>
        </Card>
        <Card
          title="主要 Bad Case 分类"
          description="按人工标注中已标记业务规则计数；同案例可由多名人员标记"
        >
          {bad.size ? (
            <div className="activity-list">
              {[...bad].map(([id, n]) => (
                <div key={id}>
                  <span>{rubric.veto_rules.find((r) => r.id === id)?.label ?? id}</span>
                  <Badge tone="amber">{n}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="暂无已标记业务问题" description="未标记不代表通过全部业务核验。" />
          )}
        </Card>
        <Card title="Judge 混淆矩阵">
          <Matrix report={cal} />
        </Card>
      </div>
      <Card title="典型评分分歧">
        <PairTable report={cal} dims={rubric.dimensions.map((d) => [d.id, d.name])} />
      </Card>
      <Card
        title="评测结论"
        description="统计事实与人工结论分别记录。结论仅保存在此浏览器，可随报告导出。"
      >
        <div className="report-facts">
          本次覆盖 {s.cases.length} 个案例，{completed} 个完成必要人工标注，共 {s.anns.length}{' '}
          份提交。
          {s.mean === null ? '尚无有效人工综合评分。' : `人工综合均分为 ${number(s.mean)}。`}
          {cal.n
            ? `Judge 有效配对 ${cal.n} 条，完全一致率 ${percent(cal.exact)}，MAE ${number(cal.mae)}。`
            : '尚无有效 Judge–Human 配对，无法形成校准结论。'}
        </div>
        <textarea
          aria-label="人工评测结论"
          className="no-print"
          rows={5}
          value={conclusion}
          placeholder="填写基于当前数据的评测结论、主要问题、证据边界与后续改进措施。"
          onChange={(e) => {
            setConclusion(e.target.value);
            localStorage.setItem('music-report-conclusion', e.target.value);
          }}
        />
        <p className="print-only">{conclusion || '未填写人工评测结论。'}</p>
      </Card>
    </>
  );
}
