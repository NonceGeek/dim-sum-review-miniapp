const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { clone, deferred } = require('./helpers/task-page.cjs');
const { createTaskList } = require('./helpers/task-list.cjs');
test('共享列表加载时保留已有卡片，失败后结束骨架状态', async () => {
  const pending = deferred();
  const { component: c } = createTaskList(() => pending.promise, { requestPath: '/task/completed', serverPage: 1, rawTasks: [{ id: 'old', context: {} }] });
  const loading = c.onClickMore();
  assert.equal(c.data.tasksLoading, true); assert.equal(c.data.rawTasks[0].id, 'old');
  pending.reject(new Error('offline')); await loading;
  assert.equal(c.data.tasksLoading, false); assert.equal(c.data.rawTasks[0].id, 'old');
});
test('others 三个 tab 独立维护加载状态，成功或失败都会关闭对应骨架', async () => {
  let definition;
  const pending = { all: deferred(), processed: deferred(), unprocessed: deferred() };
  let count = 0;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('miniprogram/pages/others/others.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: {}, Page: p => { definition = p; },
    require: name => name.endsWith('/http') ? { default: () => Object.values(pending)[count++].promise } : require('./helpers/task-types.cjs'),
    getApp: () => ({ globalData: { userInfo: { id: 'reviewer' } } }),
    wx: { getSystemInfoSync: () => ({}), showToast() {} }, console: { log() {}, error() {} },
  });
  const page = { ...definition, data: clone(definition.data), setData(v, cb) { Object.assign(this.data, v); cb?.(); } };
  for (const tab of Object.keys(pending)) page.data[`${tab}Page`] = 1;
  const loading = Object.keys(pending).map(tab => page.fetchTasks(tab));
  assert.equal(page.data.allLoading, true); assert.equal(page.data.processedLoading, true); assert.equal(page.data.unprocessedLoading, true);
  pending.processed.resolve({ items: [], pagination: { total: 0 } }); await loading[1];
  assert.equal(page.data.processedLoading, false); assert.equal(page.data.allLoading, true);
  pending.all.resolve({ items: [], pagination: { total: 0 } }); pending.unprocessed.reject(new Error('offline'));
  await Promise.all(loading); assert.equal(page.data.allLoading, false); assert.equal(page.data.unprocessedLoading, false);
});
test('共享列表和 others 使用骨架组件，不再调用全局 loading', () => {
  for (const base of ['miniprogram/components/task-list/task-list', 'miniprogram/pages/others/others']) {
    assert.doesNotMatch(fs.readFileSync(`${base}.ts`, 'utf8'), /wx\.(showLoading|hideLoading)\(/);
    assert.ok(fs.readFileSync(`${base}.wxml`, 'utf8').includes('<task-list-skeleton'));
    assert.ok(JSON.parse(fs.readFileSync(`${base}.json`, 'utf8')).usingComponents['task-list-skeleton']);
  }
});
