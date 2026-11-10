import { useEffect, useState } from 'react';
import {
  Activity,
  AudioLines,
  BarChart3,
  BookOpenCheck,
  ChevronDown,
  ChevronsUpDown,
  Database,
  FileChartColumnIncreasing,
  GitCompareArrows,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  Settings,
  ShieldCheck,
  Sun,
  X,
  CircleHelp,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { repository } from './storage';
import type { Workspace } from './model';
import { AppContext } from './context';
import { DatasetPage } from './dataset';
import { HumanPage, ReviewPage } from './evaluation';
import { GoldPage } from './gold';
import { JudgePage, OverviewPage, ReportsPage } from './analytics';
import { RubricPage, SettingsPage } from './configuration';
import { Button, Modal } from './components/ui';
const pages = [
  {
    id: 'overview',
    en: 'Overview',
    name: '评测总览',
    desc: '掌握评测进展，建立可靠的质量基线。',
    icon: LayoutDashboard,
  },
  {
    id: 'dataset',
    en: 'Dataset',
    name: '评测集',
    desc: '集中管理音乐推荐上下文与待评估输出。',
    icon: Database,
  },
  {
    id: 'human',
    en: 'Human Evaluation',
    name: '人工评估',
    desc: '依据统一 Rubric，记录独立且可追溯的人工判断。',
    icon: BookOpenCheck,
  },
  {
    id: 'review',
    en: 'Disagreement Review',
    name: '分歧复核',
    desc: '对照独立评分、核验证据，形成最终人工裁定。',
    icon: GitCompareArrows,
  },
  {
    id: 'gold',
    en: 'Gold Set',
    name: '金标集',
    desc: '发布经人工确认、可追溯且可复现的参考标准。',
    icon: ShieldCheck,
  },
  {
    id: 'judge',
    en: 'Judge Calibration',
    name: '评估器校准',
    desc: '比较离线 Judge 评分与人工金标的一致性。',
    icon: Activity,
  },
  {
    id: 'reports',
    en: 'Reports',
    name: '评测报告',
    desc: '分析覆盖、质量、评分一致性与主要问题。',
    icon: FileChartColumnIncreasing,
  },
  {
    id: 'rubric',
    en: 'Rubric Management',
    name: '评分标准',
    desc: '维护业务评分维度、标准与可追溯版本。',
    icon: BarChart3,
  },
  {
    id: 'settings',
    en: 'Settings',
    name: '系统设置',
    desc: '管理本地人员、评估规则、备份与工作区数据。',
    icon: Settings,
  },
];
function currentPage() {
  const id = location.hash.slice(1);
  return pages.some((p) => p.id === id) ? id : 'overview';
}
export default function App() {
  const [w, setW] = useState<Workspace | null>(null),
    [fatal, setFatal] = useState(''),
    [page, setPage] = useState(currentPage),
    [actorId, setActor] = useState(localStorage.getItem('music-actor') ?? ''),
    [rv, setRv] = useState(localStorage.getItem('music-rubric') ?? '1.0.0'),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(null),
    [dark, setDark] = useState(localStorage.getItem('music-theme') === 'dark'),
    [mobile, setMobile] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  function guarded(action: () => void) {
    if (hasUnsavedChanges) setPendingAction(() => action);
    else action();
  }
  const notify = (message: string, error = false) => setToast({ message, error });
  useEffect(() => {
    repository
      .read()
      .then(setW)
      .catch((e) => setFatal(String(e)));
    const handler = () => setPage(currentPage());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('music-theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    const refresh = () =>
      repository
        .read()
        .then((value) =>
          setW((previous) =>
            !previous || value.revision !== previous.revision ? value : previous,
          ),
        )
        .catch((e) => notify(String(e), true));
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  function navigate(id: string) {
    if (id === page) return;
    guarded(() => {
      location.hash = id;
      setMobile(false);
      window.scrollTo(0, 0);
    });
  }
  function setActorId(id: string) {
    if (id === actorId) return;
    guarded(() => {
      setActor(id);
      localStorage.setItem('music-actor', id);
    });
  }
  function setRubricVersion(v: string) {
    if (v === rv) return;
    guarded(() => {
      setRv(v);
      localStorage.setItem('music-rubric', v);
    });
  }
  async function mutate(action: string, entity: string, fn: (w: Workspace) => void) {
    setBusy(true);
    try {
      const value = await repository.mutate(actorId || 'local-workspace', action, entity, fn);
      setW(value);
      notify(action + '成功');
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (fatal)
    return (
      <main className="fatal">
        <h1>无法打开本地数据工作区</h1>
        <p>请确认浏览器允许 IndexedDB 存储，并保留现有站点数据后重试。</p>
        <pre>{fatal}</pre>
        <Button onClick={() => location.reload()}>重新连接</Button>
      </main>
    );
  if (!w)
    return (
      <main className="loading">
        <AudioLines size={32} />
        <p>正在打开本地评测工作区…</p>
      </main>
    );
  const rubric = w.rubrics.find((r) => r.version === rv) ?? w.rubrics[0],
    actor = w.reviewers.find((r) => r.id === actorId),
    meta = pages.find((p) => p.id === page) ?? pages[0];
  const body = {
    overview: <OverviewPage />,
    dataset: <DatasetPage />,
    human: <HumanPage />,
    review: <ReviewPage />,
    gold: <GoldPage />,
    judge: <JudgePage />,
    reports: <ReportsPage />,
    rubric: <RubricPage />,
    settings: <SettingsPage />,
  }[page];
  return (
    <AppContext.Provider
      value={{
        w,
        rubric,
        actor,
        actorId,
        setActorId,
        rubricVersion: rubric.version,
        setRubricVersion,
        mutate,
        notify,
        busy,
        setHasUnsavedChanges,
        navigate,
      }}
    >
      <Modal
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        title="有未保存的人工评分"
        description="请先保存草稿，或明确放弃修改后再离开评分上下文。"
      >
        <div className="modal-actions">
          <Button onClick={() => setPendingAction(null)}>继续评分</Button>
          <Button
            variant="danger"
            onClick={() => {
              setHasUnsavedChanges(false);
              const action = pendingAction;
              setPendingAction(null);
              action?.();
            }}
          >
            放弃修改并继续
          </Button>
        </div>
      </Modal>
      <div className="app-shell">
        <aside className={'sidebar ' + (mobile ? 'visible' : '')}>
          <a
            href="#overview"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              navigate('overview');
            }}
          >
            <span className="brand-mark">
              <AudioLines size={23} />
            </span>
            <span>
              Music Eval<span>AI EVALUATION PLATFORM</span>
            </span>
          </a>
          <div className="workspace-switch">
            <span className="workspace-icon">M</span>
            <div>
              <strong>音乐推荐质量工作区</strong>
              <small>本地数据 · 文件交换</small>
            </div>
            <ChevronsUpDown size={14} />
          </div>
          <div className="nav-caption">WORKSPACE</div>
          <nav>
            {pages.slice(0, 7).map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(p.id)}
                className={page === p.id ? 'active' : ''}
              >
                <p.icon size={17} />
                <span>
                  {p.name}
                  <small>{p.en}</small>
                </span>
                {page === p.id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="nav-caption config-caption">CONFIGURATION</div>
          <nav>
            {pages.slice(7).map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(p.id)}
                className={page === p.id ? 'active' : ''}
              >
                <p.icon size={17} />
                <span>
                  {p.name}
                  <small>{p.en}</small>
                </span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div>
              <span className="status-dot" />
              <span>数据仅保存在此浏览器</span>
            </div>
            <p>
              请定期导出备份。
              <br />
              工作区不会自动跨设备同步。
            </p>
            <button onClick={() => navigate('settings')}>
              <CircleHelp size={15} />
              使用说明与数据管理
              <ChevronDown size={13} />
            </button>
          </div>
        </aside>
        {mobile && (
          <button
            className="mobile-backdrop"
            aria-label="关闭导航"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <Button
                variant="ghost"
                className="mobile-menu"
                aria-label="打开导航"
                onClick={() => setMobile((v) => !v)}
              >
                <Menu size={19} />
              </Button>
              <PanelLeftClose size={16} className="desktop-icon" />
              <span>工作区</span>
              <span className="breadcrumb-slash">/</span>
              <strong>{meta.en}</strong>
            </div>
            <div className="topbar-actions">
              <span className="local-label">
                <span className="status-dot" />
                本地存储
              </span>
              <select
                aria-label="当前 Rubric 版本"
                value={rubric.version}
                onChange={(e) => setRubricVersion(e.target.value)}
              >
                {w.rubrics.map((r) => (
                  <option key={r.version} value={r.version}>
                    Rubric {r.version}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                aria-label={dark ? '切换浅色主题' : '切换深色主题'}
                onClick={() => setDark(!dark)}
              >
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </Button>
              <select
                aria-label="当前评估员"
                value={actor?.id ?? ''}
                onChange={(e) => setActorId(e.target.value)}
              >
                <option value="">选择当前身份</option>
                {w.reviewers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ·{' '}
                    {p.role === 'admin' ? '管理员' : p.role === 'reviewer' ? '复核人员' : '评估员'}
                  </option>
                ))}
              </select>
              <span className="avatar">{actor?.name.slice(0, 1) ?? '人'}</span>
            </div>
          </header>
          <main className="main-content">
            <div className="page-heading">
              <div className="page-eyebrow">{meta.en.toUpperCase()}</div>
              <h1>{meta.name}</h1>
              <p>{meta.desc}</p>
            </div>
            {body}
            <footer className="main-footer">
              <span>AI Music Evaluation Platform</span>
              <span>本地工作区 · 版本 1.0.0</span>
            </footer>
          </main>
        </div>
        {toast && (
          <div
            role={toast.error ? 'alert' : 'status'}
            className={'toast ' + (toast.error ? 'error' : 'success')}
          >
            {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{toast.message}</span>
            <button aria-label="关闭提示" onClick={() => setToast(null)}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
