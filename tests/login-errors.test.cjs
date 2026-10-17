const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function setup(error) {
  let definition; const toasts = [];
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('miniprogram/pages/login/login.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: {}, require: () => ({ default: {} }), Page: p => { definition = p; },
    wx: { getAccountInfoSync: () => ({ miniProgram: {} }), showToast: o => toasts.push(o) },
    getApp: () => ({ doLogin: async () => { throw error; }, doPhoneLogin: async () => { throw error; }, doSendSms: async () => { throw error; } }),
    console: { log() {}, error() {} },
  });
  const page = { ...definition, data: { ...definition.data, agreedToTerms: true, phone: '13800138000', code: '123456' }, setData(v) { Object.assign(this.data, v); } };
  return { page, toasts };
}
for (const [method, flag, expected] of [['handleLogin', 'loading', '登录超时，请重试'], ['confirmPhoneLogin', 'logining', '登录超时，请重试'], ['sendCode', 'sendingCode', '验证码发送超时，请重试']]) {
  test(`${method} 请求超时显示中文并解除按钮加载状态`, async () => {
    const { page, toasts } = setup({ errMsg: 'request:fail timeout' });
    await page[method](); assert.equal(toasts[0].title, expected); assert.equal(page.data[flag], false);
    await page[method](); assert.equal(toasts.length, 2);
  });
}
for (const [error, expected] of [[{ error: { message: '账号未授权' } }, '账号未授权'], [{}, '登录失败，请重试'], [new Error('[object Object]'), '登录失败，请重试'], [{ errMsg: 'request:fail network error' }, '网络连接失败，请检查网络后重试']]) {
  test(`登录错误转换：${expected}`, async () => {
    const { page, toasts } = setup(error); await page.handleLogin(); assert.equal(toasts[0].title, expected);
  });
}
