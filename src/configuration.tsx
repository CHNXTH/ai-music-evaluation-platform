import { useState } from 'react';
import { Plus, Save, ShieldCheck, Trash2, BookOpen, LockKeyhole, Download } from 'lucide-react';
import { useApp } from './context';
import { initialWorkspace, now, reviewerSchema, rubricSchema } from './model';
import { validateWorkspace } from './domain';
import { download } from './files';
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
} from './components/ui';
export function RubricPage() {
  const { w, rubric, setRubricVersion, mutate, notify, busy } = useApp();
  const [open, setOpen] = useState(false),
    [json, setJson] = useState('');
  function create() {
    const r = structuredClone(rubric);
    r.version = '';
    r.created_at = now();
    setJson(JSON.stringify(r, null, 2));
    setOpen(true);
  }
  async function load(f: File) {
    try {
      const r = rubricSchema.parse(JSON.parse(await f.text()));
      await mutate('导入评分标准', r.version, (w) => {
        if (w.rubrics.some((x) => x.version === r.version))
          throw new Error('Rubric 版本已存在，不可覆盖');
        w.rubrics.push(r);
      });
    } catch (e) {
      notify(String(e), true);
    }
  }
  return (
    <>
      <div className="page-actions">
        <p className="muted">
          <LockKeyhole size={15} />
          评分标准按版本保存，编辑内容将发布为新版本
        </p>
        <div className="actions">
          <Exports name={'rubric-' + rubric.version} data={rubric} />
          <FileButton label="导入评分标准" accept=".json" onFile={load} />
          <Button variant="primary" onClick={create}>
            <Plus size={15} />
            创建 / 修订版本
          </Button>
        </div>
      </div>
      <div className="rubric-meta">
        <div>
          <Badge tone="blue">Rubric {rubric.version}</Badge>
          <h2>{rubric.name}</h2>
          <p>
            {rubric.dimensions.length} 个维度 · 权重总和{' '}
            {rubric.dimensions.reduce((s, d) => s + d.weight, 0)}% · 要求歌曲数量{' '}
            {rubric.required_songs} 首
          </p>
        </div>
        <select
          aria-label="查看评分标准版本"
          value={rubric.version}
          onChange={(e) => setRubricVersion(e.target.value)}
        >
          {w.rubrics.map((r) => (
            <option key={r.version}>{r.version}</option>
          ))}
        </select>
      </div>
      <div className="rubric-cards">
        {rubric.dimensions.map((d) => (
          <Card
            key={d.id}
            title={d.name}
            description={`${d.focus} · ID: ${d.id}`}
            action={
              <Badge tone="blue">
                {d.weight}% · {d.importance}
              </Badge>
            }
          >
            <ol className="rubric-standards">
              {d.standards.map((s, i) => (
                <li key={i}>
                  <b>{i + 1}</b>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <div className="rubric-examples">
              <p>
                <strong>N/A 规则</strong>
                {d.allow_na ? d.na_rule : '不允许 N/A'}
              </p>
              <p>
                <strong>典型正例</strong>
                {d.positive || '未配置'}
              </p>
              <p>
                <strong>典型反例</strong>
                {d.negative || '未配置'}
              </p>
              <p>
                <strong>边界案例</strong>
                {d.boundary || '未配置'}
              </p>
            </div>
          </Card>
        ))}
      </div>
      <Card
        title="业务否决项"
        description="可验证的数据规则优先。歌曲 ID 错误、播放不可用或严重内容问题须附人工证据。"
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>规则</th>
                <th>核验方式</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {rubric.veto_rules.map((v) => (
                <tr key={v.id}>
                  <td>{v.label}</td>
                  <td>
                    {v.kind === 'manual'
                      ? '人工核验与证据'
                      : v.kind === 'song_count'
                        ? '歌曲数量比对'
                        : v.kind === 'duplicate_id'
                          ? '非空歌曲 ID 重复检查'
                          : '歌曲 ID 完整性检查'}
                  </td>
                  <td>
                    <Badge tone={v.enabled ? 'green' : 'neutral'}>
                      {v.enabled ? '启用' : '停用'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="配置并保存 Rubric 新版本"
        description="可新增、删除维度并修改权重、评分标准、重要性、正反例、N/A 和否决项。版本 ID 必须唯一，维度权重总和必须为 100%。"
        wide
      >
        <div className="notice">
          <BookOpen size={17} />
          <span>
            importance 支持 Essential / Important / Optional / Veto。standards 按 1–5
            分顺序填写五条标准。kind 支持 song_count / duplicate_id / missing_id / manual。
          </span>
        </div>
        <Field label="Rubric 配置（JSON）">
          <textarea
            className="code"
            rows={24}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
        </Field>
        <div className="modal-actions">
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              try {
                const r = rubricSchema.parse({ ...JSON.parse(json), created_at: now() });
                if (
                  await mutate('发布评分标准', r.version, (w) => {
                    if (w.rubrics.some((x) => x.version === r.version))
                      throw new Error('此 Rubric 版本已存在，请填写新的唯一版本');
                    w.rubrics.push(r);
                  })
                ) {
                  setRubricVersion(r.version);
                  setOpen(false);
                }
              } catch (e) {
                notify(String(e), true);
              }
            }}
          >
            <Save size={15} />
            校验并保存新版本
          </Button>
        </div>
      </Modal>
    </>
  );
}
export function SettingsPage() {
  const { w, mutate, notify, setActorId, busy, actor } = useApp();
  const [id, setId] = useState(''),
    [name, setName] = useState(''),
    [role, setRole] = useState('annotator'),
    [threshold, setThreshold] = useState(w.settings.threshold),
    [required, setRequired] = useState(w.settings.required_annotations),
    [clear, setClear] = useState(false),
    [confirm, setConfirm] = useState('');
  async function restore(f: File) {
    try {
      const data = validateWorkspace(JSON.parse(await f.text()));
      await mutate('恢复工作区备份', f.name, (w) => {
        if (w.cases.length || w.annotations.length || w.goldVersions.length || w.judges.length)
          throw new Error(
            '为保护现有数据，备份只能恢复至空数据工作区。请先导出当前工作区，再删除本地数据',
          );
        Object.assign(w, data);
      });
    } catch (e) {
      notify(String(e), true);
    }
  }
  return (
    <>
      <div className="notice">
        <ShieldCheck size={17} />
        <span>
          全部业务数据保存在当前浏览器 IndexedDB。不会自动跨设备同步，不上传到
          GitHub。请定期导出工作区备份。浏览器清理站点数据会删除本地记录。
        </span>
      </div>
      <div className="analytics-grid">
        <Card
          title="本地人员与当前身份"
          description="此处为工作区记录归属配置，不具备账户认证或服务端访问控制。独立评估须使用各自本地工作区。"
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>人员 / 稳定 ID</th>
                  <th>角色</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {w.reviewers.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name}
                      <small className="mono">{p.id}</small>
                    </td>
                    <td>
                      {p.role === 'admin'
                        ? '管理员'
                        : p.role === 'reviewer'
                          ? '复核人员'
                          : '评估员'}
                    </td>
                    <td>
                      <Button onClick={() => setActorId(p.id)} disabled={actor?.id === p.id}>
                        {actor?.id === p.id ? '当前身份' : '切换身份'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!w.reviewers.length && (
            <Empty
              title="尚未添加人员"
              description="使用稳定且唯一的人员 ID，以便跨工作区合并标注。"
            />
          )}
          <div className="settings-form">
            <Field label="人员 ID">
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="稳定唯一 ID，用于文件合并"
              />
            </Field>
            <Field label="人员姓名">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="本地角色">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="annotator">评估员</option>
                <option value="reviewer">复核人员</option>
                <option value="admin">管理员</option>
              </select>
            </Field>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                try {
                  const p = reviewerSchema.parse({ id: id.trim(), name: name.trim(), role });
                  if (
                    await mutate('添加本地人员', p.id, (w) => {
                      if (w.reviewers.some((x) => x.id === p.id)) throw new Error('人员 ID 已存在');
                      w.reviewers.push(p);
                    })
                  ) {
                    setActorId(p.id);
                    setId('');
                    setName('');
                  }
                } catch (e) {
                  notify(String(e), true);
                }
              }}
            >
              <Plus size={15} />
              添加人员
            </Button>
          </div>
        </Card>
        <div className="stack">
          <Card title="评估与分歧规则" description="阈值用于优先级，不作为自动通过或金标确认规则。">
            <div className="settings-form">
              <Field label="重点复核分差阈值">
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                />
              </Field>
              <Field label="必要独立标注数量">
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={required}
                  onChange={(e) => setRequired(Number(e.target.value))}
                />
              </Field>
              <Button
                disabled={busy}
                onClick={() =>
                  mutate('保存评估设置', 'workspace', (w) => {
                    if (
                      !Number.isInteger(threshold) ||
                      threshold < 1 ||
                      threshold > 4 ||
                      !Number.isInteger(required) ||
                      required < 2 ||
                      required > 20
                    )
                      throw new Error('阈值须为 1–4，独立标注数量须为 2–20 的整数');
                    w.settings = { threshold, required_annotations: required };
                  })
                }
              >
                <Save size={15} />
                保存规则
              </Button>
            </div>
          </Card>
          <Card
            title="数据备份与恢复"
            description="备份包含评测集、标准、人员、标注、裁定、金标、Judge 和审计记录。"
          >
            <div className="settings-form actions">
              <Button onClick={() => download('music-evaluation-workspace.json', w)}>
                <Download size={15} />
                导出完整工作区
              </Button>
              <FileButton label="恢复工作区备份" accept=".json" onFile={restore} />
            </div>
            <p className="muted padded">
              备份仅可恢复至空数据工作区，并执行结构与关联校验。评测报告的人工结论单独随报告导出。
            </p>
          </Card>
          <Card
            title="删除本地数据"
            description="删除当前浏览器内全部业务数据，保留默认评分标准。此操作不可撤销。"
          >
            <div className="padded">
              <Button variant="danger" onClick={() => setClear(true)}>
                <Trash2 size={15} />
                删除本地工作区数据
              </Button>
            </div>
          </Card>
        </div>
      </div>
      <Usage />
      <Card title="操作审计" description="重要操作记录时间、操作者与对象；审计仅保存在本地工作区。">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>操作</th>
                <th>操作者 ID</th>
                <th>对象</th>
              </tr>
            </thead>
            <tbody>
              {[...w.audit]
                .reverse()
                .slice(0, 100)
                .map((a) => (
                  <tr key={a.id}>
                    <td>{date(a.at)}</td>
                    <td>{a.action}</td>
                    <td className="mono">{a.actor}</td>
                    <td>{a.entity}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!w.audit.length && <Empty title="暂无操作记录" />}
      </Card>
      <Modal
        open={clear}
        onClose={() => setClear(false)}
        title="永久删除本地工作区"
        description="请先导出备份。输入「删除本地数据」以确认。"
      >
        <input
          aria-label="删除确认文字"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <div className="modal-actions">
          <Button onClick={() => setClear(false)}>取消</Button>
          <Button
            variant="danger"
            disabled={busy || confirm !== '删除本地数据'}
            onClick={async () => {
              if (
                await mutate('删除本地数据', 'workspace', (w) =>
                  Object.assign(w, initialWorkspace()),
                )
              ) {
                localStorage.removeItem('music-report-conclusion');
                setActorId('');
                setClear(false);
                setConfirm('');
              }
            }}
          >
            永久删除
          </Button>
        </div>
      </Modal>
    </>
  );
}
export function Usage() {
  return (
    <Card title="使用说明与文件约定" description="人工评估 → 分歧复核 → 金标发布 → 离线校准">
      <div className="usage">
        <ol>
          <li>
            <strong>准备本地人员。</strong>添加评估员、复核人员与管理员，人员 ID
            跨工作区保持稳定且唯一。
          </li>
          <li>
            <strong>导入评测 Case。</strong>评测集支持 JSON 数组与带表头 CSV。必须提供
            case_id、scene、songs。CSV 的 songs、tags 是 JSON
            数组字符串。通过字段映射确认导入目标。缺失信息保留为空。
          </li>
          <li>
            <strong>分发工作区。</strong>
            管理员在开始标注前导出工作区备份，评估员分别在空工作区恢复相同文件。不要预先包含其他人员的评分。各自选择自己的稳定人员
            ID。
          </li>
          <li>
            <strong>完成人工评分。</strong>查看上下文与
            Rubric，为每个维度填写分数和理由。证据不足时按规则选择 N/A
            并说明原因。可保存草稿；提交后锁定。
          </li>
          <li>
            <strong>合并独立结果。</strong>评估员在人工评估页导出自己的 JSON
            标注文件，管理员选择「合并标注文件」。系统核对完整案例与 Rubric 一致性，拒绝冲突 ID
            和重复人员评分，忽略完全相同的记录。
          </li>
          <li>
            <strong>复核并发布。</strong>
            切换复核人员，查看全部评分与证据。逐维度人工给出最终参考分与依据，核验业务规则并保存裁定。管理员在金标集页单条或批量勾选案例，填写新版本并确认发布。
          </li>
          <li>
            <strong>导入 Judge 评分。</strong>使用 JSON 数组或 CSV，字段为
            case_id、judge_model、judge_version、rubric_version、dimension_id、judge_score、judge_reason、evaluation_timestamp。judge_score
            为 1–5 整数；时间使用带时区的 ISO 8601。同一模型版本的每个配对只允许一条评分。
          </li>
          <li>
            <strong>查看一致性。</strong>选择金标版本、模型、Judge 版本、场景及维度。Exact
            为分数相同的配对比例；Within-1 为绝对分差不超过 1；MAE 为绝对分差均值。QWK 使用 1–5
            级平方距离权重，样本少于 2 或期望分歧为 0 时不返回数值。
          </li>
          <li>
            <strong>导出与备份。</strong>报告支持 JSON / CSV 导出和浏览器打印保存 PDF。金标 JSON
            保留完整版本快照。工作区备份用于完整恢复，标注交换文件用于多人结果合并。
          </li>
        </ol>
        <p>
          默认维度 ID：<code>scene</code>、<code>preference</code>、<code>quality</code>、
          <code>coherence</code>、<code>expression</code>
          。本地角色不构成安全边界。不得将含内部信息的导出文件提交至公开仓库。
        </p>
      </div>
    </Card>
  );
}
