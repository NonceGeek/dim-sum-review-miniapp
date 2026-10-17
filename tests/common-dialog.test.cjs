const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function setup() {
  const api = {}; let component, currentPage;
  const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compile('miniprogram/utils/common-dialog.ts'), { exports: api, getCurrentPages: () => currentPage ? [currentPage] : [] });
  vm.runInNewContext(compile('miniprogram/components/common-dialog/common-dialog.ts'), { exports: {}, Component: c => { component = c; }, require: () => api, getApp: () => ({ getTheme: () => 'dark' }) });
  const dialog = { ...component.methods, data: {}, setData(patch) { Object.assign(this.data, patch); } };
  const host = { selectComponent: () => dialog };
  return { api, dialog, host, mount() { currentPage = host; component.lifetimes.ready.call(dialog); } };
}
test('确认和取消分别回传原生格式，complete 仅调用一次', () => {
  for (const confirmed of [true, false]) {
    const { api, dialog, host } = setup(); let result, completed = 0;
    api.showCommonModal(host, { title: '确认', content: '内容', success: value => { result = value; }, complete: () => completed++ });
    assert.equal(dialog.data.visible, true); assert.equal(dialog.data.showCancel, true); assert.equal(dialog.data.currentTheme, 'dark');
    dialog.settle(confirmed); dialog.settle(confirmed);
    assert.equal(result.confirm, confirmed); assert.equal(result.cancel, !confirmed); assert.equal(completed, 1); assert.equal(dialog.data.visible, false);
  }
});
test('更新提示在页面挂载后展示，多个弹框依次处理', () => {
  const { api, dialog, host, mount } = setup();
  api.showCommonModal(null, { title: '更新', showCancel: false }); assert.equal(dialog.data.visible, undefined);
  mount(); assert.equal(dialog.data.title, '更新'); assert.equal(dialog.data.cancelBtn, false);
  api.showCommonModal(host, { title: '第二个', content: '内容' }); assert.equal(dialog.data.title, '更新');
  dialog.onConfirm(); assert.equal(dialog.data.title, '第二个'); assert.equal(dialog.data.visible, true);
  dialog.onCancel(); assert.equal(dialog.data.visible, false);
});
test('业务回调抛错后仍完成清理并展示下一个弹框', () => {
  const { api, dialog, host } = setup();
  api.showCommonModal(host, { title: '第一个', success: () => { throw new Error('callback'); } });
  api.showCommonModal(host, { title: '第二个' });
  assert.throws(() => dialog.onConfirm(), /callback/); assert.equal(dialog.data.title, '第二个');
});
test('所有原生弹框入口已迁移，每个页面挂载 common-dialog', () => {
  for (const file of ['miniprogram/app.ts', 'miniprogram/pages/index/index.ts', 'miniprogram/pages/task/task.ts']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /wx\.showModal\(/);
  }
  const app = JSON.parse(fs.readFileSync('miniprogram/app.json', 'utf8'));
  assert.ok(app.usingComponents['common-dialog']);
  for (const page of app.pages.filter(page => page !== 'pages/webview/webview')) assert.ok(fs.readFileSync(`miniprogram/${page}.wxml`, 'utf8').includes('<common-dialog id="common-dialog"'));
});
