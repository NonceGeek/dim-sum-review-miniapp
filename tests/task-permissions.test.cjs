const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPage, option, event, clone } = require('./helpers/task-page.cjs');

// Exercise getAuthCorpus through getTask rather than duplicating its permission algorithm.
const writeOriginal = [{ category_name: 'corpus-a', permission: 'WRITE' }];
const writeBaseline = [{ category_name: 'baseline-b', permission: 'WRITE' }];
const cases = [
  { label: '系统管理员覆盖普通角色和空授权', user: { role: 'TAGGER_OUTSOURCING', isSystemAdmin: true }, allowed: [], edit: [true, true, true], add: true, remove: true },
  { label: '研究员无需语料库 WRITE 授权可编辑全部来源并添加方案', user: { role: 'RESEARCHER' }, allowed: [], edit: [true, true, true], add: true, remove: false },
  ...['TAGGER_PARTNER', 'TAGGER_OUTSOURCING'].flatMap(role => [
    { label: `${role} 无授权仅可编辑 AI 建议`, user: { role }, allowed: [], edit: [false, true, false] },
    { label: `${role} 只读语料库不授予编辑权`, user: { role }, allowed: [{ category_name: 'corpus-a', permission: 'READ' }], edit: [false, true, false] },
    { label: `${role} WRITE 原语料库可编辑原内容`, user: { role }, allowed: writeOriginal, edit: [true, true, false] },
    { label: `${role} WRITE 基线库可编辑基线方案`, user: { role }, allowed: writeBaseline, edit: [false, true, true] },
    { label: `${role} 无关语料库授权不会误授予权限`, user: { role }, allowed: [{ category_name: 'unrelated', permission: 'WRITE' }], edit: [false, true, false] },
    { label: `${role} 同时授权两个来源`, user: { role }, allowed: [...writeOriginal, ...writeBaseline], edit: [true, true, true] },
  ]),
  { label: '未知角色有 WRITE 也只编辑 AI 建议', user: { role: 'UNKNOWN' }, allowed: [...writeOriginal, ...writeBaseline], edit: [false, true, false] },
  { label: '无角色不提升权限', user: {}, allowed: writeOriginal, edit: [false, true, false] },
];
function response(violationType) {
  const record = option().record;
  return {
    context: { corpusName: 'corpus-a', text: '好嘢', category: { name: '建筑', parent: { name: '文化' } } },
    violationType, resolvedAt: '2026-10-15T00:00:00Z',
    suggestions: [
      { kind: 'original', record: clone(record), value: 'hou2' },
      { kind: 'llm', record: clone(record), value: 'hou3' },
      { kind: 'baseline', lexiconBaseCorpusName: 'baseline-b', record: clone(record), value: 'hou4' },
    ],
  };
}
for (const rule of cases) {
  for (const violationType of ['data_review', 'phonetic_mismatch']) {
    test(`${rule.label} / ${violationType}`, async () => {
      const { page, calls } = createPage({ user: { id: 'reviewer', ...rule.user }, storage: { allowedCorpora: rule.allowed }, request: async () => response(violationType) });
      await page.getTask('task-1');
      assert.equal(calls.toasts.length, 0, '加载失败不应伪装成权限通过');
      assert.deepEqual(clone(page.data.taskDetail.map(t => t.source)), ['corpus-a', 'llm', 'baseline-b']);
      assert.deepEqual(clone(page.data.taskDetail.map(t => t.canEdit)), rule.edit);
      assert.equal(Boolean(page.data.corpus.canAdd), Boolean(rule.add));
      assert.equal(Boolean(page.data.corpus.canDelete), Boolean(rule.remove));
    });
  }
  test(`${rule.label}：他人任务禁止编辑、分类和标签操作`, async () => {
    const { page, calls } = createPage({ user: { id: 'reviewer', ...rule.user }, storage: { allowedCorpora: rule.allowed }, data: { isOwner: false }, request: async () => response('data_review') });
    await page.getTask('task-1');
    assert.deepEqual(clone(page.data.taskDetail.map(t => t.canEdit)), [false, false, false]);
    const before = clone(page.data.taskDetail); const requestCount = calls.requests.length;
    for (let i = 0; i < 3; i++) {
      page.data.currentIndex = i;
      await page.onFieldLongPress(event({ option: i, field: 'classification', index: 0, parentindex: 0 }));
      await page.onOpenTags(event({ option: i }));
      page.onTagEditLongPress(event({ option: i, card: 0 }));
      page.onRemoveTaskTag(event({ option: i, id: 'some-tag' }));
    }
    assert.equal(calls.requests.length, requestCount);
    assert.equal(page.data.fieldEditor.visible, false);
    assert.equal(page.data.tagPickerVisible, false);
    assert.equal(page.data.tagEditingKey, '');
    assert.deepEqual(clone(page.data.taskDetail), before);
  });
}
for (const [label, userId, expected] of [['本人入口', 'reviewer', true], ['他人入口', 'other', false], ['默认入口', undefined, true]]) {
  test(`页面加载推导任务归属：${label}`, async () => {
    const { page } = createPage();
    // Isolate onLoad ownership from fetching, already covered by the matrix above.
    page.getTask = async () => {}; page.loadClassificationOptions = async () => true;
    await page.onLoad({ taskId: 'task-1', status: 'notified', userId });
    assert.equal(page.data.isOwner, expected);
  });
}
test('允许语料库缓存缺失时使用 globalData 授权', async () => {
  const { page } = createPage({ user: { id: 'reviewer', role: 'TAGGER_PARTNER' }, globalData: { allowedCorpora: writeOriginal }, request: async () => response('data_review') });
  await page.getTask('task-1');
  assert.deepEqual(clone(page.data.taskDetail.map(t => t.canEdit)), [true, true, false]);
});
test('空缓存优先，不回退到过时的 globalData WRITE 授权', async () => {
  const { page } = createPage({ user: { id: 'reviewer', role: 'TAGGER_PARTNER' }, storage: { allowedCorpora: [] }, globalData: { allowedCorpora: writeOriginal }, request: async () => response('data_review') });
  await page.getTask('task-1');
  assert.deepEqual(clone(page.data.taskDetail.map(t => t.canEdit)), [false, true, false]);
});
for (const role of ['RESEARCHER', 'TAGGER_PARTNER', 'TAGGER_OUTSOURCING']) {
  test(`${role} 已完成任务保持只读，编辑入口不触发接口`, async () => {
    const data = response('data_review'); data.selectedSuggestion = data.suggestions[1];
    const { page, calls } = createPage({ user: { id: 'reviewer', role }, storage: { allowedCorpora: writeOriginal }, data: { status: 'completed' }, request: async () => data });
    await page.getTask('task-1'); assert.equal(page.data.taskDetail.length, 1);
    const before = clone(page.data.taskDetail); const count = calls.requests.length;
    await page.onFieldLongPress(event({ option: 0, field: 'definition', parentindex: 0, index: 1 }));
    await page.onOpenTags(event({ option: 0 }));
    page.onTagEditLongPress(event({ option: 0, card: 0 }));
    assert.equal(page.data.fieldEditor.visible, false); assert.equal(page.data.tagPickerVisible, false);
    assert.equal(calls.requests.length, count); assert.deepEqual(clone(page.data.taskDetail), before);
  });
}
