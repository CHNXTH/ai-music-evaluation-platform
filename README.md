# AI Music Evaluation Platform

AI 音乐推荐评估平台。一个可直接使用的本地数据工作区，支持评测集管理、独立人工评估、分歧复核、金标发布、离线 Judge 校准与评测报告。

## 运行与部署

- 使用 Node.js 22.22 或更新的 22.x 版本。
- `npm ci` 安装锁定依赖。
- `npm run dev` 启动开发服务，访问终端显示的 `/ai-music-evaluation-platform/` 路径。
- `npm test` 运行单元及组件交互测试。
- `npm run typecheck` 检查 TypeScript。
- `npm run build` 生成 `dist/`。
- `npx playwright install chromium` 安装浏览器，`npm run test:e2e` 执行浏览器流程测试。
- `npm run preview` 预览生产构建。

GitHub Actions 在 main 推送后执行单元测试、类型检查、构建与 Chromium 流程测试，再上传并部署 `dist/` 至 GitHub Pages。Vite base 固定为 `/ai-music-evaluation-platform/`。使用 hash 导航，刷新任一页面不会请求不存在的服务端路由。Pages 的发布源需设为 GitHub Actions。

## 工作区与隐私

React + TypeScript + Vite、Tailwind CSS、采用 shadcn/ui 组件模式的 Radix Dialog 与通用控件、Lucide、Recharts、Dexie IndexedDB、Zod、Papa Parse。页面初始为空，只有通用 Rubric 与默认评测集，不预装任何业务评分。没有外部 API、遥测、登录服务或音乐资源采集功能。试听仅导航至用户自己提供的 HTTP / HTTPS 链接。

数据保存在当前浏览器、当前网站源的 IndexedDB；深色偏好、当前人员和报告人工结论使用同源 localStorage。不会自动跨设备同步。浏览器清理站点数据会删除记录，建议定期导出工作区 JSON。导出文件可能含敏感业务信息，应由使用者妥善保管，不能提交到公开仓库。

本地人员角色是操作流程配置，**不提供身份认证或安全隔离**。同一浏览器使用者可以切换身份。真正独立标注应在不同人员各自浏览器中完成，再以文件交换。未来远程数据层需同时实现服务端认证、授权、审计和并发控制，不能只依赖前端角色。

## 完整使用流程

1. **设置人员**：系统设置中添加管理员、不同评估员及复核人员。人员 ID 是跨工作区的稳定身份标识，不同人员不得复用 ID。
2. **准备案例**：评测集中新建评测集与案例，或导入 JSON / CSV。导入前逐字段映射。整批校验失败时不写入任何案例。Case ID 必须唯一；已开始标注的案例内容锁定，修改时创建新 ID。
3. **分发任务**：管理员完成数据与 Rubric 配置后，在尚无标注时导出完整工作区备份。各评估员在自己的空工作区恢复该文件并选择自己的身份。不要分发其他人员已经评分的工作区。
4. **独立评分**：人工评估采用完整上下文与 Rubric 左右分栏。逐维度选择 1–5 分并填写理由；N/A 需标准允许且原因完整。可选择具体歌曲 ID 及问题证据，记录业务否决项。保存草稿后可刷新继续，正式提交后锁定。Alt + 1–5 为当前聚焦维度评分，Alt + 左右方向键切换案例。编辑文本时不会触发这些快捷键。
5. **合并标注**：每名评估员在人工评估页导出自己的 JSON 标注，管理员在自己的工作区导入。文件带完整案例、Rubric 与人员 ID 用于核验。完全相同的标注可重复导入；内容冲突、同人重复评分、不同案例内容或 Rubric 内容均拒绝，整批回滚。交换文件中的新人员只作为评估员加入，不提升权限。
6. **人工复核**：切换复核人员或管理员，至少两名不同评估员提交后进入复核。查看每个维度全部评估员的评分、理由和证据，逐维度填写最终参考分及裁定依据，再确认业务规则核验结论。阈值只定义重点复核优先级，所有维度均需明确人工确认，不自动取平均值。
7. **发布金标**：管理员在金标集选择已裁定案例，输入唯一版本并确认发布，可单条或批量发布。每个版本保留案例、Rubric、全部已提交标注、裁定与确认信息的独立快照，没有覆盖或编辑旧版本的入口。新增评估员提交后旧裁定不再覆盖当前全部提交，需要重新裁定才能再发布，旧金标保持原状。
8. **导入 Judge**：离线生成 Judge 结果，在评估器校准页导入，选择金标、模型、Judge 版本、业务场景和维度。查看四项指标、分维度结果、分数分布、混淆矩阵、版本/模型对比及高估低估的理由差异。
9. **导出报告**：报告页选择场景、金标及 Judge 模型版本，查看人工均分、覆盖、分歧与人工标记的业务问题。填写人工结论，导出 JSON / CSV 或打印保存 PDF。工作区备份与标注交换文件用途不同，不可互相替代。

## 文件约定

### 评测案例 JSON / CSV

JSON 顶层为案例对象数组，也接受 `{ "cases": [...] }`。CSV 使用首行字段名；支持导入字段映射。必须包含 `case_id`、`scene`、`songs`。`songs` 为歌曲对象数组，CSV 中使用 JSON 数组字符串。`tags` 也采用 JSON 数组。缺失偏好、曲风、音乐链接等保持为空，界面显示「未提供」。时间为带时区 ISO 8601。

案例完整字段：`case_id`、`dataset_id`、`scene`、`weather`、`atmosphere`、`time_context`、`destination_poi_type`、`user_preferences`、`candidate_sources`、`songs`、`playlist_title`、`playlist_description`、`info`、`color_id`、`tags`、`workflow_version`、`created_at`。

歌曲字段：`song_id`、`song_name`（必填）、`singer`、`album`、`source`、`genre`、`mood`、`duration`、`music_url`。上下文中的偏好与来源信息为文本，可保存结构化信息的文字表达。导入目标评测集由字段映射窗口选择。音乐链接只允许 HTTP / HTTPS，不根据名称判定歌曲是否存在或可播放。

案例 JSON / CSV 导出保存所有字段，可重新导入空评测集。为避免电子表格公式执行，CSV 导出对以 `= + - @` 等起始的文本进行引号转义；需要字节一致往返时使用 JSON。

### 标注交换 JSON

格式标识 `music-annotations-v1`，包含 `cases`、`rubrics`、`reviewers`、`annotations`。只导出当前人员已经提交的标注。JSON 是合并格式；标注 CSV 是逐维度分析格式，不能作为合并文件。

### Judge JSON / CSV

每条记录对应一个案例、标准、维度及模型版本，必须包含：

| 字段                 | 类型与约束                       |
| -------------------- | -------------------------------- |
| case_id              | 已发布金标的案例 ID              |
| judge_model          | 模型名称                         |
| judge_version        | 模型/Prompt 评估配置版本         |
| rubric_version       | 与金标完全一致的 Rubric 版本     |
| dimension_id         | 维度稳定 ID                      |
| judge_score          | 1–5 整数，CSV 数字文本会严格校验 |
| judge_reason         | 评分理由，缺失时保留为空         |
| evaluation_timestamp | 带时区 ISO 8601 时间             |

默认维度 ID：`scene`、`preference`、`quality`、`coherence`、`expression`。

同一 `case_id + judge_model + judge_version + rubric_version + dimension_id` 只能导入一条评分。重新运行应使用新的 Judge 版本，避免重复记录扩大样本数。未知 Case ID、标准版本、维度或人工 N/A 记录会保留但不进入有效配对，在校准页显示未匹配计数。

### Rubric JSON

评分标准页支持配置编辑、导入和导出。编辑会创建新版本，不覆盖旧版本。每个维度含稳定 ID、名称、权重、评估重点、重要性、五条 1–5 分标准、N/A 开关与规则、正例、反例、边界案例。`importance` 为 Essential、Important、Optional、Veto。总权重必须为 100%。业务规则可设置 `song_count`、`duplicate_id`、`missing_id` 或 `manual`，并启用/停用。

重要性级别用于表达 Rubric 语义；最终参考评分仍需人工裁定。业务否决项单独核验并记录处理结论。错误输出也可以作为带完整裁定理由的低质量金标保留，不自动删除或强制综合分归零。

### 完整备份

完整工作区包含 schema_version、评测集、案例、Rubric、人员、标注、裁定、金标版本、Judge、规则配置与审计。只允许恢复到空业务工作区，避免覆盖已经发布的金标。恢复执行 Zod 结构验证、唯一 ID、关联、评分完整性、裁定覆盖与综合分核验。人工报告结论单独随报告导出，不包含在工作区备份内。

## 计算口径

- 人工综合分 = `Σ(score × weight) / Σ(有效数值维度 weight)`。N/A 和未评分均不作为 0 分。未评分维度在正式提交时被拒绝，全部 N/A 不能提交。
- 完成人工标注 Case：同一 Rubric 已达到设置中的独立提交数量。待评估数量为总案例减已完成数量。
- 待复核 Case：达到独立提交数量且没有覆盖全部当前提交的人工裁定。分数低于分歧阈值也不跳过复核。
- 人工一致性：同 Case、同 Rubric、不同评估员之间所有有效数值维度配对的完全一致率及平均绝对分差。三人以上采用所有无序人员配对。
- Exact Agreement = 完全相同评分的配对数 / 有效配对数。
- Within-1 Agreement = 绝对分差 ≤ 1 的配对数 / 有效配对数。
- MAE = 所有有效配对绝对分差的平均值。
- QWK 使用 1–5 级平方距离权重：`1 - observed / expected`。expected 基于两侧边际分布的独立乘积计算；少于两条有效配对或 expected 为 0 时显示原因。多维度合并指标按维度配对计算，不代表独立案例置信区间。
- 综合分分布按最近整数四舍五入分组，均分使用原始浮点数。
- 总览使用最新金标与首个已导入 Judge 模型版本，并显示该模型版本；校准与报告可明确选择模型版本，避免混合不同模型的评分。
- 报告 Bad Case 分类为人工评分中显式标记的业务规则计数，同案例多名人员的标记分别计数，不宣称这是唯一问题案例数。

## 模块与扩展

- `src/model.ts`：类型与 Zod 数据契约、默认业务评分标准。
- `src/domain.ts`：纯函数评分、状态、裁定、金标快照与校准计算。
- `src/storage.ts`：`WorkspaceRepository` 接口、Dexie 原子事务与未来授权接口。
- `src/files.ts`：JSON / CSV、字段映射与独立标注交换。
- `src/evaluation.tsx`：评分与复核工作台。
- `src/gold.tsx`、`src/analytics.tsx`：金标、校准、总览与报告。
- `src/configuration.tsx`：Rubric、人员、备份与规则配置。
- `src/components/ui.tsx`：统一按钮、空状态、对话框、表单与导出控件。

数据库以单工作区事务实现整批回滚和多标签写入串行化；页面在重新获得焦点时读取最新修订。数据量非常大时可用分表与查询索引优化，或实现远程 Repository；需保持不可变金标与标准契约。

## 测试范围

Vitest 与 React Testing Library 覆盖评分及 N/A、状态流转、独立标注唯一性、分歧阈值、人工裁定权限与门槛、金标不可变快照、版本冲突、JSON / CSV 校验与交换、Judge 配对及全部统计口径、IndexedDB 重开持久化与事务回滚。

Playwright 使用测试专用输入，分别建立两个独立浏览器工作区，验证案例导入、刷新、评分草稿与提交、文件交换合并、未完成复核禁止金标、人工裁定、金标发布、Judge 导入和分析、报告下载、九页面导航、深色持久化、空状态、异常文件与多种屏幕宽度。所有测试输入仅存在测试环境，不初始化进产品。
