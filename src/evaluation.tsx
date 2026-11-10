import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Send,
  ShieldCheck,
  Keyboard,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from './context';
import {
  now,
  uid,
  type Annotation,
  type EvaluationCase,
  type Rating,
  type Rubric,
  type Workspace,
} from './model';
import {
  deterministicIssues,
  differences,
  latestAdjudication,
  pairAgreement,
  status,
  statusLabel,
  submitted,
  validateAdjudication,
  validateAnnotation,
  weightedScore,
} from './domain';
import { exportAnnotations, flattenAnnotations, mergeAnnotations } from './files';
import { CaseContext } from './dataset';
import {
  Badge,
  Button,
  Card,
  Empty,
  Exports,
  Field,
  FileButton,
  Modal,
  date,
  number,
  percent,
} from './components/ui';
const blankRating = (): Rating => ({
  score: null,
  reason: '',
  evidence: { song_ids: [], note: '' },
});
const initialRatings = (r: Rubric) =>
  Object.fromEntries(r.dimensions.map((d) => [d.id, blankRating()]));
export function HumanPage() {
  const { w, actor, rubric, notify, mutate, busy, setHasUnsavedChanges } = useApp();
  const [caseId, setCaseId] = useState(''),
    [filter, setFilter] = useState('');
  const cases = w.cases.filter((c) => !filter || status(w, c.case_id, rubric.version) === filter);
  const c = cases.find((c) => c.case_id === caseId) ?? cases[0];
  const [dirty, setDirty] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [exportOpen, setExportOpen] = useState(false);
  const [ann, setAnn] = useState<Annotation | null>(null);
  const [focus, setFocus] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const key = c && actor ? `${c.case_id}\u0000${actor.id}\u0000${rubric.version}` : '';
  useEffect(() => {
    if (!c || !actor) {
      setAnn(null);
      return;
    }
    const saved = w.annotations.find(
      (a) =>
        a.case_id === c.case_id &&
        a.reviewer_id === actor.id &&
        a.rubric_version === rubric.version,
    );
    setAnn(
      saved
        ? structuredClone(saved)
        : {
            id: uid(),
            case_id: c.case_id,
            reviewer_id: actor.id,
            rubric_version: rubric.version,
            status: 'draft',
            ratings: initialRatings(rubric),
            veto_flags: [],
            veto_reason: '',
            updated_at: now(),
          },
    );
    setDirty(false);
    setFocus(0);
  }, [key, w.revision]);
  useEffect(() => {
    setHasUnsavedChanges(dirty);
    return () => setHasUnsavedChanges(false);
  }, [dirty, setHasUnsavedChanges]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  function switchCase(id: string) {
    if (dirty) setPending(id);
    else setCaseId(id);
  }
  async function save(final: boolean) {
    if (!ann) return;
    const next = {
      ...ann,
      status: final ? ('submitted' as const) : ('draft' as const),
      updated_at: now(),
    };
    const success = await mutate(final ? '提交人工评分' : '保存评分草稿', ann.case_id, (w) => {
      const a = validateAnnotation(w, next);
      const i = w.annotations.findIndex((x) => x.id === a.id);
      if (i < 0) w.annotations.push(a);
      else w.annotations[i] = a;
    });
    if (success) {
      setDirty(false);
      setConfirmSubmit(false);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea,select,[contenteditable]')) return;
      if (!e.altKey) return;
      if (/^[1-5]$/.test(e.key) && ann && ann.status !== 'submitted') {
        e.preventDefault();
        const d = rubric.dimensions[focus];
        setAnn({
          ...ann,
          ratings: { ...ann.ratings, [d.id]: { ...ann.ratings[d.id], score: Number(e.key) } },
        });
        setDirty(true);
      }
      if (['ArrowLeft', 'ArrowRight'].includes(e.key) && c) {
        e.preventDefault();
        const idx =
          cases.findIndex((x) => x.case_id === c.case_id) + (e.key === 'ArrowRight' ? 1 : -1);
        if (cases[idx]) switchCase(cases[idx].case_id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  async function load(f: File) {
    try {
      const value = JSON.parse(await f.text());
      await mutate('合并独立标注', f.name, (w) => {
        mergeAnnotations(w, value);
      });
    } catch (e) {
      notify(String(e), true);
    }
  }
  return (
    <>
      <div className="page-actions">
        <p className="muted">
          <ShieldCheck size={15} />
          独立评分 · 提交前不展示其他评估员评分
        </p>
        <div className="actions">
          <Button onClick={() => setExportOpen(true)}>导出我的标注</Button>
          <FileButton label="合并标注文件" accept=".json" onFile={load} />
        </div>
      </div>
      <div className="notice">
        <ShieldCheck size={17} />
        <span>
          本地人员身份用于记录归属，不提供账户认证。独立评估时，请各自在自己的浏览器工作区标注，通过文件交由管理员合并。
        </span>
      </div>
      {!actor ? (
        <Empty
          title="请先设置当前评估员"
          description="在系统设置中添加人员，并在右上角选择当前身份。"
        />
      ) : !c ? (
        <Empty title="没有待显示的评测案例" description="先在评测集中创建或导入推荐案例。" />
      ) : (
        <>
          <div className="evaluation-toolbar">
            <div className="actions">
              <select
                aria-label="选择评测案例"
                value={c.case_id}
                onChange={(e) => switchCase(e.target.value)}
              >
                {cases.map((c) => (
                  <option key={c.case_id}>{c.case_id}</option>
                ))}
              </select>
              <select
                aria-label="评估状态筛选"
                value={filter}
                disabled={dirty}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">全部状态</option>
                {Object.entries(statusLabel).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <Badge>{statusLabel[status(w, c.case_id, rubric.version)]}</Badge>
            </div>
            <div className="actions">
              <span className="muted">
                {cases.findIndex((x) => x.case_id === c.case_id) + 1} / {cases.length}
              </span>
              <Button
                aria-label="上一案例"
                disabled={cases.indexOf(c) === 0}
                onClick={() => switchCase(cases[cases.indexOf(c) - 1].case_id)}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                aria-label="下一案例"
                disabled={cases.indexOf(c) === cases.length - 1}
                onClick={() => switchCase(cases[cases.indexOf(c) + 1].case_id)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
          <div className="evaluation-grid">
            <Card title="案例上下文" description="依据已提供的信息评分，缺失信息请明确记录。">
              <CaseContext value={c} />
            </Card>
            <Card
              title="Rubric 评分"
              description={`版本 ${rubric.version} · ${actor.name} · 1–5 分`}
              action={
                <Badge tone={ann?.status === 'submitted' ? 'green' : 'blue'}>
                  {ann?.status === 'submitted' ? '已提交' : dirty ? '有未保存修改' : '草稿'}
                </Badge>
              }
            >
              {ann && (
                <>
                  <div className="rating-list">
                    <RatingsEditor
                      rubric={rubric}
                      value={ann.ratings}
                      caseValue={c}
                      disabled={ann.status === 'submitted'}
                      focus={focus}
                      onFocus={setFocus}
                      onChange={(ratings) => {
                        setAnn({ ...ann, ratings });
                        setDirty(true);
                      }}
                    />
                  </div>
                  <VetoPanel
                    c={c}
                    rubric={rubric}
                    flags={ann.veto_flags}
                    reason={ann.veto_reason}
                    disabled={ann.status === 'submitted'}
                    onChange={(flags, reason) => {
                      setAnn({ ...ann, veto_flags: flags, veto_reason: reason });
                      setDirty(true);
                    }}
                  />
                  <div className="score-footer">
                    <div>
                      <span className="muted">有效维度加权综合分</span>
                      <strong>
                        {number(weightedScore(ann.ratings, rubric))}
                        <small> / 5</small>
                      </strong>
                    </div>
                    <div className="actions">
                      <Button
                        disabled={busy || ann.status === 'submitted'}
                        onClick={() => save(false)}
                      >
                        <Save size={15} />
                        保存草稿
                      </Button>
                      <Button
                        variant="primary"
                        disabled={busy || ann.status === 'submitted'}
                        onClick={() => setConfirmSubmit(true)}
                      >
                        <Send size={15} />
                        提交评分
                      </Button>
                    </div>
                  </div>
                  <p className="keyboard-help">
                    <Keyboard size={14} />
                    Alt + 1–5 为当前维度评分 · Alt + ← / → 切换案例 · N/A 维度不计入分母
                  </p>
                  {ann.status === 'submitted' && (
                    <p className="submission-info">
                      提交时间：{date(ann.updated_at)} · 此评分已锁定。可导出文件由管理员合并复核。
                    </p>
                  )}
                </>
              )}
            </Card>
          </div>
        </>
      )}
      <Modal open={!!pending} onClose={() => setPending(null)} title="当前案例有未保存评分">
        <p>请先保存草稿，或明确放弃修改再切换。</p>
        <div className="modal-actions">
          <Button onClick={() => setPending(null)}>继续评分</Button>
          <Button
            variant="danger"
            onClick={() => {
              setDirty(false);
              setCaseId(pending!);
              setPending(null);
            }}
          >
            放弃修改并切换
          </Button>
        </div>
      </Modal>
      <Modal
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        title="提交独立人工评分"
        description="提交后评分锁定。请确认各维度理由、证据与业务否决项已核验。"
      >
        <p>
          案例：{c?.case_id} · 评估员：{actor?.name}
        </p>
        <div className="modal-actions">
          <Button onClick={() => setConfirmSubmit(false)}>返回核对</Button>
          <Button variant="primary" disabled={busy} onClick={() => save(true)}>
            确认提交
          </Button>
        </div>
      </Modal>
      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="导出独立标注"
        description="JSON 文件包含案例、Rubric 和当前评估员已提交标注，用于核验与合并。CSV 用于分析，不用于合并。"
      >
        <p>
          当前身份：{actor?.name ?? '未选择'} · 已提交{' '}
          {
            w.annotations.filter((a) => a.reviewer_id === actor?.id && a.status === 'submitted')
              .length
          }{' '}
          条
        </p>
        <Exports
          name={'annotations-' + (actor?.id ?? '')}
          data={exportAnnotations(w, actor?.id ?? '')}
          csvData={flattenAnnotations(
            w.annotations.filter((a) => a.reviewer_id === actor?.id && a.status === 'submitted'),
          )}
        />
      </Modal>
    </>
  );
}
export function RatingsEditor({
  rubric,
  value,
  onChange,
  caseValue,
  disabled = false,
  focus,
  onFocus,
}: {
  rubric: Rubric;
  value: Record<string, Rating>;
  onChange: (v: Record<string, Rating>) => void;
  caseValue: EvaluationCase;
  disabled?: boolean;
  focus?: number;
  onFocus?: (i: number) => void;
}) {
  return (
    <>
      {rubric.dimensions.map((d, i) => {
        const v = value[d.id] ?? blankRating();
        const change = (next: Partial<Rating>) => onChange({ ...value, [d.id]: { ...v, ...next } });
        return (
          <div
            key={d.id}
            className={'rating-dimension ' + (focus === i ? 'focused' : '')}
            onFocus={() => onFocus?.(i)}
          >
            <div className="dimension-heading">
              <div>
                <h3>
                  {d.name} <span>{d.weight}%</span>
                </h3>
                <p>{d.focus}</p>
              </div>
              <Badge>{d.importance}</Badge>
            </div>
            <details>
              <summary>查看 1–5 分标准与判定边界</summary>
              <ol className="standards">
                {d.standards.map((s, i) => (
                  <li key={i}>
                    <strong>{i + 1} 分</strong>
                    {s}
                  </li>
                ))}
              </ol>
              <p>N/A：{d.allow_na ? d.na_rule : '不允许'}</p>
              <p>正例：{d.positive}</p>
              <p>反例：{d.negative}</p>
              <p>边界：{d.boundary}</p>
            </details>
            <div className="score-buttons" role="group" aria-label={d.name + '评分'}>
              {[1, 2, 3, 4, 5, ...(d.allow_na ? ['NA'] : [])].map((s) => (
                <button
                  type="button"
                  key={s}
                  disabled={disabled}
                  aria-pressed={v.score === s}
                  aria-label={d.name + ' ' + (s === 'NA' ? 'N/A' : s + '分')}
                  className={v.score === s ? 'selected' : ''}
                  onClick={() => {
                    onFocus?.(i);
                    change({ score: s as Rating['score'] });
                  }}
                >
                  {s === 'NA' ? 'N/A' : s}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor={'reason-' + d.id}>
              {d.name}评分理由
            </label>
            <textarea
              id={'reason-' + d.id}
              aria-label={d.name + '评分理由'}
              rows={2}
              placeholder={
                v.score === 'NA'
                  ? '填写证据不足及 N/A 原因（必填）'
                  : '填写评分理由与判断依据（必填）'
              }
              value={v.reason}
              disabled={disabled}
              onChange={(e) => change({ reason: e.target.value })}
            />
            <details className="evidence">
              <summary>
                歌曲与问题证据
                {v.evidence.song_ids.length ? ' · ' + v.evidence.song_ids.length + ' 首' : ''}
              </summary>
              <div className="evidence-songs">
                {caseValue.songs
                  .filter((s) => s.song_id)
                  .map((s, i) => (
                    <label key={i}>
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={v.evidence.song_ids.includes(s.song_id)}
                        onChange={(e) =>
                          change({
                            evidence: {
                              ...v.evidence,
                              song_ids: e.target.checked
                                ? [...new Set([...v.evidence.song_ids, s.song_id])]
                                : v.evidence.song_ids.filter((id) => id !== s.song_id),
                            },
                          })
                        }
                      />
                      {s.song_name} <span className="mono">{s.song_id}</span>
                    </label>
                  ))}
              </div>
              <textarea
                aria-label={d.name + '证据说明'}
                rows={2}
                placeholder="记录具体问题、可验证线索或 Bad Case 分类"
                value={v.evidence.note}
                disabled={disabled}
                onChange={(e) => change({ evidence: { ...v.evidence, note: e.target.value } })}
              />
            </details>
          </div>
        );
      })}
    </>
  );
}
function VetoPanel({
  c,
  rubric,
  flags,
  reason,
  onChange,
  disabled,
}: {
  c: EvaluationCase;
  rubric: Rubric;
  flags: string[];
  reason: string;
  onChange: (flags: string[], reason: string) => void;
  disabled: boolean;
}) {
  const issues = deterministicIssues(c, rubric);
  return (
    <div className="veto-panel">
      <h3>
        <AlertTriangle size={16} />
        业务规则核验
      </h3>
      {issues.length ? (
        <ul>
          {issues.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          未检出数量、ID 缺失及重复 ID 问题。播放可用性须依据有效证据人工核验。
        </p>
      )}
      <details>
        <summary>记录业务否决项与证据</summary>
        {rubric.veto_rules
          .filter((v) => v.enabled)
          .map((v) => (
            <label className="check-row" key={v.id}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={flags.includes(v.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...flags, v.id] : flags.filter((id) => id !== v.id),
                    reason,
                  )
                }
              />
              {v.label}
            </label>
          ))}
        <textarea
          aria-label="业务否决项证据"
          value={reason}
          disabled={disabled}
          placeholder="填写数据核验或试听证据；仅凭歌曲名称不能判定歌曲不存在或无法播放。"
          onChange={(e) => onChange(flags, e.target.value)}
        />
      </details>
    </div>
  );
}
export function ReviewPage() {
  const { w, rubric, actor, mutate, busy } = useApp();
  const [id, setId] = useState(''),
    [all, setAll] = useState(false);
  const candidates = w.cases.filter(
    (c) =>
      submitted(w, c.case_id, rubric.version).length >= w.settings.required_annotations &&
      (all || !latestAdjudication(w, c.case_id, rubric.version)),
  );
  const c = candidates.find((c) => c.case_id === id) ?? candidates[0];
  const list = c ? submitted(w, c.case_id, rubric.version) : [];
  const existing = c ? latestAdjudication(w, c.case_id, rubric.version) : undefined;
  const [ratings, setRatings] = useState<Record<string, Rating>>({}),
    [reason, setReason] = useState(''),
    [checked, setChecked] = useState(false),
    [showCase, setShowCase] = useState(false);
  const key = c?.case_id + '|' + rubric.version + '|' + w.revision;
  useEffect(() => {
    setRatings(existing ? structuredClone(existing.ratings) : initialRatings(rubric));
    setReason(existing?.veto_reason ?? '');
    setChecked(existing?.veto_resolved ?? false);
  }, [key]);
  const diff = differences(list, rubric, w.settings.threshold),
    ag = pairAgreement(list, rubric);
  const permitted = actor && actor.role !== 'annotator';
  return (
    <>
      <div className="page-actions">
        <p className="muted">所有进入金标的案例均须逐维度人工裁定</p>
        <label className="check-row">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          包含已裁定案例
        </label>
      </div>
      <div className="notice">
        <AlertTriangle size={16} />
        <span>
          分差 ≥ {w.settings.threshold} 分或数值与 N/A
          不一致时优先复核。低于阈值的分歧仍需明确确认，不自动取平均值。
        </span>
      </div>
      {!permitted ? (
        <Empty
          title="请选择复核人员或管理员身份"
          description="在系统设置中管理本地人员角色。独立评估员仅使用人工评分工作台。"
        />
      ) : !c ? (
        <Empty
          title="没有可复核案例"
          description={`需要至少 ${w.settings.required_annotations} 名不同评估员提交相同 Rubric 版本的评分。`}
        />
      ) : (
        <>
          <div className="evaluation-toolbar">
            <div className="actions">
              <select
                aria-label="选择复核案例"
                value={c.case_id}
                onChange={(e) => setId(e.target.value)}
              >
                {candidates.map((c) => (
                  <option key={c.case_id}>{c.case_id}</option>
                ))}
              </select>
              <Badge tone={existing ? 'green' : 'amber'}>
                {existing ? '已裁定' : '待人工复核'}
              </Badge>
              <span className="muted">{c.scene}</span>
            </div>
            <Button onClick={() => setShowCase(true)}>查看完整案例</Button>
          </div>
          <div className="mini-metrics">
            <div>
              有效维度配对 <strong>{ag.n}</strong>
            </div>
            <div>
              人工评分完全一致率 <strong>{percent(ag.exact)}</strong>
            </div>
            <div>
              平均绝对分差 <strong>{number(ag.mae)}</strong>
            </div>
            <div>
              重点复核维度 <strong>{diff.filter((d) => d.priority).length}</strong>
            </div>
          </div>
          <Card
            title="独立评分对照"
            description="包含全部已提交评估员。展开维度可查看原始理由、歌曲证据及问题说明。"
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>评分维度 / 权重</th>
                    {list.map((a) => (
                      <th key={a.id}>
                        {w.reviewers.find((p) => p.id === a.reviewer_id)?.name ?? a.reviewer_id}
                      </th>
                    ))}
                    <th>最大分差</th>
                    <th>复核优先级</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map((d) => (
                    <tr key={d.dimension.id}>
                      <td>
                        {d.dimension.name}
                        <small>{d.dimension.weight}%</small>
                      </td>
                      {list.map((a) => (
                        <td key={a.id}>
                          <details>
                            <summary className="score-summary">
                              {a.ratings[d.dimension.id]?.score === 'NA'
                                ? 'N/A'
                                : (a.ratings[d.dimension.id]?.score ?? '未评分')}
                            </summary>
                            <div className="reason-detail">
                              <p>{a.ratings[d.dimension.id]?.reason}</p>
                              <small>
                                歌曲证据：
                                {a.ratings[d.dimension.id]?.evidence.song_ids.join('、') ||
                                  '未标记'}
                              </small>
                              <p>{a.ratings[d.dimension.id]?.evidence.note || '未补充问题说明'}</p>
                              <small>{date(a.updated_at)}</small>
                            </div>
                          </details>
                        </td>
                      ))}
                      <td>
                        {d.gap}
                        {d.values.includes('NA') ? ' / 含 N/A' : ''}
                      </td>
                      <td>
                        <Badge tone={d.priority ? 'amber' : d.mixed ? 'blue' : 'green'}>
                          {d.priority ? '重点复核' : d.mixed ? '需确认' : '一致，待确认'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card
            title="最终人工裁定"
            description="逐维度选择参考分并说明依据，保存完整裁定记录。可对已裁定案例再次复核；已发布金标快照不会改变。"
          >
            <div className="review-rating-grid">
              <RatingsEditor rubric={rubric} value={ratings} onChange={setRatings} caseValue={c} />
            </div>
            <div className="veto-panel">
              <h3>业务否决项复核</h3>
              <ul>
                {deterministicIssues(c, rubric).map((s) => (
                  <li key={s}>{s}</li>
                ))}
                {list
                  .filter((a) => a.veto_flags.length)
                  .map((a) => (
                    <li key={a.id}>
                      {w.reviewers.find((p) => p.id === a.reviewer_id)?.name}：
                      {a.veto_flags
                        .map((v) => rubric.veto_rules.find((r) => r.id === v)?.label ?? v)
                        .join('、')}{' '}
                      — {a.veto_reason}
                    </li>
                  ))}
              </ul>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                已核验全部规则及已报告问题，并在下方记录处理结论
              </label>
              <Field label="核验结论 / 裁定依据（必填）">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="说明问题是否成立、是否影响金标参考分，以及最终人工确认依据。"
                />
              </Field>
            </div>
            <div className="score-footer">
              <div>
                <span className="muted">最终参考综合分</span>
                <strong>
                  {number(weightedScore(ratings, rubric))}
                  <small> / 5</small>
                </strong>
              </div>
              <Button
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  await mutate('保存人工裁定', c.case_id, (w) => {
                    const a = validateAdjudication(w, {
                      id: uid(),
                      case_id: c.case_id,
                      rubric_version: rubric.version,
                      reviewer_id: actor!.id,
                      annotation_ids: submitted(w, c.case_id, rubric.version).map((a) => a.id),
                      ratings,
                      veto_resolved: checked,
                      veto_reason: reason,
                      created_at: now(),
                    });
                    w.adjudications.push(a);
                  });
                }}
              >
                <CheckCircle2 size={16} />
                保存人工裁定
              </Button>
            </div>
          </Card>
          <Card title="裁定历史">
            <History w={w} id={c.case_id} rv={rubric.version} />
          </Card>
          <Modal open={showCase} onClose={() => setShowCase(false)} title={c.case_id} wide>
            <CaseContext value={c} />
          </Modal>
        </>
      )}
    </>
  );
}
export function History({ w, id, rv }: { w: Workspace; id: string; rv: string }) {
  const annotations = w.annotations.filter((a) => a.case_id === id && a.rubric_version === rv),
    adj = w.adjudications.filter((a) => a.case_id === id && a.rubric_version === rv);
  return (
    <div className="history">
      {annotations.map((a) => (
        <details key={a.id}>
          <summary>
            人工标注 · {w.reviewers.find((p) => p.id === a.reviewer_id)?.name ?? a.reviewer_id} ·{' '}
            {a.status === 'submitted' ? '已提交' : '草稿'} · {date(a.updated_at)}
          </summary>
          <pre>{JSON.stringify(a, null, 2)}</pre>
        </details>
      ))}
      {adj.map((a) => (
        <details key={a.id}>
          <summary>
            人工裁定 · {w.reviewers.find((p) => p.id === a.reviewer_id)?.name ?? a.reviewer_id} ·{' '}
            {date(a.created_at)}
          </summary>
          <pre>{JSON.stringify(a, null, 2)}</pre>
        </details>
      ))}
    </div>
  );
}
