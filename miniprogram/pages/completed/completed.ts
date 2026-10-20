
Page({
  data: {
    listReady: false,
    initialPage: 1,
    headerHeight: 0,
    datasets: [] as { label: string; value: string }[],
  },

  async onLoad(options) {
    const app = getApp<IAppOption>();
    const { page } = options;
    const p = Number(page) || 0;

    // Calculate Navbar Height
    const rect = wx.getMenuButtonBoundingClientRect();
    const { statusBarHeight } = wx.getSystemInfoSync();
    // Navbar height calculation: (capsule top - status bar) * 2 + capsule height + status bar
    const navBarHeight =
      (rect.top - statusBarHeight) * 2 + rect.height + statusBarHeight;
    const datasets =
      app.globalData.writeCorpora || wx.getStorageSync("writeCorpora") || [];

    this.setData({
      initialPage: p + 1,
      listReady: true,
      headerHeight: navBarHeight,
      datasets: [{ label: "全部", value: "all" }, ...datasets.filter((item) => item.value !== "all")],
    });

    this.syncTheme();
  },

  onShow() {
    this.syncTheme();
  },

  syncTheme() {
    const app = getApp<any>();
    app.syncNavigationTheme?.();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },

  onClick(event: any) {
    const { taskId, taskStatus } = event.detail;
    wx.navigateTo({
      url: `/pages/task/task?taskId=${taskId}&status=${taskStatus}&tab=mine`,
    });
  },

  onGoBack() {
    wx.navigateBack({
      delta: 1,
    });
  },
});
