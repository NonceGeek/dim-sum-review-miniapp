const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../miniprogram/components/task-list/task-type.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported });
module.exports = exported;
