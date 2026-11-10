import { useState } from 'react';
import { Check, LockKeyhole, Plus, ShieldCheck } from 'lucide-react';
import { useApp } from './context';
import { now, type GoldSet, type GoldSetVersion } from './model';
import { createGold, latestAdjudication } from './domain';
import { Badge, Button, Card, Empty, Exports, Field, Modal, date, number } from './components/ui';
import { CaseContext } from './dataset';
export function goldCSV(g: GoldSetVersion | undefined) {
  return (
    g?.records.flatMap((r) =>
      Object.entries(r.ratings).map(([dimension_id, v]) => ({
        gold_version: g.version,
        case_id: r.case.case_id,
        scene: r.case.scene,
        rubric_version: r.rubric.version,
        dimension_id,
        reference_score: v.score,
        reason: v.reason,
        evidence: v.evidence,
        weighted_score: r.weighted_score,
        confirmed_by: r.confirmed_by,
        confirmed_at: r.confirmed_at,
        case_snapshot: r.case,
        annotation_snapshot: r.annotations,
        adjudication_snapshot: r.adjudication,
      })),
    ) ?? []
  );
}
export function GoldPage() {
  const { w, rubric, actor, mutate, busy } = useApp();
  const [version, setVersion] = useState(''),
    [scene, setScene] = useState(''),
    [quality, setQuality] = useState(''),
    [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<GoldSet | null>(null);
  const gold = w.goldVersions.find((g) => g.version === version) ?? w.goldVersions.at(-1);
  const eligible = w.cases.filter((c) => !!latestAdjudication(w, c.case_id, rubric.version));
  const rows =
    gold?.records.filter(
      (r) =>
        (!scene || r.case.scene === scene) &&
        (!quality ||
          (quality === 'high'
            ? r.weighted_score >= 4
            : quality === 'middle'
              ? r.weighted_score >= 3 && r.weighted_score < 4
              : r.weighted_score < 3)),
    ) ?? [];
  return (
    <>
      <div className="page-actions">
        <p className="muted">
          <LockKeyhole size={15} />
          已发布版本不可变 · 每次发布保留完整上下文与评分快照
        </p>
        <div className="actions">
          <Exports
            name={'gold-set-' + (gold?.version ?? '')}
            data={gold ?? { records: [] }}
            csvData={goldCSV(gold)}
          />
          <Button
            variant="primary"
            onClick={() => {
              setOpen(true);
              setSelected([]);
            }}
          >
            <Plus size={16} />
            审核并发布版本
          </Button>
        </div>
      </div>
      <div className="mini-metrics">
        <div>
          金标版本 <strong>{w.goldVersions.length}</strong>
        </div>
        <div>
          当前版本案例 <strong>{gold?.records.length ?? 0}</strong>
        </div>
        <div>
          完成裁定可选案例 <strong>{eligible.length}</strong>
        </div>
        <div>
          发布状态 <strong className="text-small">{gold ? '已发布 · 不可变' : '尚未发布'}</strong>
        </div>
      </div>
      <Card
        title="金标记录"
        description="选择版本查看可复现的人工参考评分。筛选不影响完整版本导出。"
      >
        <div className="table-toolbar">
          <select
            aria-label="金标版本"
            value={gold?.version ?? ''}
            onChange={(e) => setVersion(e.target.value)}
          >
            {!gold && <option value="">暂无版本</option>}
            {w.goldVersions.map((g) => (
              <option key={g.version} value={g.version}>
                {g.version} · {g.records.length} 条
              </option>
            ))}
          </select>
          <select
            aria-label="金标场景筛选"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
          >
            <option value="">全部场景</option>
            {[...new Set(gold?.records.map((r) => r.case.scene))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="质量等级"
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
          >
            <option value="">全部质量等级</option>
            <option value="high">优质 ≥ 4</option>
            <option value="middle">合格 3–4</option>
            <option value="low">待改进 &lt; 3</option>
          </select>
        </div>
        {!rows.length ? (
          <Empty
            title="暂无金标记录"
            description="完成独立人工评分与逐维度裁定后，由管理员审核发布金标版本。"
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case ID / 场景</th>
                  <th>Rubric 版本</th>
                  <th>综合分</th>
                  <th>评估员数量</th>
                  <th>确认人员</th>
                  <th>确认时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.case.case_id}>
                    <td className="mono">
                      {r.case.case_id}
                      <small>{r.case.scene}</small>
                    </td>
                    <td>{r.rubric.version}</td>
                    <td>
                      <Badge tone={r.weighted_score >= 4 ? 'green' : 'blue'}>
                        {number(r.weighted_score)}
                      </Badge>
                    </td>
                    <td>{r.annotations.length}</td>
                    <td>
                      {w.reviewers.find((p) => p.id === r.confirmed_by)?.name ?? r.confirmed_by}
                    </td>
                    <td>{date(r.confirmed_at)}</td>
                    <td>
                      <Button onClick={() => setDetail(r)}>查看记录</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="人工审核与金标发布"
        description={`采用 Rubric ${rubric.version}。只允许选择已完成全部当前标注复核的案例；发布将生成新的不可变快照。`}
        wide
      >
        <Field label="新金标版本（唯一）">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="填写本次版本编号"
          />
        </Field>
        <p className="muted">确认人员：{actor?.name ?? '未选择'} · 需要管理员角色</p>
        {!eligible.length ? (
          <Empty
            title="暂无符合条件的案例"
            description="先提交必要数量的独立人工标注，并逐维度保存人工裁定。"
          />
        ) : (
          <>
            <label className="check-row">
              <input
                type="checkbox"
                checked={selected.length === eligible.length}
                onChange={(e) =>
                  setSelected(e.target.checked ? eligible.map((c) => c.case_id) : [])
                }
              />
              全选已裁定案例
            </label>
            <div className="selection-list">
              {eligible.map((c) => (
                <label className="check-row" key={c.case_id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(c.case_id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, c.case_id]
                          : selected.filter((x) => x !== c.case_id),
                      )
                    }
                  />
                  <span className="mono">{c.case_id}</span>
                  <span>{c.scene}</span>
                  <Badge tone="green">
                    <Check size={12} />
                    已裁定
                  </Badge>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="notice">
          <ShieldCheck size={17} />
          <span>
            发布表示人工确认所选案例的上下文、最终参考分、裁定依据和业务规则核验记录。后续修改需发布新版本。
          </span>
        </div>
        <div className="modal-actions">
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button
            variant="primary"
            disabled={busy || actor?.role !== 'admin' || !selected.length}
            onClick={async () => {
              if (
                await mutate('发布金标版本', name, (w) => {
                  w.goldVersions.push(
                    createGold(w, selected, rubric.version, name.trim(), actor!.id, now()),
                  );
                })
              ) {
                setVersion(name.trim());
                setOpen(false);
                setName('');
              }
            }}
          >
            <LockKeyhole size={15} />
            确认并发布 {selected.length} 条
          </Button>
        </div>
      </Modal>
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={'金标记录 · ' + (detail?.case.case_id ?? '')}
        wide
      >
        {detail && (
          <>
            <div className="notice">此记录是发布时的独立快照，后续工作区变更不影响此版本。</div>
            <CaseContext value={detail.case} />
            <h3>人工参考评分</h3>
            {detail.rubric.dimensions.map((d) => (
              <div className="gold-rating" key={d.id}>
                <strong>
                  {d.name} ·{' '}
                  {detail.ratings[d.id].score === 'NA' ? 'N/A' : detail.ratings[d.id].score} ·{' '}
                  {d.weight}%
                </strong>
                <p>{detail.ratings[d.id].reason}</p>
                <small>{detail.ratings[d.id].evidence.note}</small>
              </div>
            ))}
            <h3>完整标注与裁定历史</h3>
            <details>
              <summary>查看发布时记录</summary>
              <pre>
                {JSON.stringify(
                  {
                    annotations: detail.annotations,
                    adjudication: detail.adjudication,
                    confirmed_by: detail.confirmed_by,
                    confirmed_at: detail.confirmed_at,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </>
        )}
      </Modal>
    </>
  );
}
