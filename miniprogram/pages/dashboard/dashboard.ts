import { formatNumber, formatPercent } from "../../utils/number";
import request from "../../utils/http";

Page({
  /**
   * 页面的初始数据
   */
  data: {
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
    items: [] as ItemSummary[],
    currentUserId: "",
    loading: false,
  },
  onShow() {
    this.syncTheme();
  },

  syncTheme() {
    const app = getApp<IAppOption>();
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
        await this.loadUsersByDataset("all");
        this.setData({
          datasets,
          currentUserId: userInfo.id,
        });
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

      // TODO: 根据选择的语料集加载相关任务数据
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
    this.setData({ loading: true });
    wx.showLoading({
      title: "加载中...",
      mask: true,
    });
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
    const data = await request(`/task/stats?corpusName=${corpusNames}`);
    console.log("data:", data);

    if (!data || !Array.isArray(data.items)) {
      console.error("/task/stats API 返回数据格式错误:", data);
      throw new Error(data?.message || "任务统计数据加载失败");
    }
    // 获取所有用户信息
    const userIdsArray = [
      ...new Set(data.items.map((item: ItemSummary) => item.assigneeRef)),
    ];

    if (!userIdsArray || !userIdsArray.length) {
      throw new Error("用户数据异常");
    }

    if (userIdsArray.length > 100) {
      throw new Error("用户数据异常，最多支持100个用户查询，请联系管理员");
    }
    const userIds = userIdsArray.join(",");

    let userlist = await request(`/users/public?userIds=${userIds}`);

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

    // 格式化 summary
    const summary = {
      ...data.summary,
      completionRate: formatPercent(data.summary.completionRate),
      totalCorpusCount: formatNumber(data.summary.totalCorpusCount),
      totalCount: formatNumber(data.summary.totalCount),
      processedCount: formatNumber(data.summary.processedCount),
      unprocessedCount: formatNumber(data.summary.unprocessedCount),
    };

    console.log("items:", items);
    console.log("summary:", summary);
    this.setData({
      summary,
      items,
      users,
      filteredUsers: users,
      loading: false,
    });
    wx.hideLoading();
  },
  onHandleUserTaskList(e) {
    const { userId, datasetName } = e.currentTarget.dataset;
    console.log("ddd:", userId, datasetName);
    wx.navigateTo({
      url: `/pages/others/others?datasetName=${datasetName}&userId=${userId}`,
    });
  },
});
