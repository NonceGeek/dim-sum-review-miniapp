const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { clone, event, deferred } = require('./helpers/task-page.cjs');
function setup(request = async () => ({ items: [], summary: {} })) {
  let definition; const urls = []; const exported = {};
  const datasets = [{ label: '全部', value: 'all' }, { label: '甲', value: 'a' }, { label: '乙', value: 'b' }];
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('miniprogram/pages/dashboard/dashboard.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    Page: value => { definition = value; }, exports: exported,
    require: name => name.endsWith('/http') ? { default: async url => { urls.push(url); return request(url); } } : { formatNumber: n => String(n), formatPercent: n => String(n * 100) },
    wx: { showLoading() {}, hideLoading() {}, showToast() {}, getStorageSync: () => undefined },
    getApp: () => ({ globalData: { writeCorpora: datasets } }), console: { log() {}, error() {} },
  });
  const page = { ...definition, data: { ...clone(definition.data), datasets }, setData(v, cb) { Object.assign(this.data, v); cb?.(); } };
  return { page, urls };
}
test('统计请求组合分类、内容类型和任务类型；全部不发送新增参数', async () => {
  const { page, urls } = setup(); page.data.categoryId = '34'; page.data.contentAttribute = 'oral'; page.data.taskType = 'content_review';
  await page.loadUsersByDataset('a'); let url = new URL(urls[0], 'https://test');
  assert.equal(url.pathname, '/task/stats'); assert.equal(url.searchParams.get('categoryId'), '34');
  assert.equal(url.searchParams.get('contentAttribute'), 'oral'); assert.equal(url.searchParams.get('taskType'), 'error_fix,data_review');
  assert.equal(url.searchParams.get('corpusName'), 'a');
  page.data.categoryId = 'all'; page.data.contentAttribute = 'all'; await page.loadUsersByDataset('all');
  url = new URL(urls[1], 'https://test'); assert.equal(url.searchParams.has('categoryId'), false); assert.equal(url.searchParams.has('contentAttribute'), false);
  assert.equal(url.searchParams.get('corpusName'), 'a,b'); assert.equal(page.data.hasTaskProgress, false);
});
test('分类接口按 datasets 联动，切换来源时清除不适用分类', async () => {
  const { page, urls } = setup(async url => url.startsWith('/content-categories') ? { items: [
    { id: '1', name: '建筑', datasets: [{ name: 'a' }] }, { id: '2', name: '字条', datasets: [{ name: 'b' }] },
  ] } : { items: [], summary: {} });
  await page.loadDatasetCategories(); assert.equal(urls[0], '/content-categories?include=datasets');
  page.data.categoryId = '1'; await page.onPickerChange(event({}, { value: ['b'] }));
  assert.equal(page.data.categoryId, 'all'); assert.deepEqual(clone(page.data.categoryOptions.map(x => x.value)), ['all', '2']);
  assert.equal(new URL(urls[1], 'https://test').searchParams.has('categoryId'), false);
});
test('内容类型与分类 picker 确认会请求，取消不改变当前条件', async () => {
  const { page, urls } = setup(); await page.onStatsFilterOpen(event({ key: 'contentAttribute' }));
  page.onStatsFilterClose(); assert.equal(page.data.contentAttribute, 'all'); assert.equal(urls.length, 0);
  await page.onStatsFilterOpen(event({ key: 'contentAttribute' })); await page.onStatsFilterConfirm(event({}, { value: ['cultural_knowledge'] }));
  assert.equal(new URL(urls[0], 'https://test').searchParams.get('contentAttribute'), 'cultural_knowledge');
  page.data.datasetCategories = [{ id: '34', name: '建筑', datasets: [{ name: 'a' }] }]; page.syncCategoryOptions();
  await page.onStatsFilterOpen(event({ key: 'categoryId' })); await page.onStatsFilterConfirm(event({}, { value: ['34'] }));
  assert.equal(page.data.categoryText, '建筑'); assert.equal(new URL(urls[1], 'https://test').searchParams.get('categoryId'), '34');
});
test('快速切换统计条件忽略旧响应', async () => {
  const d = deferred(); const { page } = setup(url => url.includes('categoryId=1') ? d.promise : Promise.resolve({ items: [], summary: { totalCount: 2 } }));
  page.data.categoryId = '1'; const old = page.loadUsersByDataset('all');
  page.data.categoryId = '2'; await page.loadUsersByDataset('all'); d.resolve({ items: [], summary: { totalCount: 99 } }); await old;
  assert.equal(page.data.summary.totalCount, '2'); assert.equal(page.data.loading, false);
});


test('统计加载期间展示骨架状态，请求成功或失败都会结束加载', async () => {
  const pending = deferred();
  const { page } = setup(() => pending.promise);
  const loading = page.loadUsersByDataset('all');
  assert.equal(page.data.loading, true);
  pending.resolve({ items: [], summary: {} }); await loading;
  assert.equal(page.data.loading, false);
  const failed = setup(async () => { throw new Error('offline'); });
  await failed.page.loadUsersByDataset('all'); assert.equal(failed.page.data.loading, false);
  const source = fs.readFileSync('miniprogram/pages/dashboard/dashboard.ts', 'utf8');
  assert.doesNotMatch(source, /wx\.(showLoading|hideLoading)\(/);
  assert.ok(fs.readFileSync('miniprogram/pages/dashboard/dashboard.wxml', 'utf8').includes('<task-list-skeleton variant="dashboard"'));
});
