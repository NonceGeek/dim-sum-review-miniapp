const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { clone } = require('./task-page.cjs');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../miniprogram/components/task-list/task-list.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function createTaskList(request, data = {}) {
  let definition; const urls = [], toasts = [];
  vm.runInNewContext(compiled, {
    Component: value => { definition = value; }, exports: {},
    require: name => name.endsWith('/http') ? { default: async url => { urls.push(url); return request(url); } } : name.endsWith('task-type') ? require('./task-types.cjs') : { DEMO_TASK_TYPES: [] },
    wx: { showLoading() {}, hideLoading() {}, showToast: value => toasts.push(value) },
  });
  const component = { ...definition.methods, data: { ...clone(definition.data), rawTasks: [], loadFinished: false, datasets: [], initialPage: 1, defaultTaskLabel: '待处理任务', serverFiltering: true, serverReady: true, ...data }, setData(patch) { Object.assign(this.data, patch); } };
  return { component, definition, urls, toasts };
}
module.exports = { createTaskList };
