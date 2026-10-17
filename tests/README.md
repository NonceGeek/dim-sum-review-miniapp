# task 页面逻辑测试

运行 `npm run test:task`；`npm test` 运行项目当前全部测试。建议使用 Node.js 20 或更新版本，先安装开发依赖。

测试直接加载并转译 `miniprogram/pages/task/task.ts`，捕获 Page 定义，每个用例使用独立页面数据和微信 API / HTTP 替身；不会请求真实后端、创建分类或标签，也不会提交任务。setData 支持字段路径并立即执行回调。依赖缺失和未预期的定时器会报错，避免悄悄跳过页面逻辑。

覆盖：提交按钮有效性、长按编辑与权限、取消/保存与选项隔离、选项切换、字段和粤音增删、分类树联动与创建失败重试、标签搜索竞态/创建/取消/清空、情感配对与 picker 事件、提交 payload 和本地数据保护、录音时的播放限制。

## 当前结果

133 个用例全部通过，无失败、跳过或 TODO。

原有三个问题已修复并转为正常回归用例：纯情感字段配对校验、新增粤音自动展开、提交网络异常清理 loading 并提示错误。另覆盖新增粤音关闭点击高亮；webview 按页面要求不检查 common-dialog 挂载。

模拟测试不验证 WXML 渲染、微信 setData 的异步时序、真实 picker/键盘/录音上传、设备权限、实际后端契约或完整端到端流程。这些仍需开发者工具或真机验证。

## 角色权限矩阵

`task-permissions.test.cjs` 通过真实 `getTask()` 调用内部权限计算，没有复制权限算法。56 个用例覆盖两个任务分支（普通和 phonetic_mismatch）、三个来源（原内容、AI、baseline）、WRITE/READ/无关授权、存储和 globalData 回退、页面入口归属判断，以及已完成和他人任务的编辑入口限制。

| 角色 | 原内容与 baseline | AI 建议 | 新增方案 canAdd | 删除原有字段 canDelete |
| --- | --- | --- | --- | --- |
| 系统管理员 | 全部来源 | 允许 | 允许 | 允许 |
| RESEARCHER | 全部来源 | 允许 | 允许 | 不授予 |
| TAGGER_PARTNER / TAGGER_OUTSOURCING | 对应语料库需 WRITE | 允许 | 不授予 | 不授予 |
| 未知或缺失角色 | 不授予，即使有 WRITE | 允许 | 不授予 | 不授予 |

以上是当前前端代码规则。实际选项的 canEdit 还要求任务属于本人；已完成任务由编辑入口状态校验和模板保持只读。canAdd/canDelete 的测试验证权限数据，不代表已经在运行时渲染验证按钮显隐，也不验证服务端鉴权。非管理员删除自己新增字段（new=true）是模板中的另一条件，不能将 canDelete=false 解读为完全没有任何删除入口。

语料集分类补充 6 个用例（`task-list-categories.test.cjs`），覆盖 include=datasets 请求、来源联动、分类 ID 筛选、重置、在途请求和失败状态。

筛选请求和分页统一在 task-list 组件中。`task-list-pagination.test.cjs` 的 8 个用例分别使用待处理和已处理接口验证参数、重置、追加、旧响应隔离、失败重试、等待登录就绪与页面配置。通过 `npm test` 或 `npm run test:task` 运行。原先两个页面各自的分页测试已替换为组件测试。

看板筛选有 4 个测试（`dashboard-filters.test.cjs`），覆盖统计参数、分类来源联动、picker 确认/取消和旧响应隔离；使用 `npm test` 运行。

任务类型中文回归测试直接读取正式共享配置，验证筛选选项非空以及 data_review/error_fix/category_review 的标签映射，避免测试替身掩盖配置丢失。

初始化并行加载任务与分类；分类成功后打开筛选复用结果，已加入回归用例。
