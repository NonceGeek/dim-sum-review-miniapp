const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { clone, event, deferred } = require('./helpers/task-page.cjs');
const categories = [
  { id: '1', name: '建筑', datasets: [{ name: 'a' }] },
  { id: '2', name: '字条', datasets: [{ name: 'b' }] },
  { id: '3', name: '共享', datasets: [{ name: 'a' }, { name: 'b' }] },
  { id: '4', name: '无权语料库分类', datasets: [{ name: 'private' }] },
];
function setup(request = async () => ({ items: categories })) {
  let definition; const calls = [];
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('miniprogram/components/task-list/task-list.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    Component: value => { definition = value; },
    require: name => name.endsWith('/http') ? { default: async url => { calls.push(url); return request(url); } } : name.endsWith('task-type') ? require('./helpers/task-types.cjs') : { DEMO_TASK_TYPES: [] },
    Set, exports: {},
  });
  const c = { ...definition.methods, data: { ...clone(definition.data), rawTasks: [], datasets: [{ value: 'all', label: '全部' }, { value: 'a', label: '语料甲' }, { value: 'b', label: '语料乙' }], defaultTaskLabel: '待处理任务' }, setData(v) { Object.assign(this.data, v); } };
  return { c, calls };
}
test('打开筛选请求 include=datasets，全部展示可用语料库分类的并集', async () => {
  const { c, calls } = setup(); await c.onCorpusFilterOpen();
  assert.equal(calls[0], '/content-categories?include=datasets');
  assert.deepEqual(clone(c.data.levelOptions.map(x => x.value)), ['all', '1', '2', '3']);
});
test('按 datasets.name 联动，切换语料库清除不适用的分类', async () => {
  const { c } = setup(); await c.onCorpusFilterOpen();
  c.onDraftCorpusClick(event({ value: 'a' })); assert.deepEqual(clone(c.data.levelOptions.map(x => x.value)), ['all', '1', '3']);
  c.onDraftLevelClick(event({ value: '1' })); c.onDraftCorpusClick(event({ value: 'b' }));
  assert.equal(c.data.draftLevel, 'all'); assert.deepEqual(clone(c.data.levelOptions.map(x => x.value)), ['all', '2', '3']);
  c.onDraftLevelClick(event({ value: '3' })); c.onDraftCorpusClick(event({ value: 'a' })); assert.equal(c.data.draftLevel, '3');
});
test('分类优先按 ID 筛任务，无分类不误匹配，兼容仅有名称的旧任务', async () => {
  const { c } = setup(); await c.onCorpusFilterOpen(); c.data.selectedLevel = '1';
  for (const [category, expected] of [[{ id: '1', name: '建筑' }, true], [{ id: 'other', name: '建筑' }, false], [{ name: '建筑' }, true], [undefined, false]]) {
    assert.equal(c.matchesTaskFilters({ context: { corpusName: 'a', category } }, 'a'), expected);
  }
});
test('重置恢复全部分类，确认保存 ID 与名称标签', async () => {
  const { c } = setup(); await c.onCorpusFilterOpen(); c.onDraftCorpusClick(event({ value: 'a' })); c.onDraftLevelClick(event({ value: '1' }));
  c.onCorpusFilterApply(); assert.equal(c.data.selectedLevel, '1'); assert.equal(c.data.selectedFilterTags[1].label, '建筑');
  c.onCorpusFilterReset(); assert.equal(c.data.draftLevel, 'all'); assert.equal(c.data.levelOptions.length, 4);
});
test('请求期间切换语料库，返回后按最新选择联动', async () => {
  const d = deferred(); const { c } = setup(() => d.promise); const loading = c.onCorpusFilterOpen();
  c.onDraftCorpusClick(event({ value: 'b' })); d.resolve({ items: categories }); await loading;
  assert.deepEqual(clone(c.data.levelOptions.map(x => x.value)), ['all', '2', '3']);
});
test('接口失败结束加载并显示错误，不使用占位分类', async () => {
  const { c } = setup(async () => { throw new Error('离线'); }); await c.onCorpusFilterOpen();
  assert.equal(c.data.levelsError, '离线'); assert.equal(c.data.levelsLoading, false);
  assert.deepEqual(clone(c.data.levelOptions), [{ label: '全部', value: 'all' }]);
});
