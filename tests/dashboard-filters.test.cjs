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
    wx: { showLoading() {}, hideLoading() {}, showToast() {}, stopPullDownRefresh() {}, getStorageSync: () => undefined },
    getApp: () => ({ globalData: { writeCorpora: datasets, userInfo: { id: 'self', role: 'RESEARCHER' } } }), console: { log() {}, error() {} },
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


const statsFor = (...ids) => ({ summary: { totalCount: 10 }, items: ids.map(assigneeRef => ({ assigneeRef, corpusId: 'a', totalCount: 10, processedCount: 5, unprocessedCount: 5, completionRate: 0.5 })) });
test('首次分类与统计并行，分类未返回也能展示概览', async () => {
  const categories = deferred();
  const { page, urls } = setup(url => url.startsWith('/content-categories') ? categories.promise : Promise.resolve(statsFor()));
  const init = page.onLoad();
  assert.equal(urls.length, 2);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.summary.totalCount, '10'); assert.equal(page.data.loading, false);
  categories.resolve({ items: [] }); await init;
});
test('用户资料慢时统计先显示，资料失败不丢统计或卡住骨架', async () => {
  const users = deferred();
  const { page } = setup(url => url.startsWith('/users') ? users.promise : Promise.resolve(statsFor('u1')));
  const loading = page.loadUsersByDataset('all');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.loading, false); assert.equal(page.data.summary.totalCount, '10');
  assert.equal(page.data.items[0].assigneeRef, 'u1');
  assert.equal(page.data.items[0].assigneeRefName, '加载中…');
  users.reject(new Error('offline')); await loading;
  assert.equal(page.data.items.length, 1); assert.equal(page.data.loading, false);
  assert.equal(page.data.items[0].assigneeRefName, '加载失败，点击重试');
});
test('昵称头像补齐并缓存，下一次统计仅查询新增用户', async () => {
  let ids = ['u1'];
  const { page, urls } = setup(async url => url.startsWith('/users')
    ? { users: new URL(url, 'https://test').searchParams.get('userIds').split(',').map(userId => ({ userId, username: '昵称' + userId, avatar: 'avatar' })) }
    : statsFor(...ids));
  await page.loadUsersByDataset('all'); assert.equal(page.data.items[0].assigneeRefName, '昵称u1');
  await page.loadUsersByDataset('a'); assert.equal(urls.filter(url => url.startsWith('/users')).length, 1);
  ids = ['u1', 'u2']; await page.loadUsersByDataset('b');
  const userRequests = urls.filter(url => url.startsWith('/users'));
  assert.equal(userRequests.length, 2); assert.equal(new URL(userRequests[1], 'https://test').searchParams.get('userIds'), 'u2');
});
test('切换和取消用户只本地筛选，不再请求统计或资料', async () => {
  const { page, urls } = setup(async url => url.startsWith('/users') ? { users: [] } : statsFor('u1', 'u2'));
  await page.loadUsersByDataset('all'); const count = urls.length;
  page.onSelectUser(event({ value: 'u2', label: '用户二' }));
  assert.equal(page.data.items.length, 1); assert.equal(page.data.items[0].assigneeRef, 'u2');
  page.onUserPickerCancel(); assert.equal(page.data.items.length, 2); assert.equal(urls.length, count);
});
test('相同分类、内容类型、语料集确认不请求，关闭弹窗', async () => {
  const { page, urls } = setup();
  await page.onStatsFilterOpen(event({ key: 'contentAttribute' }));
  await page.onStatsFilterConfirm(event({}, { value: ['all'] }));
  await page.onPickerChange(event({}, { value: ['all'] }));
  assert.equal(urls.length, 0); assert.equal(page.data.statsFilterVisible, false); assert.equal(page.data.datasetVisible, false);
});
test('旧用户资料晚返回，不覆盖新筛选的统计', async () => {
  const users = deferred();
  const { page } = setup(url => url.startsWith('/users') ? users.promise : Promise.resolve(url.includes('corpusName=a&') ? statsFor('u1') : { summary: { totalCount: 2 }, items: [] }));
  const old = page.loadUsersByDataset('a'); await new Promise(resolve => setImmediate(resolve));
  await page.loadUsersByDataset('b'); users.resolve({ users: [{ userId: 'u1', username: '旧用户' }] }); await old;
  assert.equal(page.data.summary.totalCount, '2'); assert.equal(page.data.items.length, 0);
});


test('批量接口缺失的用户显示未知用户，成功用户不受影响', async () => {
  const { page } = setup(async url => url.startsWith('/users') ? { users: [{ userId: 'u1', username: '张三' }] } : statsFor('u1', 'u2'));
  await page.loadUsersByDataset('all');
  assert.equal(page.data.items[0].assigneeRefName, '张三');
  assert.equal(page.data.items[1].assigneeRefName, '未知用户');
  assert.equal(page.data.items[1].userProfileFailed, false);
});
test('资料失败只重试对应用户，重复点击不重复请求，成功后替换昵称', async () => {
  let retry = false; const response = deferred();
  const { page, urls } = setup(url => {
    if (!url.startsWith('/users')) return Promise.resolve(statsFor('u1', 'u2'));
    if (!retry) return Promise.reject(new Error('offline'));
    return response.promise;
  });
  await page.loadUsersByDataset('all'); retry = true;
  const count = urls.length; const pending = page.onRetryUserProfile(event({ userId: 'u1' }));
  await page.onRetryUserProfile(event({ userId: 'u1' }));
  assert.equal(urls.length, count + 1);
  assert.equal(new URL(urls.at(-1), 'https://test').searchParams.get('userIds'), 'u1');
  assert.equal(page.data.items[0].assigneeRefName, '加载中…');
  response.resolve({ users: [{ userId: 'u1', username: '张三' }] }); await pending;
  assert.equal(page.data.items[0].assigneeRefName, '张三');
  assert.equal(page.data.items[1].assigneeRefName, '加载失败，点击重试');
  assert.equal(urls.filter(url => url.startsWith('/task/stats')).length, 1);
});


test('语料集筛选再次打开保留已确认值，picker 使用单列数组值', async () => {
  const { page, urls } = setup();
  await page.onPickerChange(event({}, { value: ['b'] }));
  const count = urls.length;
  page.onDatasetPicker();
  assert.equal(page.data.datasetValue, 'b'); assert.equal(page.data.datasetVisible, true);
  page.onPickerCancel(); assert.equal(page.data.datasetValue, 'b'); assert.equal(urls.length, count);
  const template = fs.readFileSync('miniprogram/pages/dashboard/dashboard.wxml', 'utf8');
  assert.ok(template.includes('value="{{[datasetValue]}}"'));
  assert.ok(template.includes('bind:confirm="onPickerChange"'));
});


test('普通筛选复用资料，下拉刷新强制获取最新昵称头像', async () => {
  let version = 1;
  const { page, urls } = setup(async url => url.startsWith('/content-categories') ? { items: [] }
    : url.startsWith('/users') ? { users: [{ userId: 'u1', username: '昵称' + version, avatar: 'avatar' + version }] }
    : statsFor('u1'));
  await page.loadUsersByDataset('all');
  version = 2; await page.loadUsersByDataset('a');
  assert.equal(page.data.items[0].assigneeRefName, '昵称1');
  assert.equal(urls.filter(url => url.startsWith('/users')).length, 1);
  await page.onPullDownRefresh();
  assert.equal(page.data.items[0].assigneeRefName, '昵称2');
  assert.equal(page.data.items[0].assigneeRefAvatar, 'avatar2');
  assert.equal(urls.filter(url => url.startsWith('/users')).length, 2);
});
test('刷新前的用户资料晚返回不会覆盖刷新后的新资料', async () => {
  const old = deferred(); let count = 0;
  const { page } = setup(async url => !url.startsWith('/users') ? statsFor('u1')
    : ++count === 1 ? old.promise : { users: [{ userId: 'u1', username: '新昵称' }] });
  const initial = page.loadUsersByDataset('all'); await new Promise(resolve => setImmediate(resolve));
  await page.loadUsersByDataset('all', true);
  old.resolve({ users: [{ userId: 'u1', username: '旧昵称' }] }); await initial;
  assert.equal(page.data.items[0].assigneeRefName, '新昵称');
});
