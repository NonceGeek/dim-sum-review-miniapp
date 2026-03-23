import { formatNumber, formatPercent } from "../../utils/number";
import request from "../../utils/http";

const app = getApp<{
  globalData: {
    allowedCorpora: ICorpusItem[];
    categories: any[];
    writeCorpora: { label: string; value: string }[];
    userInfo: UserInfo | null;
  };
}>();

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
    users: [] as { label: string; value: string; avatar: string }[],
    userSearchKeyword: "",
    filteredUsers: [] as { label: string; value: string }[],
    summary: {} as TaskSummary,
    items: [] as ItemSummary[],
    currentUserId: "",
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    try {
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
        title: "加载语料集失败",
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
      user.label.toLowerCase().includes(keyword),
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
    const { value, label } = e.currentTarget.dataset;
    this.setData({
      userValue: value,
      userText: label,
      userVisible: false,
      userSearchKeyword: "",
    });

    console.log("已选择用户:", { value, label });

    // TODO: 根据选择的用户加载相关数据
  },

  /**
   * 用户选择器取消事件
   */
  onUserPickerCancel() {
    this.setData({
      userVisible: false,
      userSearchKeyword: "",
    });
  },

  async loadUsersByDataset(datasetName: string) {
    wx.showLoading({
      title: "加载中...",
      mask: true,
      duration: 2000,
    });
    let corpusNames = "";
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
    const data = await request(`/tasks/stats?corpusName=${corpusNames}`);
    console.log("data:", data);

    const summary = {
      ...data.summary,
      completionRate: formatPercent(data.summary.completionRate),
      totalCorpusCount: formatNumber(data.summary.totalCorpusCount),
      totalCount: formatNumber(data.summary.totalCount),
      processedCount: formatNumber(data.summary.processedCount),
      unprocessedCount: formatNumber(data.summary.unprocessedCount),
    };

    const items = data.items.map((item: ItemSummary) => ({
      ...item,
      corpusName: datasets.find((d) => d.value === item.corpusId)?.label || "",
      completionRate: formatPercent(item.completionRate),
      totalCorpusCount: formatNumber(item.totalCorpusCount),
      totalCount: formatNumber(item.totalCount),
      processedCount: formatNumber(item.processedCount),
      unprocessedCount: formatNumber(item.unprocessedCount),
    }));
    console.log("items:", items);
    const users = data.items.map((item) => ({
      label: item.nickname || "",
      value: item.assigneeRef,
      avatar: item.avatar || "",
    }));
    this.setData({
      summary,
      items,
      users,
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
