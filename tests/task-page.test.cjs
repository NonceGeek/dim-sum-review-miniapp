const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPage, option, event, deferred, clone } = require('./helpers/task-page.cjs');
const record = page => page.data.taskDetail[page.data.currentIndex].record;
const editor = { visible: true, option: 0, label: '分类', value: '文化 / 建筑', field: 'classification', parentindex: 0, index: 0 };
const tree = [{ id: 'p1', name: '文化', children: [{ id: 'c1', name: '建筑' }, { id: 'c2', name: '历史' }] }, { id: 'p2', name: '口语', children: [{ id: 'c3', name: '对话' }] }];

for (const [label, text, cards, expected] of [
  ['原文和粤音齐全', '好', [{ jyutping: 'hou2', blocks: [] }], true],
  ['缺原文', ' ', [{ jyutping: 'hou2', blocks: [] }], false],
  ['全部粤音为空', '好', [{ jyutping: ' ' }], false],
  ['没有卡片', '好', [], false],
  ['至少一个粤音有效', '好', [{ jyutping: '' }, { jyutping: 'hou2' }], true],
]) test(`提交按钮：${label}`, () => {
  const { page } = createPage({ data: { taskDetail: [option({ record: { text, data: cards } })] } });
  page.checkCanSubmit(); assert.equal(page.data.canSubmit, expected);
});

test('空任务列表不能提交', () => {
  const { page } = createPage({ data: { taskDetail: [] } });
  page.checkCanSubmit(); assert.equal(page.data.canSubmit, false);
});
test('长按编辑只修改当前选项，取消不保存', async () => {
  const { page } = createPage(); const before = clone(page.data.taskDetail);
  await page.onFieldLongPress(event({ option: 0, label: '解释', value: '解释', field: 'definition', parentindex: 0, index: 1 }));
  page.onFieldEditorInput(event({}, { value: '新解释' })); page.onFieldEditorClose();
  assert.deepEqual(clone(page.data.taskDetail), before);
  await page.onFieldLongPress(event({ option: 0, label: '解释', value: '解释', field: 'definition', parentindex: 0, index: 1 }));
  page.onFieldEditorInput(event({}, { value: '新解释' })); page.onFieldEditorSave();
  assert.equal(record(page).data[0].blocks[1].content, '新解释');
  assert.deepEqual(clone(page.data.taskDetail[1]), before[1]);
  assert.equal(page.data.fieldEditor.visible, false);
});
for (const [label, data, optionIndex] of [['已完成', { status: 'completed' }, 0], ['无编辑权限', { taskDetail: [option({ canEdit: false })] }, 0], ['非当前选项', {}, 1]]) {
  test(`长按编辑权限：${label}`, async () => {
    const { page } = createPage({ data });
    await page.onFieldLongPress(event({ option: optionIndex, field: 'definition', value: '旧' }));
    assert.equal(page.data.fieldEditor.visible, false);
  });
}
test('词组拒绝非汉字，粤音拒绝汉字，原文正常更新', () => {
  const { page, calls } = createPage(); const before = clone(record(page));
  page.onOriginalBaseFieldChange(event({ field: 'phrase', parentindex: 0, index: 1 }, 'abc'));
  page.onOriginalBaseFieldChange(event({ field: 'cantonesePronunciations', index: 0 }, '粤语'));
  assert.deepEqual(clone(record(page)), before); assert.equal(calls.toasts.length, 2);
  page.onOriginalBaseFieldChange(event({ field: 'originText' }, '修改原文'));
  assert.equal(record(page).text, '修改原文');
});
test('点击选项切换，重复事件不重复检查，无效索引忽略', () => {
  const { page, calls } = createPage(); page.data.tagEditingKey = '0:0';
  page.onOptionTap(event({ index: 1 })); assert.equal(page.data.currentIndex, 1);
  assert.equal(page.data.tagEditingKey, '');
  page.onSwiperChange(event({}, { current: 1 })); page.onOptionTap(event({ index: 99 }));
  assert.equal(calls.modals.length, 0); assert.equal(page.data.currentIndex, 1);
});
test('切换有修改的选项时取消保存，会恢复原内容', async () => {
  const { page, calls } = createPage(); record(page).text = '草稿';
  page.onOptionTap(event({ index: 1 })); assert.equal(page.data.currentIndex, 0);
  assert.equal(calls.modals.length, 1); await calls.modals[0].success({ cancel: true });
  assert.equal(page.data.currentIndex, 1); assert.equal(page.data.taskDetail[0].record.text, '好嘢');
});
test('删除字段和粤音卡片不影响其他选项', () => {
  const { page } = createPage(); const other = clone(page.data.taskDetail[1]);
  page.doDeleteBlock(event({ cardIndex: 0, blockIndex: 1 })); assert.equal(record(page).data[0].blocks.length, 1);
  page.doDeleteBlock(event({ cardIndex: 0 })); assert.equal(record(page).data.length, 0);
  assert.equal(page.data.canSubmit, false); assert.deepEqual(clone(page.data.taskDetail[1]), other);
});
test('上一粤音未填时阻止继续添加', () => {
  const { page, calls } = createPage(); record(page).data[0].jyutping = '';
  page.onAddNewCantonese(); assert.equal(record(page).data.length, 1); assert.match(calls.toasts[0].title, /粤拼/);
});
test('新增粤音保留已有内容', () => {
  const { page } = createPage(); const first = clone(record(page).data[0]);
  page.onAddNewCantonese(); assert.equal(record(page).data.length, 2);
  assert.deepEqual(clone(record(page).data[0]), first); assert.equal(record(page).data[1].new, true);
});

test('分类树恢复当前值、两级联动、选择后写入二级 ID', async () => {
  const { page } = createPage({ request: async () => ({ items: tree }) });
  await page.loadClassificationOptions();
  await page.onFieldLongPress(event({ ...editor, option: 0, value: '文化 / 历史' }));
  assert.deepEqual(clone(page.data.classificationValue), ['文化', '历史']);
  page.onClassificationPickerChange(event({}, { column: 0, value: ['口语', '历史'] }));
  assert.deepEqual(clone(page.data.classificationValue), ['口语', '对话']);
  page.onClassificationPickerConfirm(event({}, { value: ['口语', '对话'] }));
  assert.equal(record(page).categoryId, 'c3'); assert.equal(record(page).data[0].blocks[0].content, '口语 / 对话');
  assert.equal(page.data.showClassificationPicker, false);
});
test('分类取消和无效选择不修改内容', async () => {
  const { page } = createPage({ request: async () => tree }); await page.loadClassificationOptions();
  page.data.fieldEditor = clone(editor); const before = clone(record(page));
  page.onClassificationPickerConfirm(event({}, { value: ['文化', '不存在'] })); page.onClassificationPickerClose();
  assert.deepEqual(clone(record(page)), before);
});
test('自定义分类取消返回 picker 并保留选择', () => {
  const { page } = createPage({ data: { fieldEditor: editor, classificationValue: ['文化', '建筑'] } });
  page.onCustomClassification(); assert.equal(page.data.customClassificationParent, '文化');
  page.onFieldEditorClose(); assert.equal(page.data.showClassificationPicker, true);
  assert.deepEqual(clone(page.data.classificationValue), ['文化', '建筑']);
});
test('自定义分类按顺序创建两级，并使用返回的名称和 ID', async () => {
  const { page, calls } = createPage({ data: { fieldEditor: editor, customClassificationParent: ' 一级 ', customClassificationChild: ' 二级 ' }, request: async (_url, options) => ({ item: { id: options.data.parentId ? 'child' : 'parent', name: options.data.parentId ? '二级规范名' : '一级规范名' }, created: false }) });
  await page.onCustomClassificationSave();
  assert.deepEqual(calls.requests.slice(0, 2).map(x => x.data), [{ name: '一级', parentId: null }, { name: '二级', parentId: 'parent' }]);
  assert.equal(record(page).categoryId, 'child'); assert.equal(record(page).data[0].blocks[0].content, '一级规范名 / 二级规范名');
});
for (const failAt of [1, 2]) test(`分类创建第 ${failAt} 步失败不回填，保留输入供重试`, async () => {
  let n = 0; const { page } = createPage({ data: { fieldEditor: editor, customClassificationParent: '一', customClassificationChild: '二' }, request: async () => ++n === failAt ? { message: '创建失败' } : { item: { id: 'p' } } });
  const before = clone(record(page)); await page.onCustomClassificationSave();
  assert.deepEqual(clone(record(page)), before); assert.equal(page.data.fieldEditor.visible, true); assert.equal(page.data.classificationSaving, false);
});
test('分类输入缺失不请求，保存中重复点击不会重复创建', async () => {
  const d = deferred(); const { page, calls } = createPage({ data: { fieldEditor: editor }, request: () => d.promise });
  await page.onCustomClassificationSave(); assert.equal(calls.requests.length, 0);
  page.data.customClassificationParent = '一'; page.data.customClassificationChild = '二';
  const saving = page.onCustomClassificationSave(); await page.onCustomClassificationSave();
  page.onFieldEditorClose(); assert.equal(page.data.fieldEditor.visible, true); assert.equal(calls.requests.length, 1);
  d.reject(new Error('offline')); await saving;
});

test('标签默认展示，只有长按当前可编辑卡片才进入编辑', () => {
  const { page } = createPage(); assert.equal(page.data.tagEditingKey, '');
  page.onTagEditLongPress(event({ option: 1, card: 0 })); assert.equal(page.data.tagEditingKey, '');
  page.onTagEditLongPress(event({ option: 0, card: 1 })); assert.equal(page.data.tagEditingKey, '0:1');
});
test('标签搜索编码查询词，旧响应不会覆盖新响应', async () => {
  const slow = deferred(); const fast = deferred(); const { page, calls } = createPage({ data: { tagPickerVisible: true }, request: url => url.includes('slow') ? slow.promise : fast.promise });
  const a = page.loadTagOptions('slow'); const b = page.loadTagOptions('粤语 &');
  fast.resolve({ items: [{ id: '2', name: '新' }] }); await b;
  slow.resolve({ items: [{ id: '1', name: '旧' }] }); await a;
  assert.match(calls.requests[1].url, /%E7%B2%A4%E8%AF%AD%20%26/);
  assert.equal(page.data.tagOptions[0].name, '新'); assert.equal(page.data.tagLoading, false);
});
test('关闭标签选择器后忽略仍在途的请求', async () => {
  const d = deferred(); const { page } = createPage({ data: { tagPickerVisible: true }, request: () => d.promise });
  const loading = page.loadTagOptions(''); page.onTagPickerClose(); d.resolve({ items: [{ id: '1', name: '旧' }] }); await loading;
  assert.equal(page.data.tagOptions.length, 0); assert.equal(page.data.tagLoading, false);
});
test('搜索失败显示错误并结束加载', async () => {
  const { page } = createPage({ data: { tagPickerVisible: true }, request: async () => { throw new Error('离线'); } });
  await page.loadTagOptions(''); assert.equal(page.data.tagError, '离线'); assert.equal(page.data.tagLoading, false);
});
test('标签选择取消不写入，确认仅写当前选项，可清空', async () => {
  const { page } = createPage({ request: async () => ({ items: [{ id: '1', name: '粤语' }] }) });
  await page.onOpenTags(event({ option: 0 })); page.onTagToggle(event({ id: '1' })); page.onTagPickerClose();
  assert.equal(record(page).tagIds, undefined);
  await page.onOpenTags(event({ option: 0 })); page.onTagToggle(event({ id: '1' })); page.onTagPickerConfirm();
  assert.deepEqual(clone(record(page).tagIds), ['1']); assert.equal(page.data.taskDetail[1].record.tagIds, undefined);
  await page.onOpenTags(event({ option: 0 })); page.onTagDraftRemove(event({ id: '1' })); page.onTagPickerConfirm();
  assert.deepEqual(clone(record(page).tagIds), []);
});
test('创建标签复用重复 ID，失败不修改草稿', async () => {
  let fail = false; const { page } = createPage({ request: async (_u, o) => o.method ? fail ? { message: '失败' } : { item: { id: '1', name: '粤语' }, created: false } : { items: [] }, data: { tagPickerVisible: true, tagKeyword: ' #粤语 ', tagDraft: [{ id: '1', name: '粤语' }] } });
  await page.onCreateTag(); assert.equal(page.data.tagDraft.length, 1);
  fail = true; page.data.tagKeyword = '新'; await page.onCreateTag(); assert.equal(page.data.tagDraft.length, 1); assert.equal(page.data.tagCreating, false);
});
test('删除最后一个标签显式提交空 tagIds，已完成状态不允许删除', () => {
  const { page } = createPage(); record(page).tags = [{ id: '1', name: '粤语' }];
  page.data.status = 'completed'; page.onRemoveTaskTag(event({ option: 0, id: '1' })); assert.equal(record(page).tags.length, 1);
  page.data.status = 'notified'; page.onRemoveTaskTag(event({ option: 0, id: '1' })); assert.deepEqual(clone(record(page).tagIds), []);
});
test('从添加更多内容进入标签选择器，不生成 tags block', async () => {
  const { page } = createPage(); const before = clone(record(page).data);
  page.onPopupSelect(event({ value: 'tags' })); assert.equal(page.data.tagPickerVisible, true);
  assert.deepEqual(clone(record(page).data), before);
});

for (const [category, intensity, valid] of [['高兴', '强', true], ['', '', true], ['高兴', '', false], ['', '强', false]]) {
  test(`情感配对校验：${category || '空'}/${intensity || '空'}`, () => {
    const { page } = createPage(); record(page).data[0].blocks = [{ type: 'emotion', content: '语气', category, intensity }];
    assert.equal(page.checkEmotion(), valid);
  });
}
test('TDesign 情感与强度 picker 数组值写入正确字段', () => {
  const { page } = createPage(); record(page).data[0].blocks = [{ type: 'emotion', category: '', intensity: '' }];
  for (const [pickerType, value, key] of [['emotion', '高兴（happy）', 'category'], ['intensity', '强', 'intensity']]) {
    page.onShowPicker(event({ pickerType, cardIndex: 0, blockIndex: 0 }));
    page.onEmotionConfirm(event({}, { value: [value] })); assert.equal(record(page).data[0].blocks[0][key], value);
  }
});
test('提交仅发送选中方案，携带分类和标签 ID，过滤空数据且不改本地记录', async () => {
  const { page, calls } = createPage({ request: async () => ({ ok: true }) });
  const r = record(page); r.categoryId = 'c1'; r.tagIds = ['t1'];
  r.data[0].blocks.push({ type: 'other', content: ' ' }, { type: 'audio', url: 'audio.mp3' });
  r.data.push({ jyutping: '', blocks: [] }); const before = clone(page.data.taskDetail);
  await page.doSubmit(); const sent = calls.requests[0];
  assert.equal(sent.url, '/task/submit/task-1'); assert.equal(sent.method, 'POST');
  assert.equal(sent.data.actorRef, 'reviewer'); assert.equal(sent.data.selected.length, 1);
  assert.equal(sent.data.selected[0].record.categoryId, 'c1'); assert.deepEqual(sent.data.selected[0].record.tagIds, ['t1']);
  assert.equal(sent.data.selected[0].record.data.length, 1); assert.equal(sent.data.selected[0].record.data[0].blocks.length, 2);
  assert.deepEqual(clone(page.data.taskDetail), before);
});
test('不完整情感阻止请求，接口业务失败显示原因', async () => {
  const { page, calls } = createPage({ request: async () => ({ ok: false, details: { reason: '无权限' } }) });
  record(page).data[0].blocks = [{ type: 'emotion', content: '语气', category: '高兴', intensity: '' }];
  await page.doSubmit(); assert.equal(calls.requests.length, 0);
  record(page).data[0].blocks[0].intensity = '强'; await page.doSubmit(); assert.equal(calls.modals[0].content, '无权限');
});

test('录音期间禁止播放，没有音频时提示用户', () => {
  const { page, calls } = createPage(); page.data.recording = true;
  page.onPlayAudio(event({ url: 'audio.mp3' })); assert.equal(calls.toasts.length, 0);
  page.data.recording = false; page.onPlayAudio(event({ url: '' })); assert.equal(calls.toasts[0].title, '暂无录音');
});

// 已修复问题的回归用例。
test('纯情感字段缺强度也应阻止提交', () => {
  const { page } = createPage(); record(page).data[0].blocks = [{ type: 'emotion', category: '高兴', intensity: '' }];
  assert.equal(page.checkEmotion(), false);
});
test('新增粤音卡片应自动展开对应 panel', () => {
  const { page } = createPage(); page.onAddNewCantonese();
  assert.ok(page.data.expandedValues.includes(`card_${record(page).data.length - 1}`));
});
test('提交网络失败应结束加载并提示用户', async () => {
  const { page, calls } = createPage({ request: async () => { throw new Error('离线'); } });
  await page.doSubmit(); assert.equal(calls.loading.at(-1), 'hide'); assert.equal(calls.modals[0].content, '离线');
});

test('研究员新增方案使用 custom 并保留原记录标识，填写粤音后可直接确认提交', async () => {
  const { page, calls } = createPage({ user: { id: 'researcher', name: '研究员', role: 'RESEARCHER' }, request: async () => ({ ok: true }) });
  page.data.taskDetail[0].record.id = 123;
  page.data.taskDetail[0].record.uniqueId = 'record-uuid';
  page.data.taskDetail[0].record.categoryId = 'category-1';
  const original = clone(page.data.taskDetail[0]);
  page.onAddClick(); page.data.currentIndex = page.data.taskDetail.length - 1;
  const added = record(page);
  assert.equal(added.text, original.record.text);
  assert.equal(added.id, 123); assert.equal(added.uniqueId, 'record-uuid');
  assert.equal(added.categoryId, 'category-1');
  added.data[0].jyutping = 'hou2 je5';
  await page.onSubmit(); await calls.modals[0].success({ confirm: true });
  const selected = calls.requests[0].data.selected[0];
  assert.equal(selected.kind, 'custom'); assert.equal(selected.record.id, 123);
  assert.equal(selected.record.uniqueId, 'record-uuid'); assert.equal(selected.record.data[0].jyutping, 'hou2 je5');
  assert.deepEqual(clone(page.data.taskDetail[0]), original);
});
test('新增方案尚未填写粤音时，直接调用提交也不会向后端发送空记录', async () => {
  const { page, calls } = createPage(); page.onAddClick(); page.data.currentIndex = page.data.taskDetail.length - 1;
  await page.doSubmit(); assert.equal(calls.requests.length, 0); assert.equal(page.data.canSubmit, false);
  assert.equal(calls.toasts.at(-1).title, '请填写原文和粤音');
});

for (const [category, intensity, valid] of [['', '强', false], ['高兴', ' ', false], [' ', ' ', true], ['高兴', '强', true]]) {
  test(`纯情感字段无需 content/url 也验证配对：${category}/${intensity}`, () => {
    const { page } = createPage();
    record(page).data[0].blocks = [{ type: 'emotion', category, intensity }];
    assert.equal(page.checkEmotion(), valid);
  });
}
test('新增粤音关闭默认点击高亮', () => {
  const fs = require('node:fs');
  assert.match(fs.readFileSync('miniprogram/pages/task/task.wxml', 'utf8'), /<t-button[^>]*hover-class="none"[^>]*bind:tap="onAddNewCantonese"/);
});

for (const [response, message] of [
  [{ error: '情感强度不能为空' }, '情感强度不能为空'],
  [{ message: '请填写情感强度' }, '请填写情感强度'],
  [{ error: { message: '强度不合法' } }, '强度不合法'],
  [{ detail: [{ msg: '情感强度为必填项' }] }, '情感强度为必填项'],
  [{}, '提交失败，请稍后重试'],
]) {
  test(`提交接口错误显示在对话框：${message}`, async () => {
    const { page, calls } = createPage({ request: async () => response });
    await page.doSubmit(); assert.equal(calls.modals[0].content, message);
    assert.equal(calls.loading.at(-1), 'hide');
  });
}

test('提交分类和标签仅用 ID，不提交展示对象或 classification 块', async () => {
  const { page, calls } = createPage({ request: async () => ({ ok: true }) });
  const current = record(page);
  current.category = { id: '102', name: '建筑', parent: { name: '文化' } };
  current.tags = [{ id: '201', name: '粤语' }];
  current.categoryId = '102'; current.tagIds = ['201'];
  await page.doSubmit();
  const sent = calls.requests[0].data;
  assert.equal(sent.selected.length, 1); assert.equal(sent.actorRef, 'reviewer');
  assert.equal(sent.selected[0].kind, 'original');
  const payload = sent.selected[0].record;
  assert.equal(payload.categoryId, '102'); assert.deepEqual(payload.tagIds, ['201']);
  assert.equal(payload.category, undefined); assert.equal(payload.tags, undefined);
  assert.ok(payload.data[0].blocks.every(block => block.type !== 'classification'));
  assert.ok(current.category); assert.equal(current.tags.length, 1);
  assert.equal(current.data[0].blocks[0].type, 'classification');
});
test('未编辑分类标签不传 ID，清空标签显式保留空数组', async () => {
  const { page, calls } = createPage({ request: async () => ({ ok: true }) });
  await page.doSubmit(); let payload = calls.requests[0].data.selected[0].record;
  assert.equal(Object.hasOwn(payload, 'categoryId'), false); assert.equal(Object.hasOwn(payload, 'tagIds'), false);
  record(page).tagIds = []; await page.doSubmit(); payload = calls.requests[1].data.selected[0].record;
  assert.deepEqual(payload.tagIds, []);
});

test('标签循环使用独立索引，不覆盖粤音卡片索引导致只有首个标签显示删除按钮', () => {
  const fs = require('node:fs');
  const template = fs.readFileSync('miniprogram/pages/task/task.wxml', 'utf8');
  assert.match(template, /wx:for="\{\{task\.record\.tags\}\}"[^>]*wx:for-index="tagIndex"/);
});


test('新增自定义选项显示 userInfo.name，不使用 nickname', () => {
  const { page } = createPage({ user: { id: 'user-1', name: '轩辕幽雪', nickname: '其他昵称' } });
  page.onAddClick();
  assert.equal(page.data.taskDetail.at(-1).source_name, '轩辕幽雪');
});


test('已完成详情模板直接显示 record.category，不生成 classification block', () => {
  const fs = require('node:fs');
  const template = fs.readFileSync('miniprogram/pages/task/task.wxml', 'utf8');
  assert.match(template, /task.record.category.parent.name/);
  assert.match(template, /\{\{task.record.category.name\}\}/);
  assert.doesNotMatch(fs.readFileSync('miniprogram/pages/task/task.ts', 'utf8'), /restoreCompletedClassifications/);
});
