import { formatNumber, formatPercent } from "../../utils/number";
import request from "../../utils/http";
Page({
  /**
   * 页面的初始数据
   */
  data: {
    taskType: "all",
    taskTypeOptions: [
      { label: "全部", value: "all" },
      { label: "分类抽检", value: "category_review" },
      { label: "内容校对", value: "content_review" },
    ],
    contentAttribute: "all",
    contentAttributeText: "全部",
    contentAttributeOptions: [
      { label: "全部", value: "all" },
      { label: "文化知识", value: "cultural_knowledge" },
      { label: "口语语料", value: "oral" },
    ],
    categoryId: "all",
    categoryText: "全部",
    categoryOptions: [{ label: "全部", value: "all" }] as { label: string; value: string }[],
    datasetCategories: [] as { id: string; name: string; datasets: { name: string }[] }[],
    categoryLoading: false,
    statsFilterVisible: false,
    statsFilterKey: "contentAttribute",
    statsFilterTitle: "选择内容类型",
    statsFilterOptions: [] as { label: string; value: string }[],
    statsFilterValue: ["all"],
    datasetVisible: false,
    datasetValue: "all",
    datasetText: "全部",
    datasets: [] as IDataset[],
    userVisible: false,
    userValue: "all",
    userText: "全部",
    users: [] as { username: string; userId: string; avatar: string }[],
    userSearchKeyword: "",
    filteredUsers: [] as { username: string; userId: string }[],
    summary: {} as TaskSummary,
    hasTaskProgress: false,
    items: [] as ItemSummary[],
    currentUserId: "",
    loading: true,

  },
  statsRequestId: 0,
  async onTaskTypeChange(e: WechatMiniprogram.CustomEvent) {
    const taskType = e.currentTarget.dataset.value;
    if (!this.data.taskTypeOptions.some(item => item.value === taskType) || taskType === this.data.taskType) return;
    this.setData({ taskType });
    await this.loadUsersByDataset(this.data.datasetValue);
  },
  async loadDatasetCategories() {
    this.setData({ categoryLoading: true });
    try {
      const response = await request("/content-categories?include=datasets");
      if (!Array.isArray(response?.items)) throw new Error(response?.message || "分类加载失败");
      this.setData({ datasetCategories: response.items.filter((item: any) => item.id != null && item.name)
        .map((item: any) => ({ id: String(item.id), name: item.name, datasets: Array.isArray(item.datasets) ? item.datasets : [] })) });
      this.syncCategoryOptions();
    } catch (error: any) {
      wx.showToast({ title: error?.message || "分类加载失败，请重试", icon: "none" });
    } finally {
      this.setData({ categoryLoading: false });
    }
  },
  syncCategoryOptions() {
    const names = new Set(this.data.datasets.map(item => item.value).filter(value => value !== "all"));
    const options = this.data.datasetCategories.filter(category => category.datasets.some(dataset =>
      this.data.datasetValue === "all" ? names.has(dataset.name) : dataset.name === this.data.datasetValue));
    const categoryOptions = [{ label: "全部", value: "all" }, ...options.map(category => ({ label: category.name, value: category.id }))];
    const selected = categoryOptions.find(item => item.value === this.data.categoryId);
    this.setData({ categoryOptions, categoryId: selected?.value || "all", categoryText: selected?.label || "全部" });
  },
  async onStatsFilterOpen(e: WechatMiniprogram.CustomEvent) {
    const key = e.currentTarget.dataset.key;
    if (key !== "categoryId" && key !== "contentAttribute") return;
    if (key === "categoryId") {
      if (this.data.categoryLoading) return;
      if (!this.data.datasetCategories.length) await this.loadDatasetCategories();
    }
    this.setData({ statsFilterVisible: true, statsFilterKey: key,
      statsFilterTitle: key === "categoryId" ? "选择语料集分类" : "选择内容类型",
      statsFilterOptions: key === "categoryId" ? this.data.categoryOptions : this.data.contentAttributeOptions,
      statsFilterValue: [key === "categoryId" ? this.data.categoryId : this.data.contentAttribute] });
  },
  onStatsFilterClose() {
    this.setData({ statsFilterVisible: false });
  },
  async onStatsFilterConfirm(e: WechatMiniprogram.CustomEvent) {
    const value = e.detail.value?.[0];
    const selected = this.data.statsFilterOptions.find(item => item.value === value);
    if (!selected) return;
    const current = this.data.statsFilterKey === "categoryId" ? this.data.categoryId : this.data.contentAttribute;
    if (value === current) { this.onStatsFilterClose(); return; }
    if (this.data.statsFilterKey === "categoryId") this.setData({ categoryId: value, categoryText: selected.label });
    else this.setData({ contentAttribute: value, contentAttributeText: selected.label });
    this.onStatsFilterClose();
    await this.loadUsersByDataset(this.data.datasetValue);
  },
  onShow() {
    this.syncTheme();
  },

  /** 下拉时复用首页同步的语料库权限，重新请求当前筛选条件下的看板数据。 */
  async onPullDownRefresh() {
    this.setData({ loading: true });
    const app = getApp<IAppOption>();

    try {
      const datasets =
        app.globalData.writeCorpora ||
        wx.getStorageSync("writeCorpora") ||
        [];
      const selectedDataset = datasets.find(
        (dataset) => dataset.value === this.data.datasetValue,
      );
      const datasetValue = selectedDataset ? this.data.datasetValue : "all";

      this.setData({
        datasets,
        datasetValue,
        datasetText: selectedDataset?.label || "全部",
      });

      await this.loadDatasetCategories();
      await this.loadUsersByDataset(datasetValue, true);
    } catch (error: any) {
      console.error("刷新任务看板失败:", error);
      wx.showToast({
        title: error?.message || "刷新失败",
        icon: "none",
      });
    } finally {

      wx.stopPullDownRefresh();
      this.setData({ loading: false });
    }
  },

  syncTheme() {
    const app = getApp<IAppOption>();
    app.syncNavigationTheme?.();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },
  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    try {
      const app = getApp<IAppOption>();
      // 直接使用登录后组装的 writeCorpora，不需要每次重新计算
      const datasets =
        app?.globalData?.writeCorpora ||
        wx.getStorageSync("writeCorpora") ||
        [];
      console.log("datasets:", datasets);

      // 检查数据是否为空
      if (!datasets || datasets.length === 0) {
        console.warn("语料集数据为空，可能未登录或登录未完成");
        wx.showToast({
          title: "请重新登录或联系管理员",
          icon: "none",
        });
        return;
      }
      const userInfo =
        app.globalData.userInfo || wx.getStorageSync("userInfo") || null;

      // 检查用户信息是否为空
      if (!userInfo) {
        console.warn("用户信息为空，请重新登录");
        wx.showToast({
          title: "请重新登录或联系管理员",
          icon: "none",
        });
        return;
      }

      if (
        (userInfo.role &&
          (userInfo.role === "RESEARCHER" ||
            ["TAGGER_PARTNER", "TAGGER_OUTSOURCING"].includes(
              userInfo.role,
            ))) ||
        userInfo.isSystemAdmin
      ) {
        this.setData({ datasets, currentUserId: userInfo.id });
        await Promise.all([this.loadDatasetCategories(), this.loadUsersByDataset("all")]);
      } else {
        wx.showToast({
          title: "权限有误，请联系管理员",
          icon: "none",
          duration: 4000,
        });
        return;
      }
    } catch (error) {
      console.error("加载语料集失败:", error);
      wx.showToast({
        title: error.errMsg || error.message || "加载数据失败",
        icon: "none",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 打开语料集选择器
   */
  onDatasetPicker() {
    this.setData({
      datasetVisible: true,
    });
  },

  /**
   * 选择器确认事件
   */
  async onPickerChange(e: any) {
    const { value } = e.detail;
    const { datasets } = this.data;
    console.log("value:", value);
    if (value && value.length > 0) {
      if (value[0] === this.data.datasetValue) { this.setData({ datasetVisible: false }); return; }
      const selectedDataset = datasets.find(
        (dataset) => dataset.value === value[0],
      );
      this.setData({
        datasetValue: value[0],
        datasetText: selectedDataset?.label || "未知语料集",
        datasetVisible: false,
      });

      console.log("已选择语料集:", selectedDataset);

      this.syncCategoryOptions();
      await this.loadUsersByDataset(value[0]);
    }
  },

  /**
   * 选择器列变化事件
   */
  onColumnChange(e: any) {
    console.log("列变化:", e.detail);
  },

  /**
   * 选择器取消事件
   */
  onPickerCancel() {
    this.setData({
      datasetVisible: false,
    });
  },

  /**
   * 打开用户选择器
   */
  onUserPicker() {
    this.setData({
      userVisible: true,
      userSearchKeyword: "",
      filteredUsers: this.data.users,
    });
  },

  /**
   * 用户搜索输入事件
   */
  onUserSearchInput(e: any) {
    const keyword = e.detail.value.toLowerCase();
    const { users } = this.data;

    const filtered = users.filter((user) =>
      user.username.toLowerCase().includes(keyword),
    );

    this.setData({
      userSearchKeyword: keyword,
      filteredUsers: filtered,
    });
  },

  /**
   * 清除用户搜索
   */
  onClearUserSearch() {
    this.setData({
      userSearchKeyword: "",
      filteredUsers: this.data.users,
    });
  },

  /**
   * 选择用户
   */
  onSelectUser(e: any) {
    console.log("e.currentTarget.dataset:", e.currentTarget.dataset);
    const { value, label } = e.currentTarget.dataset;
    const isDeselect = this.data.userValue === value;
    this.setData(
      {
        userValue: isDeselect ? "all" : value,
        userText: isDeselect ? "全部" : label,
        userVisible: false,
        userSearchKeyword: "",
      },
      () => { this.renderStats(); },
    );

    console.log("已选择用户:", { value, label });
  },

  /**
   * 用户选择器取消事件
   */
  onUserPickerCancel() {
    const { userValue } = this.data;
    if (userValue !== "all") {
      this.setData(
        {
          userVisible: false,
          userSearchKeyword: "",
          userValue: "all",
          userText: "全部",
        },
        () => { this.renderStats(); },
      );
    } else {
      this.setData({
        userVisible: false,
        userSearchKeyword: "",
      });
    }
  },

  async loadUsersByDataset(datasetName: string, refreshUserProfiles = false) {
    const requestId = ++this.statsRequestId;
    try {
      this.setData({ loading: true });
      let corpusNames = "";
      const app = getApp<IAppOption>();
      const datasets =
        app?.globalData?.writeCorpora || wx.getStorageSync("writeCorpora") || [];
      if (datasetName === "all") {
        corpusNames = datasets
          .map((d) => d.value)
          .filter((d) => d !== "all")
          .join(",");
      } else {
        corpusNames = datasetName;
      }
      // 先不带 assigneeRef 请求，获取所有用户列表
      const taskType = this.data.taskType === "category_review" ? "category_review"
        : this.data.taskType === "content_review" ? "error_fix,data_review"
        : "error_fix,data_review,category_review";
      const query = [`corpusName=${encodeURIComponent(corpusNames)}`, `taskType=${taskType}`];
      if (this.data.categoryId !== "all") query.push(`categoryId=${encodeURIComponent(this.data.categoryId)}`);
      if (this.data.contentAttribute !== "all") query.push(`contentAttribute=${encodeURIComponent(this.data.contentAttribute)}`);
      const data = await request(`/task/stats?${query.join("&")}`);
      if (requestId !== this.statsRequestId) return;
      console.log("data:", data);

      if (!data || !Array.isArray(data.items)) {
        console.error("/task/stats API 返回数据格式错误:", data);
        throw new Error(data?.message || "任务统计数据加载失败");
      }
      this.statsData = data;
      const userIds = [...new Set<string>(data.items.map((item: ItemSummary) => item.assigneeRef))].filter(Boolean);
      // 按用户保存状态，批量中缺失和网络失败分别处理。
      const profiles = this.loadUserProfiles(userIds, refreshUserProfiles);
      this.renderStats();
      this.setData({ loading: false });
      await profiles;
    } catch (error: any) {
      if (requestId !== this.statsRequestId) return;
      console.error("加载任务统计失败", error);
      wx.showToast({ title: error?.message || "加载失败，请重试", icon: "none" });
    } finally {
      if (requestId === this.statsRequestId) {
        this.setData({ loading: false });

      }
    }
  },
  statsData: null as any,
  userProfileStates: null as Map<string, "loading" | "ready" | "missing" | "error"> | null,
  userCache: null as Map<string, any> | null,
  async loadUserProfiles(ids: string[], forceRefresh = false) {
    if (forceRefresh) {
      // 换用新缓存，刷新前仍在途的请求只会写入旧缓存。
      this.userCache = new Map();
      this.userProfileStates = new Map();
    }
    if (!this.userCache) this.userCache = new Map();
    if (!this.userProfileStates) this.userProfileStates = new Map();
    const cache = this.userCache;
    const states = this.userProfileStates;
    const pending = [...new Set(ids)].filter(id => !cache.has(id) && states.get(id) !== "missing" && states.get(id) !== "loading");
    pending.forEach(id => states.set(id, "loading"));
    const chunks: string[][] = [];
    for (let i = 0; i < pending.length; i += 100) chunks.push(pending.slice(i, i + 100));
    await Promise.all(chunks.map(async chunk => {
      try {
        const response = await request(`/users/public?userIds=${encodeURIComponent(chunk.join(","))}`);
        if (!Array.isArray(response?.users)) throw new Error("用户详情数据加载失败");
        const users = new Map<string, any>(response.users.map((user: any) => [user.userId, user]));
        chunk.forEach(id => {
          const user = users.get(id);
          if (user) cache.set(id, user);
          states.set(id, user ? "ready" : "missing");
        });
      } catch {
        chunk.forEach(id => states.set(id, "error"));
      }
      this.renderStats();
    }));
  },
  async onRetryUserProfile(e: WechatMiniprogram.CustomEvent) {
    const id = e.currentTarget.dataset.userId;
    if (!id || this.userProfileStates?.get(id) !== "error") return;
    const pending = this.loadUserProfiles([id]);
    this.renderStats();
    await pending;
  },
  getUserDisplayName(id: string) {
    const user = this.userCache?.get(id);
    if (user) return user.username || "未知用户";
    const state = this.userProfileStates?.get(id);
    if (state === "error") return "加载失败，点击重试";
    return state === "missing" ? "未知用户" : "加载中…";
  },
  renderStats() {
    const data = this.statsData;
    if (!data) return;
    const { datasets, userValue } = this.data;
    const userIds = [...new Set(data.items.map((item: ItemSummary) => item.assigneeRef))] as string[];
    const users = [{ userId: "all", username: "全部", avatar: "" }, ...userIds.map(userId => {
      const user = this.userCache?.get(userId);
      return { userId, username: this.getUserDisplayName(userId), avatar: user?.avatar || "" };
    })];
    const hasCounts = (stats: any) => [stats.totalCount, stats.processedCount, stats.unprocessedCount, stats.totalCorpusCount]
      .some(value => Number(value) > 0);
    const items = data.items
      .filter((item: ItemSummary) => userValue === "all" || item.assigneeRef === userValue)
      .slice().sort((a: ItemSummary, b: ItemSummary) => Number(b.completionRate) - Number(a.completionRate))
      .map((item: ItemSummary) => {
        const user = this.userCache?.get(item.assigneeRef);
        return {
          ...item,
          corpusName: datasets.find(d => d.value === item.corpusId)?.label || "",
          assigneeRefName: this.getUserDisplayName(item.assigneeRef),
          assigneeRefAvatar: user?.avatar || "",
          userProfileFailed: this.userProfileStates?.get(item.assigneeRef) === "error",
          completionRate: formatPercent(item.completionRate),
          totalCorpusCount: formatNumber(item.totalCorpusCount),
          totalCount: formatNumber(item.totalCount),
          processedCount: formatNumber(item.processedCount),
          unprocessedCount: formatNumber(item.unprocessedCount),
        };
      });
    const stats = data.summary || {};
    const keyword = this.data.userSearchKeyword.toLowerCase();
    this.setData({
      items, users,
      filteredUsers: users.filter(user => user.username.toLowerCase().includes(keyword)),
      hasTaskProgress: userValue === "all"
        ? hasCounts(stats) || data.items.some(hasCounts)
        : data.items.some((item: ItemSummary) => item.assigneeRef === userValue && hasCounts(item)),
      summary: {
        ...stats,
        completionRate: formatPercent(stats.completionRate || 0),
        totalCorpusCount: formatNumber(stats.totalCorpusCount || 0),
        totalCount: formatNumber(stats.totalCount || 0),
        processedCount: formatNumber(stats.processedCount || 0),
        unprocessedCount: formatNumber(stats.unprocessedCount || 0),
      },
    });
  },
  onHandleUserTaskList(e) {
    const { userId, datasetName } = e.currentTarget.dataset;
    console.log("ddd:", userId, datasetName);
    wx.navigateTo({
      url: `/pages/others/others?datasetName=${datasetName}&userId=${userId}`,
    });
  },
});
