const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, globals) {
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: {}, require: () => ({ default: {} }), console: { log() {} }, ...globals });
}
test('我的进入 completed 后左上返回，首页任务 tab 仍通过 change 事件切换', () => {
  let index, completed, tab; const backs = [];
  const wx = { getSystemInfoSync: () => ({}), getAccountInfoSync: () => ({ miniProgram: {} }), navigateBack: options => backs.push(options) };
  load('miniprogram/pages/index/index.ts', { wx, Page: value => { index = value; } });
  load('miniprogram/pages/completed/completed.ts', { wx, Page: value => { completed = value; } });
  load('miniprogram/components/app-tab-bar/app-tab-bar.ts', { Component: value => { tab = value; } });
  const page = { data: { active: 'mine' }, setData(patch) { Object.assign(this.data, patch); } };
  completed.onGoBack(); assert.equal(backs[0].delta, 1); assert.equal(page.data.active, 'mine');
  const component = { data: { page: 'index', value: 'mine' }, triggerEvent(name, detail) { assert.equal(name, 'change'); index.onChange.call(page, { detail }); } };
  tab.methods.onChange.call(component, { detail: { value: 'uncompleted' } });
  assert.equal(page.data.active, 'uncompleted');
  tab.methods.onChange.call(component, { detail: { value: 'mine' } }); assert.equal(page.data.active, 'mine');
});
test('首页 tab 始终绑定页面 active 和 change，不因从 completed 返回而依赖重定向', () => {
  const template = fs.readFileSync('miniprogram/pages/index/index.wxml', 'utf8');
  assert.match(template, /<app-tab-bar[^>]*value="\{\{active\}\}"[^>]*page="index"[^>]*bind:change="onChange"/);
});

test('返回页面不卸载 tab，避免返回后延迟出现', () => {
  const template = fs.readFileSync('miniprogram/components/app-tab-bar/app-tab-bar.wxml', 'utf8');
  assert.doesNotMatch(template, /tabBarVisible/);
  const source = fs.readFileSync('miniprogram/components/app-tab-bar/app-tab-bar.ts', 'utf8');
  assert.doesNotMatch(source, /tabBarVisible/);
});


test('详情页 tab 跟随入口：已处理和任务情况选我的，首页任务选任务', async () => {
  const { createPage } = require('./helpers/task-page.cjs');
  for (const [options, expected] of [
    [{ status: 'notified' }, 'uncompleted'],
    [{ status: 'completed' }, 'mine'],
    [{ status: 'notified', tab: 'mine' }, 'mine'],
  ]) {
    const { page } = createPage();
    page.syncTheme = () => {}; page.getTask = async () => {}; page.loadClassificationOptions = async () => {};
    await page.onLoad({ taskId: '1', ...options });
    assert.equal(page.data.activeTab, expected);
  }
});
