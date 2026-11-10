import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RatingsEditor } from './evaluation';
import { caseSchema, defaultRubric, type Rating } from './model';
import { useState } from 'react';
afterEach(cleanup);
function Editor() {
  const r = defaultRubric();
  const [ratings, setRatings] = useState<Record<string, Rating>>(
    Object.fromEntries(
      r.dimensions.map((d) => [
        d.id,
        { score: null, reason: '', evidence: { song_ids: [], note: '' } },
      ]),
    ),
  );
  return (
    <>
      <RatingsEditor
        rubric={r}
        value={ratings}
        onChange={setRatings}
        caseValue={caseSchema.parse({ case_id: 'T', scene: '通勤', songs: [] })}
      />
      <output aria-label="当前场景评分">{ratings.scene.score ?? '尚未评分'}</output>
    </>
  );
}
describe('真实评分交互', () => {
  it('初始不默认评分，可选择 1 分并填写理由', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    expect(screen.getByLabelText('当前场景评分')).toHaveTextContent('尚未评分');
    await user.click(screen.getByRole('button', { name: '场景匹配度 1分' }));
    expect(screen.getByLabelText('当前场景评分')).toHaveTextContent('1');
    await user.type(screen.getByLabelText('场景匹配度评分理由'), '场景不匹配');
    expect(screen.getByLabelText('场景匹配度评分理由')).toHaveValue('场景不匹配');
    expect(screen.getByRole('button', { name: '场景匹配度 1分' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('N/A 保持独立状态并显示原因提示，标准可展开', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.click(screen.getByRole('button', { name: '场景匹配度 N/A' }));
    expect(screen.getByLabelText('当前场景评分')).toHaveTextContent('NA');
    expect(screen.getByLabelText('场景匹配度评分理由')).toHaveAttribute(
      'placeholder',
      '填写证据不足及 N/A 原因（必填）',
    );
    await user.click(screen.getAllByText('查看 1–5 分标准与判定边界')[0]);
    expect(screen.getByText('与目标场景和氛围明显冲突')).toBeVisible();
  });
});
