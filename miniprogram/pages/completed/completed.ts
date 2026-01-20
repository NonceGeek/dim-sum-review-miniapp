import request from "../../utils/http";

Page({
  data: {
    selected: "all",
    completed: [] as any[],
    ori_completed: [] as any[],
    total: 0,
    page: 0,
    loadFinished: false,
    headerHeight: 0,
  },

  async onLoad(options) {
    const { page } = options;
    const p = Number(page) || 0;

    // Calculate Navbar Height
    const rect = wx.getMenuButtonBoundingClientRect();
    const { statusBarHeight } = wx.getSystemInfoSync();
    // Navbar height calculation: (capsule top - status bar) * 2 + capsule height + status bar
    const navBarHeight = (rect.top - statusBarHeight) * 2 + rect.height + statusBarHeight;
    
    this.setData({
      page: p + 1,
      headerHeight: navBarHeight,
    });
    
    this.syncTheme();
    await this.fetchTasks();
  },

  onShow() {
    this.syncTheme();
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme() || 'light';
    this.setData({ currentTheme });
  },

  async fetchTasks() {
    wx.showLoading({ title: "加载中..." });
    try {
      let { completed, total, page, selected } = this.data;
      
      // 是否已经加载完
      if (total && completed.length >= total) {
        this.setData({
          loadFinished: true,
        });
        wx.hideLoading();
        return;
      }

      const data = await request(`/task/completed?page=${page}`);

      // 防御性检查：确保返回数据格式正确
      if (!data || !Array.isArray(data.items)) {
        console.error("API 返回数据格式错误:", data);
        throw new Error(data?.message || "数据加载失败");
      }

      const reassigninglist = data.items.filter(
        (d: any) => d.status !== "reassigning"
      );
      const newList = [...completed, ...reassigninglist];

      const filterData =
        selected === "all"
          ? newList
          : newList.filter((ori) => ori.violationType === selected);

      this.setData({
        completed: filterData,
        ori_completed: newList,
        total: data.pagination?.total - reassigninglist.length || 0,
      });
    } catch (err) {
      console.error("fetchTasks 失败", err);
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  onButtonClick(event: any) {
    const { type } = event.currentTarget.dataset;
    const { ori_completed } = this.data;
    const data =
      type === "all"
        ? ori_completed
        : ori_completed.filter((ori) => ori.violationType === type);

    this.setData({
      completed: data,
      selected: type,
    });
  },

  async onLoadMore() {
    this.setData({
      page: this.data.page + 1,
    });
    await this.fetchTasks();
  },

  onClick(event: any) {
    const { taskId, taskStatus } = event.target.dataset;
    wx.navigateTo({
      url: `/pages/task/task?taskId=${taskId}&status=${taskStatus}`,
    });
  },

  onGoBack() {
    wx.navigateBack({
      delta: 1,
    });
  },
});
