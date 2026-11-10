import { useState } from 'react';
import { Plus, Search, Pencil, Trash2, ArrowUpRight, Database, Check } from 'lucide-react';
import { useApp } from './context';
import { caseSchema, now, uid, type EvaluationCase } from './model';
import { status, statusLabel } from './domain';
import { importCases, parseRows } from './files';
import {
  Button,
  Card,
  Empty,
  Field,
  Modal,
  Badge,
  FileButton,
  Exports,
  date,
} from './components/ui';
const fields: Record<string, string> = {
  case_id: 'Case ID',
  scene: '场景',
  weather: '天气',
  atmosphere: '目标音乐氛围',
  time_context: '时间 / 季节 / 节日',
  destination_poi_type: '目的地类型',
  user_preferences: '用户音乐偏好',
  candidate_sources: '候选来源信息',
  playlist_title: '歌单名称',
  playlist_description: '歌单描述',
  info: 'AI 推荐文案',
  color_id: 'HMI 色板 ID',
  workflow_version: '工作流版本',
};
export function DatasetPage() {
  const { w, rubric, mutate, notify, navigate, busy } = useApp();
  const [query, setQuery] = useState(''),
    [dataset, setDataset] = useState(''),
    [scene, setScene] = useState(''),
    [st, setSt] = useState('');
  const [edit, setEdit] = useState<EvaluationCase | null>(null),
    [creating, setCreating] = useState(false),
    [detail, setDetail] = useState<EvaluationCase | null>(null),
    [remove, setRemove] = useState<string | null>(null),
    [newDataset, setNewDataset] = useState(false),
    [name, setName] = useState('');
  const [raw, setRaw] = useState<Record<string, unknown>[] | null>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [target, setTarget] = useState('default');
  const filtered = w.cases.filter(
    (c) =>
      (!dataset || c.dataset_id === dataset) &&
      (!scene || c.scene === scene) &&
      (!st || status(w, c.case_id, rubric.version) === st) &&
      [c.case_id, c.scene, c.playlist_title, ...c.tags]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function load(f: File) {
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error('文件大小不能超过 20 MB');
      const rows = parseRows(await f.text(), f.name);
      if (!rows.length) throw new Error('文件中没有案例');
      setMapping(
        Object.fromEntries(
          [...Object.keys(fields), 'songs', 'tags', 'created_at', 'dataset_id'].map((k) => [
            k,
            k in rows[0] ? k : '',
          ]),
        ),
      );
      setRaw(rows);
    } catch (e) {
      notify(String(e), true);
    }
  }
  return (
    <>
      <div className="page-actions">
        <div className="muted">按场景、状态和评测集组织推荐案例</div>
        <div className="actions">
          <Button onClick={() => setNewDataset(true)}>
            <Database size={15} />
            新建评测集
          </Button>
          <Exports name="evaluation-cases" data={filtered} csvData={filtered} />
          <FileButton label="导入案例" onFile={load} />
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            新建案例
          </Button>
        </div>
      </div>
      <Card>
        <div className="table-toolbar">
          <div className="search">
            <Search size={16} />
            <input
              aria-label="搜索案例"
              placeholder="搜索 Case ID、场景、歌单或标签"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="评测集筛选"
            value={dataset}
            onChange={(e) => setDataset(e.target.value)}
          >
            <option value="">全部评测集</option>
            {w.datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select aria-label="场景筛选" value={scene} onChange={(e) => setScene(e.target.value)}>
            <option value="">全部场景</option>
            {[...new Set(w.cases.map((c) => c.scene))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select aria-label="状态筛选" value={st} onChange={(e) => setSt(e.target.value)}>
            <option value="">全部状态</option>
            {Object.entries(statusLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {!filtered.length ? (
          <Empty
            title="尚无匹配的评测案例"
            description="导入 JSON / CSV 文件，或创建案例开始人工评估。缺失信息将被明确保留。"
          >
            <Button onClick={() => setCreating(true)}>
              创建案例
              <ArrowUpRight size={15} />
            </Button>
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case ID / 歌单名称</th>
                  <th>场景与氛围</th>
                  <th>评测集</th>
                  <th>歌曲</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.case_id}>
                    <td>
                      <button className="text-button mono" onClick={() => setDetail(c)}>
                        {c.case_id}
                      </button>
                      <small>{c.playlist_title || '未提供歌单名称'}</small>
                    </td>
                    <td>
                      {c.scene}
                      <small>{c.atmosphere || '未提供目标氛围'}</small>
                    </td>
                    <td>{w.datasets.find((d) => d.id === c.dataset_id)?.name}</td>
                    <td>{c.songs.length}</td>
                    <td>
                      <Badge
                        tone={
                          status(w, c.case_id, rubric.version) === 'Gold Confirmed'
                            ? 'green'
                            : 'neutral'
                        }
                      >
                        {statusLabel[status(w, c.case_id, rubric.version)]}
                      </Badge>
                    </td>
                    <td className="muted nowrap">{date(c.created_at)}</td>
                    <td>
                      <div className="actions">
                        <Button aria-label={'编辑 ' + c.case_id} onClick={() => setEdit(c)}>
                          <Pencil size={14} />
                        </Button>
                        <Button
                          aria-label={'删除 ' + c.case_id}
                          onClick={() => setRemove(c.case_id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          {filtered.length} 条案例 · 本地数据工作区
          <Button variant="ghost" onClick={() => navigate('human')}>
            前往人工评估 →
          </Button>
        </div>
      </Card>
      <Modal open={newDataset} onClose={() => setNewDataset(false)} title="新建评测集">
        <Field label="评测集名称">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            if (!name.trim()) return notify('请输入评测集名称', true);
            if (
              await mutate('创建评测集', name, (w) => {
                w.datasets.push({ id: uid(), name: name.trim(), created_at: now() });
              })
            ) {
              setNewDataset(false);
              setName('');
            }
          }}
        >
          创建评测集
        </Button>
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title="删除案例"
        description="仅未开始标注的案例可删除。已产生评分的案例保留可追溯记录。"
      >
        <p>确认删除 {remove}？</p>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            if (
              await mutate('删除案例', remove!, (w) => {
                if (
                  w.annotations.some((a) => a.case_id === remove) ||
                  w.goldVersions.some((g) => g.records.some((r) => r.case.case_id === remove))
                )
                  throw new Error('已有标注或金标记录，不能删除');
                w.cases = w.cases.filter((c) => c.case_id !== remove);
              })
            ) {
              setRemove(null);
            }
          }}
        >
          确认删除
        </Button>
      </Modal>
      <CaseEditor
        open={creating || !!edit}
        value={edit}
        onClose={() => {
          setCreating(false);
          setEdit(null);
        }}
      />
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.case_id ?? '案例详情'}
        wide
      >
        {detail && <CaseContext value={detail} />}
      </Modal>
      <Modal
        open={!!raw}
        onClose={() => setRaw(null)}
        title="字段映射与导入校验"
        description={`已读取 ${raw?.length ?? 0} 行。songs 和 tags 在 CSV 中须为 JSON 数组。重复 ID 将使整批导入失败。`}
        wide
      >
        <Field label="目标评测集">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {w.datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          {Object.entries(mapping)
            .filter(([k]) => k !== 'dataset_id')
            .map(([k, v]) => (
              <Field key={k} label={fields[k] ?? k}>
                <select value={v} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })}>
                  <option value="">不映射</option>
                  {Object.keys(raw?.[0] ?? {}).map((key) => (
                    <option key={key}>{key}</option>
                  ))}
                </select>
              </Field>
            ))}
        </div>
        <div className="modal-actions">
          <Button onClick={() => setRaw(null)}>取消</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              try {
                const cases = importCases(raw!, mapping, target);
                if (
                  await mutate('导入案例', String(cases.length), (w) => {
                    for (const c of cases)
                      if (w.cases.some((x) => x.case_id === c.case_id))
                        throw new Error(`Case ID ${c.case_id} 已存在`);
                    w.cases.push(...cases);
                  })
                ) {
                  setRaw(null);
                }
              } catch (e) {
                notify(String(e), true);
              }
            }}
          >
            <Check size={15} />
            校验并导入
          </Button>
        </div>
      </Modal>
    </>
  );
}
function CaseEditor({
  open,
  value,
  onClose,
}: {
  open: boolean;
  value: EvaluationCase | null;
  onClose: () => void;
}) {
  const { w, mutate, notify, busy } = useApp();
  const [form, setForm] = useState<Record<string, string>>({}),
    [songs, setSongs] = useState('[]'),
    [tags, setTags] = useState(''),
    [dataset, setDataset] = useState('default'),
    [loaded, setLoaded] = useState<string>('');
  const key = open ? (value?.case_id ?? 'new') : 'closed';
  if (key !== loaded) {
    setLoaded(key);
    setForm(
      value
        ? Object.fromEntries(
            Object.keys(fields).map((k) => [k, String(value[k as keyof EvaluationCase] ?? '')]),
          )
        : {},
    );
    setSongs(JSON.stringify(value?.songs ?? [], null, 2));
    setTags(value?.tags.join(', ') ?? '');
    setDataset(value?.dataset_id ?? 'default');
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={value ? '编辑案例' : '新建案例'}
      description="提交后的案例内容锁定。需要修改时，请创建新的 Case ID，以保留历史评估上下文。"
      wide
    >
      <div className="form-grid">
        <Field label="所属评测集">
          <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
            {w.datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        {Object.entries(fields).map(([k, label]) => (
          <Field key={k} label={label + (['case_id', 'scene'].includes(k) ? ' *' : '')}>
            <input
              disabled={k === 'case_id' && !!value}
              value={form[k] ?? ''}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          </Field>
        ))}
        <Field label="标签（逗号分隔）">
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
      </div>
      <Field
        label="推荐歌曲（JSON 数组）"
        hint="每首歌曲至少提供 song_name。可填写 song_id、singer、album、source、genre、mood、duration、music_url；缺失字段保留为空。"
      >
        <textarea
          className="code"
          rows={10}
          value={songs}
          onChange={(e) => setSongs(e.target.value)}
        />
      </Field>
      <div className="modal-actions">
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            try {
              const c = caseSchema.parse({
                ...form,
                dataset_id: dataset,
                songs: JSON.parse(songs),
                tags: tags
                  .split(/[,，]/)
                  .map((x) => x.trim())
                  .filter(Boolean),
                created_at: value?.created_at ?? now(),
              });
              if (
                await mutate(value ? '编辑案例' : '创建案例', c.case_id, (w) => {
                  if (w.annotations.some((a) => a.case_id === c.case_id))
                    throw new Error('案例已开始标注，内容锁定');
                  const idx = w.cases.findIndex((x) => x.case_id === c.case_id);
                  if (!value && idx >= 0) throw new Error('Case ID 已存在');
                  if (idx >= 0) w.cases[idx] = c;
                  else w.cases.push(c);
                })
              ) {
                onClose();
              }
            } catch (e) {
              notify(String(e), true);
            }
          }}
        >
          保存案例
        </Button>
      </div>
    </Modal>
  );
}
export function CaseContext({ value: c }: { value: EvaluationCase }) {
  return (
    <div className="case-context">
      <div className="case-banner">
        <Badge>{c.scene}</Badge>
        <span className="mono">{c.case_id}</span>
        <h2>{c.playlist_title || '未提供歌单名称'}</h2>
        <p>{c.playlist_description || '未提供歌单描述'}</p>
      </div>
      <dl className="context-grid">
        {[
          ['天气', c.weather],
          ['目标氛围', c.atmosphere],
          ['时间 / 节日', c.time_context],
          ['导航目的地', c.destination_poi_type],
          ['用户偏好', c.user_preferences],
          ['候选来源', c.candidate_sources],
          ['工作流版本', c.workflow_version],
          ['HMI 色板', c.color_id],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={!v ? 'missing' : ''}>{v || '未提供'}</dd>
          </div>
        ))}
      </dl>
      <div className="info-box">
        <h3>AI 推荐文案</h3>
        <p>{c.info || '未提供 AI 推荐文案'}</p>
      </div>
      <h3 className="section-label">
        推荐歌曲 <Badge>{c.songs.length} 首</Badge>
      </h3>
      {!c.songs.length ? (
        <p className="missing">未提供推荐歌曲</p>
      ) : (
        <ol className="songs">
          {c.songs.map((s, i) => (
            <li key={i}>
              <span className="song-index">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <strong>{s.song_name}</strong>
                <p>
                  {s.singer || '歌手未提供'} · {s.album || '专辑未提供'}
                </p>
                <div className="song-tags">
                  <span>{s.genre || '曲风未提供'}</span>
                  <span>{s.mood || '情绪未提供'}</span>
                  <span>{s.source || '来源未提供'}</span>
                </div>
                <small className="mono">
                  ID: {s.song_id || '未提供'} · 时长: {s.duration || '未提供'}
                </small>
              </div>
              {s.music_url ? (
                <a className="listen" href={s.music_url} target="_blank" rel="noreferrer">
                  试听 ↗
                </a>
              ) : (
                <span className="missing listen">无音乐链接</span>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="actions">
        {c.tags.map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
      </div>
    </div>
  );
}
