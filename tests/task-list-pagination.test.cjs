const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { clone, event, deferred } = require('./helpers/task-page.cjs');
const { createTaskList } = require('./helpers/task-list.cjs');
const result = (id, total = 3) => ({ items: [{ id, status: 'notified', context: {} }], pagination: { pageSize: 1, total } });
for (const requestPath of ['/task/uncompleted', '/task/completed']) {
  test(`${requestPath}：组件负责筛选、第一页重置和加载更多`, async () => {
    const { component: c, urls } = createTaskList(async url => result(new URL(url, 'https://test').searchParams.get('page')), { requestPath });
    c.data.selectedLevel = '34'; c.data.selectedCategory = 'oral'; c.data.selectedCorpus = 'a'; c.data.selectedTaskType = 'content_review';
    await c.notifyFilterChange(); const first = new URL(urls[0], 'https://test');
    assert.equal(first.pathname, requestPath); assert.equal(first.searchParams.get('categoryId'), '34'); assert.equal(first.searchParams.get('contentAttribute'), 'oral');
    assert.equal(first.searchParams.get('corpusName'), 'a'); assert.equal(first.searchParams.get('taskType'), 'error_fix,data_review');
    await c.onClickMore(); assert.equal(new URL(urls[1], 'https://test').searchParams.get('categoryId'), '34');
    assert.deepEqual(clone(c.data.rawTasks.map(x => x.id)), ['1', '2']);
    // Server results are displayed even if context fields are omitted by an API response.
    assert.equal(c.data.tasks.length, 2);
    await c.onClearFilter(event({ field: 'level' }));
    assert.equal(new URL(urls[2], 'https://test').searchParams.has('categoryId'), false);
    assert.equal(c.data.serverPage, 1); assert.equal(c.data.rawTasks.length, 1);
    await c.onCategoryClick(event({ value: 'cultural_knowledge' }));
    assert.equal(new URL(urls[3], 'https://test').searchParams.get('contentAttribute'), 'cultural_knowledge');
  });
  test(`${requestPath}：快速切换忽略旧请求，到底停止请求`, async () => {
    const slow = deferred(); const { component: c, urls } = createTaskList(url => url.includes('oral') ? slow.promise : Promise.resolve(result('new', 1)), { requestPath });
    const old = c.onCategoryClick(event({ value: 'oral' }));
    await c.onCategoryClick(event({ value: 'all' })); slow.resolve(result('old')); await old;
    assert.equal(c.data.rawTasks[0].id, 'new'); await c.onClickMore(); assert.equal(urls.length, 2);
  });
  test(`${requestPath}：分页失败不跳页，重复点击不重复请求`, async () => {
    const pending = deferred(); let n = 0; const { component: c, urls } = createTaskList(async () => ++n === 1 ? result('1') : n === 2 ? pending.promise : result('2'), { requestPath });
    await c.reloadTasks(); const more = c.onClickMore(); await c.onClickMore(); assert.equal(urls.length, 2);
    pending.reject(new Error('offline')); await more; assert.equal(c.data.serverPage, 1);
    await c.onClickMore(); assert.equal(new URL(urls[2], 'https://test').searchParams.get('page'), '2'); assert.equal(c.data.tasksLoading, false);
  });
}
test('组件等待页面就绪，不在登录前请求，支持初始页码', async () => {
  const { component: c, urls } = createTaskList(async () => result('2'), { requestPath: '/task/uncompleted', serverReady: false });
  await c.reloadTasks(); assert.equal(urls.length, 0);
  c.data.serverReady = true; await c.reloadTasks(2); assert.equal(new URL(urls[0], 'https://test').searchParams.get('page'), '2');
});
test('两个页面只配置组件接口，不再实现请求或筛选分页方法', () => {
  for (const [page, endpoint] of [['index', 'uncompleted'], ['completed', 'completed']]) {
    const ts = fs.readFileSync(`miniprogram/pages/${page}/${page}.ts`, 'utf8');
    const wxml = fs.readFileSync(`miniprogram/pages/${page}/${page}.wxml`, 'utf8');
    assert.ok(wxml.includes(`request-path="/task/${endpoint}"`));
    assert.doesNotMatch(ts, /async (fetchTasks|fetchUncompletedTasks|onTaskFilterChange|onClickMore|onLoadMore)\(/);
  }
});

test('筛选栏始终显示正式中文选项，三种 taskType 映射正确', () => {
  const { component: c } = createTaskList(async () => ({}));
  assert.deepEqual(clone(c.data.taskTypes.map(item => item.label)), ['全部', '分类抽检', '内容校对']);
  c.data.rawTasks = ['data_review', 'error_fix', 'category_review'].map((taskType, id) => ({ id, taskType, context: {} }));
  c.applyTaskFilters();
  assert.deepEqual(clone(c.data.tasks.map(item => item.cardTypeLabel)), ['内容校对', '内容校对', '分类抽检']);
  assert.deepEqual(clone(c.data.tasks.map(item => item.cardType)), ['content_review', 'content_review', 'classification_check']);
});

test('进入列表并行加载任务和分类，打开筛选复用已加载分类', async () => {
  const tasks = deferred(), categories = deferred();
  const { component: c, urls } = createTaskList(url => url.startsWith('/content-categories') ? categories.promise : tasks.promise, { requestPath: '/task/uncompleted', initialPage: 1 });
  const init = c.initializeList();
  assert.equal(urls.length, 2);
  assert.equal(urls[0], '/task/uncompleted?page=1');
  assert.equal(urls[1], '/content-categories?include=datasets');
  categories.resolve({ items: [] }); tasks.resolve(result('1')); await init;
  assert.equal(c.data.levelsLoaded, true);
  await c.onCorpusFilterOpen(); assert.equal(urls.filter(url => url.startsWith('/content-categories')).length, 1);
});


test('列表标题在后台分页时显示 total，而不是已加载卡片数量', async () => {
  const { component: c } = createTaskList(async () => result('1', 1840), { requestPath: '/task/uncompleted' });
  await c.reloadTasks();
  assert.equal(c.data.tasks.length, 1); assert.equal(c.data.serverTotal, 1840);
  assert.match(fs.readFileSync('miniprogram/components/task-list/task-list.wxml', 'utf8'), /\{\{serverFiltering \? serverTotal : tasks.length\}\} 条/);
});



for (const requestPath of ['/task/uncompleted', '/task/completed']) {
  test(`${requestPath}：选择筛选不请求，确认后一次请求同时更新列表和 total`, async () => {
    const { component: c, urls } = createTaskList(async () => result('new', 1840), {
      requestPath, levelsLoaded: true, selectedCategory: 'oral', selectedTaskType: 'content_review',
    });
    await c.onCorpusFilterOpen();
    c.onDraftCorpusClick(event({ value: 'internal-test' }));
    c.onDraftLevelClick(event({ value: '34' }));
    assert.equal(urls.length, 0);
    await c.onCorpusFilterApply();
    assert.equal(urls.length, 1);
    const params = new URL(urls[0], 'https://test').searchParams;
    assert.equal(params.get('corpusName'), 'internal-test'); assert.equal(params.get('categoryId'), '34');
    assert.equal(params.get('contentAttribute'), 'oral'); assert.equal(params.get('taskType'), 'error_fix,data_review');
    assert.equal(c.data.serverTotal, 1840); assert.equal(c.data.tasks[0].id, 'new');
  });
}
