import request from "../../utils/http";
const systemInfo = wx.getSystemInfoSync();
const statusBarHeight = systemInfo.statusBarHeight;
const theme = systemInfo.theme;
console.log("theme:", theme);

Page({
  data: {
    active: "uncompleted",
    selected: "all",
    unselected: "all",
    completed: [],
    uncompleted: [],
    statusBarHeight,
    theme,
    ori_completed: [],
    ori_uncompleted: [],
    completedTotal: 0,
    uncompletedTotal: 0,
    uncompletedLoadFinished: false,
    completedLoadFinished: false,
    completedPage: 0,
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
    console.log("event:", event.detail.name);
    console.log("active:", this.data.active);
    const { name } = event.detail;
    this.setData({
      active: name,
    });

    if (name === "completed") {
      if (this.data.completed.length === 0) {
        this.fetchCompletedTasks();
      }
    } else {
      if (this.data.uncompleted.length === 0) {
        this.fetchUncompletedTasks();
      }
    }
  },

  onButtonClick(event: any) {
    const { type } = event.currentTarget.dataset;
    const { active, ori_uncompleted, ori_completed } = this.data;
    const ori_data = active === "completed" ? ori_completed : ori_uncompleted;
    const data =
      type === "all"
        ? ori_data
        : ori_data.filter((ori) => ori.violationType === type);
    if (active === "uncompleted") {
      this.setData({
        uncompleted: data,
        unselected: type,
      });
    } else {
      this.setData({
        completed: data,
        selected: type,
      });
    }
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
      console.error("登录失败", err);
      wx.showToast({
        title: err.message || "登录失败",
        icon: "error",
        duration: 2000,
      });
      return; // 登录失败，不继续执行
    }

    // 登录完成再发请求
    const { page } = options;
    const p = Number(page) || 0;
    this.setData({
      completedPage: p + 1,
      uncompletedPage: p + 1,
    });

    await this.fetchUncompletedTasks();
  },

  async fetchCompletedTasks() {
    wx.showLoading({ title: "加载中..." });
    try {
      let { completed, completedTotal, completedPage, selected } = this.data;
      console.log("comdata:", this.data);
      // 是否已经加载完
      if (completedTotal && completed.length >= completedTotal) {
        this.setData({
          completedLoadFinished: true,
        });
        wx.hideLoading();
        return;
      }

      const page = completedPage;
      const data = await request(`/task/completed?page=${page}`);

      // 防御性检查：确保返回数据格式正确
      if (!data || !Array.isArray(data.items)) {
        console.error("API 返回数据格式错误:", data);
        throw new Error(data?.message || "数据加载失败");
      }

      const reassigninglist = data.items.filter(
        (d) => d.status !== "reassigning"
      );
      const newList = [...completed, ...reassigninglist];

      const filterData =
        selected === "all"
          ? newList
          : newList.filter((ori) => ori.violationType === selected);

      this.setData({
        completed: filterData,
        ori_completed: newList,
        completedTotal: data.pagination?.total - reassigninglist.length || 0,
      });
    } catch (err) {
      console.error("fetchCompletedTasks 失败", err);
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      wx.hideLoading(); // ❗ 无论成功失败都关
    }
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
        (d) => d.status !== "reassigning"
      );
      const newList = [...uncompleted, ...reassigninglist];

      const filterData =
        unselected === "all"
          ? newList
          : newList.filter((ori) => ori.violationType === unselected);

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
    if (this.data.active === "uncompleted") {
      this.setData({
        uncompletedPage: this.data.uncompletedPage + 1,
      });
      await this.fetchUncompletedTasks();
    } else {
      this.setData({
        completedPage: this.data.completedPage + 1,
      });
      await this.fetchCompletedTasks();
    }
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
});
