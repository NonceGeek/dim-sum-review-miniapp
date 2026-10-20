const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
test('导航颜色跟随应用当前主题，不跟随相反的系统主题', () => {
  let app; const colors = [];
  const code = ts.transpileModule(fs.readFileSync('miniprogram/app.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports: {}, require: () => ({}), App: value => { app = value; }, wx: { setNavigationBarColor: value => colors.push(value) } });
  const instance = { ...app, globalData: { ...app.globalData, theme: 'light' } };
  instance.syncNavigationTheme();
  assert.equal(colors.at(-1).frontColor, '#000000'); assert.equal(colors.at(-1).backgroundColor, '#FFFFFF');
  instance.globalData.theme = 'dark'; instance.syncNavigationTheme();
  assert.equal(colors.at(-1).frontColor, '#ffffff'); assert.equal(colors.at(-1).backgroundColor, '#161B22');
});
