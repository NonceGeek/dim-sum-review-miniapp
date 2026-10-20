import { getTaskType, TASK_TYPE_OPTIONS } from "./task-type";
import request from "../../utils/http";

// “all” 表示不限；多个值沿用接口的逗号分隔参数格式。
const filterValues = (value: string): string[] => value === "all" ? [] : value.split(",").filter(Boolean);
const toggleFilter = (current: string, value: string): string => {
  if (value === "all") return "all";
  const values = filterValues(current);
  const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  return next.join(",") || "all";
};

Component({
  options: { styleIsolation: "apply-shared" },
  properties: {
    serverFiltering: Boolean,
    requestPath: String,
    serverReady: Boolean,
    initialPage: { type: Number, value: 1 },
    headerHeight: Number,
    currentTheme: String,
    rawTasks: { type: Array, value: [] as any[] },
    datasets: { type: Array, value: [] as { label: string; value: string }[] },
    loadFinished: Boolean,
    orderText: String,
    defaultTaskLabel: { type: String, value: "待处理任务" },
  },
  data: {
    taskRequestId: 0,
    serverPage: 0,
    serverTotal: 0,
    tasksLoading: false,
    selectedLevel: "all",
    draftLevel: "all",
    levelOptions: [{ label: "全部", value: "all" }] as {
      label: string;
      value: string;
    }[],
    datasetCategories: [] as {
      id: string;
      name: string;
      datasets: { name: string }[];
    }[],
    levelsLoaded: false,
    levelsLoading: false,
    levelsError: "",
    selectedCorpus: "all",
    selectedTaskType: "all",
    selectedCategory: "all",
    contentCategories: [
      { label: "全部", value: "all" },
      { label: "文化知识", value: "cultural_knowledge" },
      { label: "口语语料", value: "oral" },
    ],
    showCorpusFilter: false,
    draftCorpus: "all",
    draftMatchCount: 0,
    draftCorpusMap: { all: true } as Record<string, boolean>,
    draftLevelMap: { all: true } as Record<string, boolean>,
    corpusFilterContext: "全部 · 全部",
    selectedFilterTags: [] as { field: string; value: string; label: string }[],
    taskTypes: TASK_TYPE_OPTIONS,
    tasks: [] as any[],
  },
  lifetimes: {
    detached() {
      ++this.data.taskRequestId;

    },
  },
  observers: {
    serverReady(ready: boolean) {
      if (ready && this.data.serverFiltering)
        void this.initializeList();
    },
    "rawTasks, datasets, defaultTaskLabel"() {
      this.applyTaskFilters();
      if (this.data.showCorpusFilter) this.syncDraftLevels();
    },
  }, 
  methods: {
    async initializeList() {
      await Promise.all([
        this.reloadTasks(this.data.initialPage),
        this.loadDatasetCategories(),
      ]);
    },
    onClick(event: WechatMiniprogram.CustomEvent) {
      this.triggerEvent("tasktap", { ...event.currentTarget.dataset });
    },
    async onClickMore() {
      if (!this.data.serverFiltering) {
        this.triggerEvent("loadmore");
        return;
      }
      if (this.data.tasksLoading || this.data.loadFinished) return;
      await this.fetchTasks(this.data.serverPage + 1);
    },
    async reloadTasks(page = 1) {
      if (!this.data.serverReady || !this.data.requestPath) return;
      this.setData({
        rawTasks: [],
        tasks: [],
        serverPage: page - 1,
        serverTotal: 0,
        loadFinished: false,
      });
      await this.fetchTasks(page);
    },
    async fetchTasks(page: number) {
      const requestId = ++this.data.taskRequestId;
      const previousItems = this.data.rawTasks;
      this.setData({ tasksLoading: true });
      try {
        const filters = this.getServerFilters();
        const query = [`page=${page}`];
        Object.entries(filters).forEach(([key, value]) => {
          if (value) query.push(`${key}=${encodeURIComponent(value)}`);
        });
        const response = await request(
          `${this.data.requestPath}?${query.join("&")}`,
        );
        if (requestId !== this.data.taskRequestId) return;
        if (!Array.isArray(response?.items))
          throw new Error(response?.message || "数据加载失败");
        const pagination = response.pagination;
        const loadFinished =
          pagination?.pageSize > 0 && pagination?.total != null
            ? page * pagination.pageSize >= pagination.total
            : response.items.length === 0;
        this.setData({
          rawTasks: [
            ...previousItems,
            ...response.items.filter(
              (item: any) => item.status !== "reassigning",
            ),
          ],
          serverPage: page,
          serverTotal: pagination?.total || 0,
          loadFinished,
        });
        this.applyTaskFilters();
      } catch (error: any) {
        if (requestId !== this.data.taskRequestId) return;
        wx.showToast({ title: error?.message || "加载失败", icon: "none" });
      } finally {
        if (requestId === this.data.taskRequestId) {
          this.setData({ tasksLoading: false });

        }
      }
    },
    resetCorpus(notify = true) {
      this.setData({ selectedCorpus: "all" });
      this.applyTaskFilters();
      if (notify) this.notifyFilterChange();
    },
    getServerFilters() {
      const {
        selectedLevel,
        selectedCategory,
        selectedCorpus,
        selectedTaskType,
      } = this.data;
      return {
        categoryId: selectedLevel === "all" ? "" : selectedLevel,
        contentAttribute: selectedCategory === "all" ? "" : selectedCategory,
        corpusName: selectedCorpus === "all" ? "" : selectedCorpus,
        taskType:
          selectedTaskType === "classification_check"
            ? "category_review"
            : selectedTaskType === "content_review"
              ? "error_fix,data_review"
              : "",
      };
    },
    notifyFilterChange() {
      return this.data.serverFiltering ? this.reloadTasks() : undefined;
    },
    onTaskTypeClick(event: any) {
      const selectedTaskType = event.currentTarget.dataset.type;
      this.setData({
        selectedTaskType,
      });
      this.applyTaskFilters();
      return this.notifyFilterChange();
    },

    onCategoryClick(event: any) {
      this.setData({ selectedCategory: event.currentTarget.dataset.value });
      this.applyTaskFilters();
      return this.notifyFilterChange();
    },

    async onCorpusFilterOpen() {
      this.setData({
        showCorpusFilter: true,
        draftCorpus: this.data.selectedCorpus,
        draftLevel: this.data.selectedLevel,
      });
      this.syncDraftLevels();
      if (!this.data.levelsLoaded) await this.loadDatasetCategories();
    },

    async loadDatasetCategories() {
      if (this.data.levelsLoading) return;
      this.setData({ levelsLoading: true, levelsError: "" });
      try {
        const response = await request("/content-categories?include=datasets");
        if (!Array.isArray(response?.items))
          throw new Error(response?.message || "分类加载失败");
        const datasetCategories = response.items
          .filter(
            (item: any) => item.id != null && typeof item.name === "string",
          )
          .map((item: any) => ({
            id: String(item.id),
            name: item.name,
            datasets: Array.isArray(item.datasets) ? item.datasets : [],
          }));
        this.setData({ datasetCategories, levelsLoaded: true });
        this.syncDraftLevels();
      } catch (error: any) {
        this.setData({
          levelsError: error?.message || "分类加载失败，请重新打开重试",
        });
      } finally {
        this.setData({ levelsLoading: false });
      }
    },

    getLevelOptions(corpus: string) {
      const availableDatasets = new Set(
        this.data.datasets
          .map((item) => item.value)
          .filter((value) => value !== "all"),
      );
      const categories = this.data.datasetCategories.filter((category) =>
        category.datasets.some((dataset) =>
          corpus === "all"
            ? availableDatasets.has(dataset.name)
            : filterValues(corpus).includes(dataset.name),
        ),
      );
      return [
        { label: "全部", value: "all" },
        ...categories.map((category) => ({
          label: category.name,
          value: category.id,
        })),
      ];
    },

    syncDraftLevels() {
      const levelOptions = this.getLevelOptions(this.data.draftCorpus);
      const draftLevel = filterValues(this.data.draftLevel)
        .filter((value) => levelOptions.some((item) => item.value === value))
        .join(",") || "all";
      this.setData({ levelOptions, draftLevel });
      this.updateDraftMatchCount();
    },

    onCorpusFilterClose() {
      this.setData({ showCorpusFilter: false });
    },

    onDraftCorpusClick(event: any) {
      this.setData({ draftCorpus: toggleFilter(this.data.draftCorpus, event.currentTarget.dataset.value) });
      this.syncDraftLevels();
    },

    onDraftLevelClick(event: any) {
      this.setData({ draftLevel: toggleFilter(this.data.draftLevel, event.currentTarget.dataset.value) });
      this.updateDraftMatchCount();
    },

    onCorpusFilterReset() {
      this.setData({ draftCorpus: "all", draftLevel: "all" });
      this.syncDraftLevels();
    },

    onCorpusFilterApply() {
      this.setData({
        selectedCorpus: this.data.draftCorpus,
        selectedLevel: this.data.draftLevel,
        showCorpusFilter: false,
      });
      this.applyTaskFilters();
      return this.notifyFilterChange();
    },

    matchesTaskFilters(task: any, corpus: string, level?: string) {
      const selectedLevel =
        level === undefined ? this.data.selectedLevel : level;
      const { selectedCategory, selectedTaskType } = this.data;
      const context = task.context || {};
      const matchesLevel =
        selectedLevel === "all" ||
        (context.category?.id != null
          ? filterValues(selectedLevel).includes(String(context.category.id))
          : Boolean(
              this.data.datasetCategories.some((item) =>
                filterValues(selectedLevel).includes(item.id) &&
                (context.category?.name || context.levelCategory) === item.name),
            ));
      return (
        matchesLevel &&
        (selectedCategory === "all" ||
          context.contentAttribute === selectedCategory) &&
        (corpus === "all" || filterValues(corpus).includes(context.corpusName)) &&
        (selectedTaskType === "all" || getTaskType(task) === selectedTaskType)
      );
    },

    updateDraftMatchCount() {
      const corpora = filterValues(this.data.draftCorpus);
      const levels = filterValues(this.data.draftLevel);
      const corpusLabel = corpora.map((value) => this.data.datasets.find((item) => item.value === value)?.label || value).join("、") || "全部";
      const levelLabel = levels.map((value) => this.data.levelOptions.find((item) => item.value === value)?.label || value).join("、") || "全部";
      this.setData({
        corpusFilterContext: `${corpusLabel} · ${levelLabel}`,
        draftCorpusMap: Object.fromEntries((corpora.length ? corpora : ["all"]).map((value) => [value, true])),
        draftLevelMap: Object.fromEntries((levels.length ? levels : ["all"]).map((value) => [value, true])),
      });
      if (this.data.serverFiltering) return;
      this.setData({
        draftMatchCount: this.data.rawTasks.filter((task) =>
          this.matchesTaskFilters(
            task,
            this.data.draftCorpus,
            this.data.draftLevel,
          ),
        ).length,
      });
    },

    onClearFilter(event: WechatMiniprogram.CustomEvent) {
      const { field, value } = event.currentTarget.dataset;
      if (field === "corpus") this.setData({ selectedCorpus: value ? filterValues(this.data.selectedCorpus).filter((item) => item !== value).join(",") || "all" : "all" });
      else if (field === "level") this.setData({ selectedLevel: value ? filterValues(this.data.selectedLevel).filter((item) => item !== value).join(",") || "all" : "all" });
      else return;
      this.applyTaskFilters();
      return this.notifyFilterChange();
    },

    applyTaskFilters() {
      const { rawTasks, selectedCorpus, selectedLevel, datasets } = this.data;
      const selectedFilterTags: { field: string; value: string; label: string }[] = [
        ...filterValues(selectedCorpus).map((value) => ({ field: "corpus", value, label: datasets.find((item) => item.value === value)?.label || value })),
        ...filterValues(selectedLevel).map((value) => ({ field: "level", value, label: this.data.datasetCategories.find((item) => item.id === value)?.name || value })),
      ];
      this.setData({
        selectedFilterTags,
        tasks: rawTasks
          .filter(
            (task) =>
              this.data.serverFiltering ||
              this.matchesTaskFilters(task, selectedCorpus),
          )
          .map((task) => {
            const context = task.context || {};
            const corpus = this.data.datasets.find(
              (item) => item.value === context.corpusName,
            );
            const taskType = this.data.taskTypes.find(
              (item) => item.value === getTaskType(task),
            );
            return {
              ...task,
              cardTypeLabel:
                taskType?.label || task.taskType || this.data.defaultTaskLabel,
              cardType: getTaskType(task),
              cardCorpusLabel: corpus?.label || context.corpusName || "",
              cardTitle:
                context.text ||
                context.problemChar ||
                context.sentenceText ||
                this.data.defaultTaskLabel,
              cardContext: [
                context.category?.parent?.name,
                context.category?.name,
              ]
                .filter(Boolean)
                .join(" / "),
              cardHint:
                task.suggestions?.find((item: any) => item.explanation)
                  ?.explanation || "",
            };
          }),
      });
    },
  },
});
