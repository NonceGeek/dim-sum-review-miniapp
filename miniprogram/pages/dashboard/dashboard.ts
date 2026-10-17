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
      await this.loadUsersByDataset(datasetValue);
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
    const currentTheme = app.getTheme() || "light";
    wx.setNavigationBarColor({
      frontColor: currentTheme === "dark" ? "#ffffff" : "#000000",
      backgroundColor: currentTheme === "dark" ? "#161B22" : "#FFFFFF",
    });
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
        await this.loadDatasetCategories();
        await this.loadUsersByDataset("all");
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
      async () => {
        await this.loadUsersByDataset(this.data.datasetValue);
      },
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
        async () => {
          await this.loadUsersByDataset(this.data.datasetValue);
        },
      );
    } else {
      this.setData({
        userVisible: false,
        userSearchKeyword: "",
      });
    }
  },

  async loadUsersByDataset(datasetName: string) {
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
      // 获取所有用户信息
      const userIdsArray = [
        ...new Set(data.items.map((item: ItemSummary) => item.assigneeRef)),
      ];

      if (userIdsArray.length > 100) {
        throw new Error("用户数据异常，最多支持100个用户查询，请联系管理员");
      }
      const userIds = userIdsArray.join(",");

      const userlist = userIdsArray.length
        ? await request(`/users/public?userIds=${userIds}`)
        : { users: [] };
      if (requestId !== this.statsRequestId) return;

      if (!userlist || !Array.isArray(userlist.users)) {
        console.error("/users/public API 返回数据格式错误:", data);
        throw new Error(data?.message || "用户详情数据加载失败");
      }
      // 格式化 items 并关联用户信息
      let items = data.items
        .map((item: ItemSummary) => {
          const user = userlist.users.find(
            (u: any) => u.userId === item.assigneeRef,
          );
          return {
            assigneeRef: item.assigneeRef,
            corpusId: item.corpusId,
            corpusName:
              datasets.find((d) => d.value === item.corpusId)?.label || "",
            assigneeRefName: user?.username || "",
            assigneeRefAvatar: user?.avatar || "",
            completionRate: formatPercent(item.completionRate),
            totalCorpusCount: formatNumber(item.totalCorpusCount),
            totalCount: formatNumber(item.totalCount),
            processedCount: formatNumber(item.processedCount),
            unprocessedCount: formatNumber(item.unprocessedCount),
          };
        })
        .sort((a: any, b: any) => b.completionRate - a.completionRate);

      // 如果选择了特定用户，筛选该用户的 items
      const { userValue } = this.data;
      if (userValue && userValue !== "all") {
        items = items.filter((item: any) => item.assigneeRef === userValue);
      }

      // 构建用户列表
      const users = [
        { userId: "all", username: "全部" },
        ...(userlist.users || []),
      ];

      const hasCounts = (stats: any) =>
        [stats.totalCount, stats.processedCount, stats.unprocessedCount, stats.totalCorpusCount]
          .some(value => Number(value) > 0);
      const hasTaskProgress = userValue === "all"
        ? hasCounts(data.summary || {}) || data.items.some(hasCounts)
        : data.items.some((item: ItemSummary) => item.assigneeRef === userValue && hasCounts(item));

      // 格式化 summary
      const stats = data.summary || {};
      const summary = {
        ...stats,
        completionRate: formatPercent(stats.completionRate || 0),
        totalCorpusCount: formatNumber(stats.totalCorpusCount || 0),
        totalCount: formatNumber(stats.totalCount || 0),
        processedCount: formatNumber(stats.processedCount || 0),
        unprocessedCount: formatNumber(stats.unprocessedCount || 0),
      };

      console.log("items:", items);
      console.log("summary:", summary);
      this.setData({
        summary,
        hasTaskProgress,
        items,
        users,
        filteredUsers: users,
        loading: false,
      });
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
  onHandleUserTaskList(e) {
    const { userId, datasetName } = e.currentTarget.dataset;
    console.log("ddd:", userId, datasetName);
    wx.navigateTo({
      url: `/pages/others/others?datasetName=${datasetName}&userId=${userId}`,
    });
  },
});
