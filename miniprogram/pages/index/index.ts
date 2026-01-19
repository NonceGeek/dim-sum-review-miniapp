import request from "../../utils/http";
const systemInfo = wx.getSystemInfoSync();
const statusBarHeight = systemInfo.statusBarHeight;
const theme = systemInfo.theme;
console.log("theme:", theme);

Page({
  data: {
    active: "uncompleted",
    unselected: "all",
    uncompleted: [] as any[],
    headerHeight: 0,
    statusBarHeight,
    theme,
    ori_uncompleted: [] as any[],
    uncompletedTotal: 0,
    uncompletedLoadFinished: false,
    uncompletedPage: 0,
  },
  onClick(event: any) {
    console.log("event:", event);
    const { taskId, taskStatus } = event.target.dataset;
    wx.navigateTo({
      url: `/pages/task/task?taskId=${taskId}&status=${taskStatus}`,
    });
  },
  onChange(event: any) {
    console.log("event:", event.detail.value);
    const { value } = event.detail;
    this.setData({
      active: value,
    });
  },

  onButtonClick(event: any) {
    const { type } = event.currentTarget.dataset;
    const { ori_uncompleted } = this.data;

    let data =
      type === "all"
        ? ori_uncompleted
        : ori_uncompleted.filter((ori) => ori.violationType === type);
    if (type === "data_review") {
      data = ori_uncompleted.filter((ori) => ori.taskType === type);
    }
    this.setData({
      uncompleted: data,
      unselected: type,
    });
  },
  onLaunch() {
    wx.getSystemInfo({
      success(res) {
        console.log("当前主题:", res.theme); // 可能是
      },
    });
  },
  async onLoad(options) {
    const app = getApp();

    try {
      const token = await app.ensureLogin(3); // 参数 1 表示登录失败后再尝试一次
      console.log("登录成功，token:", token);
    } catch (err) {
      console.log("未登录或 token 失效，跳转登录页");
      wx.reLaunch({
        url: "/pages/login/login",
      });
      return; // 登录失败，不继续执行
    }

    // 登录完成再发请求
    const { page } = options;
    const p = Number(page) || 0;

    // Calculate Navbar Height
    const rect = wx.getMenuButtonBoundingClientRect();
    const { statusBarHeight } = wx.getSystemInfoSync();
    // Navbar height calculation: (capsule top - status bar) * 2 + capsule height + status bar
    const navBarHeight =
      (rect.top - statusBarHeight) * 2 + rect.height + statusBarHeight;

    this.setData({
      uncompletedPage: p + 1,
      headerHeight: navBarHeight,
    });

    await this.fetchUncompletedTasks();
  },

  async fetchUncompletedTasks() {
    wx.showLoading({ title: "加载中..." });
    try {
      let { uncompleted, uncompletedTotal, uncompletedPage, unselected } =
        this.data;
      console.log("undata:", this.data);
      if (uncompletedTotal && uncompleted.length >= uncompletedTotal) {
        this.setData({
          uncompletedLoadFinished: true,
        });
        wx.hideLoading();
        return;
      }

      const page = uncompletedPage;
      const data = await request(`/task/uncompleted?page=${page}`);

      // 防御性检查：确保返回数据格式正确
      if (!data || !Array.isArray(data.items)) {
        console.error("API 返回数据格式错误:", data);
        throw new Error(data?.message || "数据加载失败");
      }

      const reassigninglist = data.items.filter(
        (d) => d.status !== "reassigning",
      );
      const newList = [...uncompleted, ...reassigninglist];

      let filterData =
        unselected === "all"
          ? newList
          : newList.filter((ori) => ori.violationType === unselected);

      if (unselected === "data_review") {
        filterData = newList.filter((ori) => ori.taskType === unselected);
      }
      this.setData({
        uncompleted: filterData,
        ori_uncompleted: newList,
        uncompletedTotal: data.pagination?.total - reassigninglist.length || 0,
      });
    } catch (err) {
      console.error("fetchUncompletedTasks 失败", err);
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      wx.hideLoading(); // ❗ 无论成功失败都关
    }
  },

  async onClickMore() {
    this.setData({
      uncompletedPage: this.data.uncompletedPage + 1,
    });
    await this.fetchUncompletedTasks();
  },
  onGoBack() {
    wx.navigateBack({
      delta: 1,
    });
  },
  onShareAppMessage() {
    return {
      title: "任务列表",
      path: "pages/index/index",
    };
  },
  onShareTimeline() {
    return {
      title: "任务列表",
      path: "pages/index/index",
    };
  },
  onLogout() {
    wx.showModal({
      title: "提示",
      content: "确定要退出登录吗？",
      success: (res) => {
        if (res.confirm) {
          getApp<IAppOption>().logout();
        }
      },
    });
  },
  onThemeChange(params: any) {
    console.log("主题变化:", params.theme);
    this.setData({
      theme: params.theme,
    });
  },
});
