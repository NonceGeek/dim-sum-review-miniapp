const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const clone = value => JSON.parse(JSON.stringify(value));
const source = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/task/task.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function option(overrides = {}) {
  const record = { text: '好嘢', data: [{ jyutping: 'hou2 je5', blocks: [{ type: 'classification', content: '文化 / 建筑' }, { type: 'definition', content: '解释' }] }], tags: [] };
  return { source: 'original', canEdit: true, record: clone(record), suggestions: { kind: 'original', record: clone(record) }, ...overrides };
}
function event(dataset = {}, detail) { return { currentTarget: { dataset }, detail }; }
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function createPage({ data = {}, request = async () => ({ items: [] }), user = { id: 'reviewer' }, storage = {}, globalData = {} } = {}) {
  let definition;
  const calls = { requests: [], toasts: [], modals: [], loading: [], navigation: [] };
  const http = async (url, options = {}) => {
    calls.requests.push({ url, ...clone(options) });
    return request(url, options);
  };
  const wx = {
    getSystemInfoSync: () => ({ statusBarHeight: 24 }),
    getStorageSync: key => key === 'userInfo' ? user : storage[key],
    getMenuButtonBoundingClientRect: () => ({ top: 30, height: 32 }),
    showToast: value => calls.toasts.push(value),
    showModal: value => calls.modals.push(value),
    showLoading: value => calls.loading.push(value),
    hideLoading: () => calls.loading.push('hide'),
    navigateTo: value => calls.navigation.push(value),
  };
  vm.runInNewContext(compiled, {
    Page: value => { definition = value; }, wx,
    require: name => {
      if (name.endsWith('/common-dialog')) return { showCommonModal: (_host, options) => calls.modals.push(options) };
      if (name.endsWith('/http')) return { __esModule: true, default: http, public_request: http };
      if (name.endsWith('/setting')) return { __esModule: true, default: {} };
      if (name.endsWith('/date')) return { add8Hours: value => value };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    exports: {}, console: { log() {}, error() {} },
    // Never schedule navigation or device actions in unit tests.
    setTimeout() { throw new Error('Unexpected timer'); },
    clearTimeout() {},
    getApp: () => ({ globalData, getTheme: () => 'light' }),
  }, { filename: 'task.ts' });
  const page = { ...definition, data: { ...clone(definition.data), status: 'notified', isOwner: true, taskId: 'task-1', taskDetail: [option(), option({ source: 'llm' })], ...clone(data) } };
  page.setData = (patch, callback) => {
    for (const [key, value] of Object.entries(patch)) {
      const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.');
      let target = page.data;
      for (const part of keys.slice(0, -1)) target = target[part];
      target[keys.at(-1)] = value;
    }
    callback?.();
  };
  return { page, calls };
}
module.exports = { createPage, option, event, deferred, clone };
