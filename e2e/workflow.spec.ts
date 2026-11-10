import { expect, test, type Page } from '@playwright/test';
const stamp = '2026-11-11T00:00:00Z';
const evaluationCase = {
  case_id: 'QA-C001',
  scene: '通勤',
  atmosphere: '舒缓',
  time_context: '工作日早晨',
  user_preferences: '器乐',
  songs: Array.from({ length: 12 }, (_, i) => ({
    song_id: 'QA-S' + (i + 1),
    song_name: '质量验证曲目 ' + (i + 1),
    singer: '验证歌手',
    genre: '器乐',
    mood: '舒缓',
  })),
  playlist_title: '通勤质量验证',
  workflow_version: 'qa-1',
};
const dimensions = [
  '场景匹配度',
  '用户偏好匹配',
  '歌曲质量与多样性',
  '歌单整体连贯性',
  'AI 文案与 HMI 表达',
];
async function nav(page: Page, name: string) {
  await page.locator('aside nav').getByRole('button', { name, exact: false }).click();
}
async function person(page: Page, id: string, name: string, role: string) {
  await page.getByLabel('人员 ID', { exact: true }).fill(id);
  await page.getByLabel('人员姓名').fill(name);
  await page.getByLabel('本地角色').selectOption(role);
  await page.getByRole('button', { name: '添加人员', exact: true }).click();
  await expect(page.getByLabel('当前评估员')).toHaveValue(id);
}
async function score(page: Page, values: number[]) {
  for (let i = 0; i < dimensions.length; i++) {
    await page
      .getByRole('button', { name: dimensions[i] + ' ' + values[i] + '分', exact: true })
      .click();
    await page
      .getByLabel(dimensions[i] + '评分理由', { exact: true })
      .fill('根据已提供场景与歌曲标签核验，记录评分依据。');
  }
}
async function submit(page: Page) {
  await page.getByRole('button', { name: '提交评分', exact: true }).click();
  await page.getByRole('button', { name: '确认提交', exact: true }).click();
  await expect(page.getByRole('button', { name: '提交评分', exact: true })).toBeDisabled();
}
async function download(page: Page, action: () => Promise<unknown>) {
  const promise = page.waitForEvent('download');
  await action();
  const d = await promise;
  return (await d.path())!;
}
async function upload(page: Page, label: string, value: unknown, name: string) {
  await page.getByLabel(label, { exact: true }).setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
}
test('完整独立标注交换、人工裁定、不可变金标与离线校准', async ({ page, browser }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('');
  await expect(page.getByRole('heading', { name: '评测总览', exact: true })).toBeVisible();
  await nav(page, '系统设置');
  await person(page, 'qa-admin', '质量管理员', 'admin');
  await person(page, 'qa-a', '评估人员 A', 'annotator');
  await person(page, 'qa-b', '评估人员 B', 'annotator');
  await page.getByLabel('当前评估员').selectOption('qa-admin');
  await nav(page, '评测集');
  await upload(page, '导入案例', [evaluationCase], 'cases.json');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '校验并导入', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'QA-C001', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'QA-C001', exact: true })).toBeVisible();
  await nav(page, '系统设置');
  const baseline = await download(page, () =>
    page.getByRole('button', { name: '导出完整工作区', exact: true }).click(),
  );
  await page.getByLabel('当前评估员').selectOption('qa-a');
  await nav(page, '人工评估');
  await expect(page.getByText('评估人员 B', { exact: true })).toHaveCount(0);
  await score(page, [3, 4, 4, 3, 5]);
  await page.getByLabel('当前评估员').selectOption('qa-b');
  await expect(page.getByRole('dialog', { name: '有未保存的人工评分' })).toBeVisible();
  await page.getByRole('button', { name: '继续评分', exact: true }).click();
  await expect(page.getByLabel('当前评估员')).toHaveValue('qa-a');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存评分草稿成功');
  await page.reload();
  await expect(page.getByRole('button', { name: '场景匹配度 3分', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await submit(page);
  await page.getByRole('button', { name: '导出我的标注', exact: true }).click();
  const aFile = await download(page, () =>
    page.getByRole('dialog').getByRole('button', { name: 'JSON', exact: true }).click(),
  );
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const independent = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
  const second = await independent.newPage();
  await second.goto(testInfo.project.use.baseURL as string);
  await nav(second, '系统设置');
  await second.getByLabel('恢复工作区备份', { exact: true }).setInputFiles(baseline);
  await expect(second.getByRole('status')).toContainText('恢复工作区备份成功');
  await second.getByLabel('当前评估员').selectOption('qa-b');
  await nav(second, '人工评估');
  await expect(second.getByRole('button', { name: '场景匹配度 3分', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await score(second, [4, 4, 3, 4, 5]);
  await submit(second);
  await second.getByRole('button', { name: '导出我的标注', exact: true }).click();
  const bFile = await download(second, () =>
    second.getByRole('dialog').getByRole('button', { name: 'JSON', exact: true }).click(),
  );
  await page.getByLabel('当前评估员').selectOption('qa-admin');
  await page.getByLabel('合并标注文件', { exact: true }).setInputFiles(bFile);
  await expect(page.getByRole('status')).toContainText('合并独立标注成功');
  await page.getByLabel('合并标注文件', { exact: true }).setInputFiles(aFile);
  await expect(page.getByRole('status')).toContainText('合并独立标注成功');
  await nav(page, '金标集');
  await page.getByRole('button', { name: '审核并发布版本', exact: true }).click();
  await expect(page.getByRole('heading', { name: '暂无符合条件的案例' })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await nav(page, '分歧复核');
  await expect(page.getByText('评估人员 A', { exact: true })).toBeVisible();
  await expect(page.getByText('评估人员 B', { exact: true })).toBeVisible();
  await score(page, [4, 4, 4, 4, 5]);
  await page.getByLabel('已核验全部规则及已报告问题，并在下方记录处理结论').check();
  await page
    .getByLabel('核验结论 / 裁定依据（必填）')
    .fill('核验数量与歌曲 ID 完整性，依据上下文确认最终参考分。');
  await page.screenshot({ path: 'outputs/review-workstation.png', fullPage: true });
  await page.getByRole('button', { name: '保存人工裁定', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存人工裁定成功');
  await nav(page, '金标集');
  await page.getByRole('button', { name: '审核并发布版本', exact: true }).click();
  await page.getByLabel('新金标版本（唯一）').fill('qa-gold-1');
  await page.getByLabel('全选已裁定案例').check();
  await page.getByRole('button', { name: '确认并发布 1 条', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('发布金标版本成功');
  const goldFile = await download(page, () =>
    page.getByRole('button', { name: 'JSON', exact: true }).click(),
  );
  expect(goldFile).toBeTruthy();
  await nav(page, '评估器校准');
  const judges = ['scene', 'preference', 'quality', 'coherence', 'expression'].map(
    (dimension_id, i) => ({
      case_id: 'QA-C001',
      judge_model: 'QA-Judge',
      judge_version: '1',
      rubric_version: '1.0.0',
      dimension_id,
      judge_score: [4, 3, 4, 4, 5][i],
      judge_reason: '独立质量验证评分',
      evaluation_timestamp: stamp,
    }),
  );
  await upload(page, '导入 Judge 评分', judges, 'judges.json');
  await expect(page.getByRole('status')).toContainText('导入 Judge 评分成功');
  await expect(page.locator('.metric').filter({ hasText: 'Exact Agreement' })).toContainText(
    '80.0%',
  );
  await expect(page.locator('.metric').filter({ hasText: 'Mean Absolute Error' })).toContainText(
    '0.20',
  );
  await page.reload();
  await expect(page.locator('.metric').filter({ hasText: 'Exact Agreement' })).toContainText(
    '80.0%',
  );
  await page.screenshot({ path: 'outputs/judge-calibration.png', fullPage: true });
  await nav(page, '评测报告');
  await page.getByLabel('人工评测结论').fill('本次验证完成了独立标注、人工裁定与评估器校准。');
  const reportDownload = await download(page, () =>
    page.getByRole('button', { name: 'JSON', exact: true }).click(),
  );
  expect(reportDownload).toBeTruthy();
  const csv = await download(page, () =>
    page.getByRole('button', { name: 'CSV', exact: true }).click(),
  );
  expect(csv).toBeTruthy();
  await page.screenshot({ path: 'outputs/evaluation-report.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-only')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await nav(page, '评测总览');
  await expect(page.locator('.metric').filter({ hasText: 'Dataset Case 总数' })).toContainText('1');
  await page.screenshot({ path: 'outputs/overview-with-data.png', fullPage: true });
  expect(errors).toEqual([]);
  await independent.close();
});
test('规范空状态、九个页面、平板与窄屏布局及深色主题', async ({ page }) => {
  await page.goto('');
  for (const name of [
    '评测集',
    '人工评估',
    '分歧复核',
    '金标集',
    '评估器校准',
    '评测报告',
    '评分标准',
    '系统设置',
    '评测总览',
  ]) {
    await nav(page, name);
    await expect(page.locator('h1')).toHaveText(name);
  }
  await page.screenshot({ path: 'outputs/overview-empty.png', fullPage: true });
  await page.getByRole('button', { name: '切换深色主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'outputs/overview-dark.png', fullPage: true });
  await page.getByRole('button', { name: '切换浅色主题' }).click();
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }
  await page.getByRole('button', { name: '打开导航' }).click();
  await nav(page, '评分标准');
  await expect(page.locator('h1')).toHaveText('评分标准');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'outputs/tablet-responsive.png', fullPage: true });
});
test('异常文件不会产生业务记录', async ({ page }) => {
  await page.goto('');
  await nav(page, '评测集');
  await page.getByLabel('导入案例', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: '尚无匹配的评测案例' })).toBeVisible();
  await nav(page, '评估器校准');
  await upload(page, '导入 Judge 评分', [{ case_id: 'invalid' }], 'invalid.json');
  await expect(page.getByRole('alert')).toContainText('第 1 行');
  await expect(page.getByRole('heading', { name: '暂无有效配对评分' })).toBeVisible();
});

test('关键页面可访问性审计', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await page.goto('');
  for (const name of ['评测总览', '评分标准', '系统设置']) {
    await nav(page, name);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    await page.getByRole('button', { name: '切换深色主题' }).click();
    await page.waitForTimeout(200);
    const dark = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(dark.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
      [],
    );
    await page.getByRole('button', { name: '切换浅色主题' }).click();
    await page.waitForTimeout(200);
  }
});
