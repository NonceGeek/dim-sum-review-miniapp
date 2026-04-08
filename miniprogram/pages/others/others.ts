import request from "../../utils/http";
const systemInfo = wx.getSystemInfoSync();
const statusBarHeight = systemInfo.statusBarHeight;

// 主题模式选项
const THEME_OPTIONS = [
  { label: "跟随系统", value: "auto" },
  { label: "浅色模式", value: "light" },
  { label: "深色模式", value: "dark" },
];

// 主题模式文本映射
const THEME_MODE_TEXT: Record<string, string> = {
  auto: "跟随系统",
  light: "浅色模式",
  dark: "深色模式",
};

Page({
  data: {
    activeTab: "all", // 当前激活的 tab: all, processed, unprocessed
    currentTasks: [] as any[], // 当前显示的任务列表
    searchKeyword: "", // 搜索关键词
    headerHeight: 0,
    statusBarHeight,
    currentTheme: "light" as "light" | "dark",
    themeMode: "auto" as "auto" | "light" | "dark",
    themeModeText: "跟随系统",
    showThemeSheet: false,
    themeOptions: THEME_OPTIONS,
    loadFinished: false,
    currentPage: 0,
    dataset: "", // 语料集名称
    user: "", // 用户id
    // 三个状态的任务列表
    allTasks: [] as any[],
    allPage: 0,
    allTotal: 0,
    allLoadFinished: false,
    allLoading: false,
    processedTasks: [] as any[],
    processedPage: 0,
    processedTotal: 0,
    processedLoadFinished: false,
    processedLoading: false,
    unprocessedTasks: [] as any[],
    unprocessedPage: 0,
    unprocessedTotal: 0,
    unprocessedLoadFinished: false,
    unprocessedLoading: false,
  },

  /**
   * 重置并重新加载指定 tab 的数据
   */
  resetAndFetchTab(tab: "all" | "processed" | "unprocessed") {
    const stateMap = {
      all: {
        pageKey: "allPage",
        tasksKey: "allTasks",
        loadFinishedKey: "allLoadFinished",
        loadingKey: "allLoading",
      },
      processed: {
        pageKey: "processedPage",
        tasksKey: "processedTasks",
        loadFinishedKey: "processedLoadFinished",
        loadingKey: "processedLoading",
      },
      unprocessed: {
        pageKey: "unprocessedPage",
        tasksKey: "unprocessedTasks",
        loadFinishedKey: "unprocessedLoadFinished",
        loadingKey: "unprocessedLoading",
      },
    };

    const config = stateMap[tab];
    this.setData(
      {
        [config.pageKey]: 1,
        [config.tasksKey]: [],
        [config.loadFinishedKey]: false,
        [config.loadingKey]: false,
      },
      () => {
        this.fetchTasks(tab);
      },
    );
  },

  /**
   * Tab 切换事件
   */
  onTabChange(event: any) {
    const { value } = event.detail;
    const { searchKeyword } = this.data;

    // 如果之前有搜索关键词，切换tab时清空搜索并重新加载数据
    if (searchKeyword && searchKeyword.trim()) {
      this.setData(
        {
          activeTab: value,
        },
        () => {
          this.resetAndFetchTab(value);
        },
      );
    } else {
      // 如果没有搜索关键词，只更新显示
      this.setData(
        {
          activeTab: value,
        },
        () => {
          this.updateCurrentTasks();
        },
      );
    }
  },

  /**
   * 搜索框内容变化
   */
  onSearchChange(event: any) {
    const { value } = event.detail;
    this.setData({
      searchKeyword: value,
    });
  },

  /**
   * 搜索提交
   */
  async onSearchSubmit() {
    const { activeTab } = this.data;
    this.resetAndFetchTab(activeTab);
  },

  /**
   * 清空搜索
   */
  onSearchClear() {
    this.setData(
      {
        searchKeyword: "",
        allTasks: [] as any[],
        allPage: 1,
        allTotal: 0,
        allLoadFinished: false,
        allLoading: false,
        processedTasks: [] as any[],
        processedPage: 1,
        processedTotal: 0,
        processedLoadFinished: false,
        processedLoading: false,
        unprocessedTasks: [] as any[],
        unprocessedPage: 1,
        unprocessedTotal: 0,
        unprocessedLoadFinished: false,
        unprocessedLoading: false,
      },
      async () => {
        await Promise.all([
          this.fetchTasks("all"),
          this.fetchTasks("processed"),
          this.fetchTasks("unprocessed"),
        ]);
      },
    );
  },

  /**
   * 更新当前显示的任务列表
   */
  updateCurrentTasks() {
    const { activeTab, allTasks, processedTasks, unprocessedTasks } = this.data;
    let tasks: any[] = [];

    if (activeTab === "all") {
      tasks = allTasks;
    } else if (activeTab === "processed") {
      tasks = processedTasks;
    } else if (activeTab === "unprocessed") {
      tasks = unprocessedTasks;
    }

    console.log("taskssss:", tasks);
    this.setData({
      currentTasks: tasks,
    });
  },

  /**
   * 点击任务卡片
   */
  onClick(event: any) {
    console.log("event:", event);
    const { taskId, taskStatus } = event.target.dataset;
    wx.navigateTo({
      url: `/pages/task/task?taskId=${taskId}&status=${taskStatus}&userId=${this.data.user}`,
    });
  },

  /**
   * 加载更多
   */
  async onClickMore() {
    const { activeTab } = this.data;
    const pageKeyMap = {
      all: "allPage",
      processed: "processedPage",
      unprocessed: "unprocessedPage",
    };

    this.setData(
      {
        [pageKeyMap[activeTab]]: this.data[pageKeyMap[activeTab]] + 1,
      },
      async () => {
        await this.fetchTasks(activeTab);
      },
    );
  },

  /**
   * 同步主题状态
   */
  syncTheme() {
    const app = getApp<IAppOption>();
    const themeMode = app.getThemeMode();
    const currentTheme = app.getTheme();

    if (
      this.data.themeMode !== themeMode ||
      this.data.currentTheme !== currentTheme
    ) {
      this.setData({
        themeMode,
        currentTheme,
        themeModeText: THEME_MODE_TEXT[themeMode],
      });
    }
  },

  /**
   * 页面加载
   */
  async onLoad(options: { datasetName?: string; userId?: string }) {

    // 接收上一页面带来的参数
    const { datasetName, userId } = options;
    console.log("接收到的参数:", datasetName, userId);

    // Calculate Navbar Height
    const rect = wx.getMenuButtonBoundingClientRect();
    const { statusBarHeight: sysStatusBarHeight } = wx.getSystemInfoSync();
    const navBarHeight =
      (rect.top - sysStatusBarHeight) * 2 + rect.height + sysStatusBarHeight;

    this.setData({
      headerHeight: navBarHeight,
      dataset: datasetName,
      user: userId,
      allPage: 1,
      processedPage: 1,
      unprocessedPage: 1,
    });

    // 获取任务数据 - 并行加载三种状态的数据
    await Promise.all([
      this.fetchTasks("all"),
      this.fetchTasks("processed"),
      this.fetchTasks("unprocessed"),
    ]);

    // 更新当前显示的任务列表
    this.updateCurrentTasks();
  },

  /**
   * 获取任务数据
   * @param type 任务类型: all | processed | unprocessed
   */
  async fetchTasks(type: "all" | "processed" | "unprocessed") {
    // 防重入检查
    let isLoading = false;
    if (type === "all") {
      if (this.data.allLoading) return;
      isLoading = this.data.allLoading;
      this.setData({ allLoading: true });
    } else if (type === "processed") {
      if (this.data.processedLoading) return;
      isLoading = this.data.processedLoading;
      this.setData({ processedLoading: true });
    } else if (type === "unprocessed") {
      if (this.data.unprocessedLoading) return;
      isLoading = this.data.unprocessedLoading;
      this.setData({ unprocessedLoading: true });
    }

    wx.showLoading({ title: "加载中..." });
    try {
      const app = getApp<IAppOption>();
      const userInfo =
        app.globalData.userInfo || wx.getStorageSync("userInfo") || null;
      const { dataset, user, searchKeyword } = this.data;

      let page = 1;
      let currentTasks: any[] = [];
      let total = 0;

      if (type === "all") {
        page = this.data.allPage;
        currentTasks = this.data.allTasks;
        total = this.data.allTotal;
      } else if (type === "processed") {
        page = this.data.processedPage;
        currentTasks = this.data.processedTasks;
        total = this.data.processedTotal;
      } else if (type === "unprocessed") {
        page = this.data.unprocessedPage;
        currentTasks = this.data.unprocessedTasks;
        total = this.data.unprocessedTotal;
      }

      // 检查是否已加载完所有数据
      if (total && currentTasks.length >= total) {
        if (type === "all") {
          this.setData({ allLoadFinished: true });
        } else if (type === "processed") {
          this.setData({ processedLoadFinished: true });
        } else if (type === "unprocessed") {
          this.setData({ unprocessedLoadFinished: true });
        }
        wx.hideLoading();
        return;
      }

      // 根据类型设置状态参数
      const status =
        type === "all"
          ? "created,notified,in_progress,completed"
          : type === "processed"
            ? "completed"
            : "created,notified,in_progress";

      // 构建请求URL，包含搜索关键词
      let url = `/task/list?corpusName=${dataset}&actorRef=${userInfo?.id}&assigneeRef=${user}&status=${status}&page=${page}&pageSize=10`;
      if (searchKeyword && searchKeyword.trim()) {
        url += `&q=${encodeURIComponent(searchKeyword.trim())}`;
      }

      // 获取任务数据
      const data = await request(url);

      // 防御性检查：确保返回数据格式正确
      if (!data || !Array.isArray(data.items)) {
        console.error("API 返回数据格式错误:", data);
        throw new Error(data?.message || "数据加载失败");
      }

      // 合并新旧数据
      const newList = [...currentTasks, ...data.items];

      // 更新对应类型的任务列表
      if (type === "all") {
        this.setData(
          {
            allTasks: newList,
            allTotal: data.pagination?.total || 0,
            allLoadFinished: newList.length >= (data.pagination?.total || 0),
          },
          () => {
            this.updateCurrentTasks();
          },
        );
      } else if (type === "processed") {
        this.setData(
          {
            processedTasks: newList,
            processedTotal: data.pagination?.total || 0,
            processedLoadFinished:
              newList.length >= (data.pagination?.total || 0),
          },
          () => {
            this.updateCurrentTasks();
          },
        );
      } else if (type === "unprocessed") {
        this.setData(
          {
            unprocessedTasks: newList,
            unprocessedTotal: data.pagination?.total || 0,
            unprocessedLoadFinished:
              newList.length >= (data.pagination?.total || 0),
          },
          () => {
            this.updateCurrentTasks();
          },
        );
      }
    } catch (err) {
      console.error("fetchTasks 失败", err);
      wx.showToast({
        title: err.errMsg ||  err?.error || "加载失败",
        icon: "none",
        duration: 4000,
      });
    } finally {
      wx.hideLoading();
      if (type === "all") {
        this.setData({ allLoading: false });
      } else if (type === "processed") {
        this.setData({ processedLoading: false });
      } else if (type === "unprocessed") {
        this.setData({ unprocessedLoading: false });
      }
    }
  },

  onShow() {
    // 每次显示页面时同步主题状态
    this.syncTheme();
  },
});
