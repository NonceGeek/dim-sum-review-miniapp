import { showCommonModal } from "../../utils/common-dialog";
import ENV from "../../config/setting";
const systemInfo = wx.getSystemInfoSync();
const statusBarHeight = systemInfo.statusBarHeight;
const { miniProgram } = wx.getAccountInfoSync();
console.log("version:", miniProgram.envVersion, miniProgram.version);

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
    active: "uncompleted",
    listReady: false,
    initialPage: 1,
    headerHeight: 0,
    statusBarHeight,
    theme: "light",
    // 用户信息
    userInfo: {
      nickname: "",
    },
    // 主题相关
    currentTheme: "light" as "light" | "dark",
    themeMode: "auto" as "auto" | "light" | "dark",
    themeModeText: "跟随系统",
    showThemeSheet: false,
    themeOptions: THEME_OPTIONS,
    tabBarColor: ["#94A3B8", "#4A7CF3"],
    datasets: [] as { label: string; value: string }[],
    version: miniProgram.version || `${ENV.VERSION}`,
  },

  onClick(event: any) {
    console.log("event:", event);
    const { taskId, taskStatus } = event.detail;
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

  async onLoad(options) {
    if (options.active === "mine") this.setData({ active: "mine" });
    const app = getApp<IAppOption>();

    // 初始化主题
    this.initTheme();

    try {
      const token = await app.ensureLogin(3);
      console.log("登录成功，token:", token);
    } catch (err) {
      console.log("未登录或 token 失效，跳转登录页");
      wx.reLaunch({
        url: "/pages/login/login",
      });
      return;
    }

    // 获取用户信息
    const userInfo = app.globalData.userInfo ||
      wx.getStorageSync("userInfo") || { nickname: "用户" };
    console.log("init userInfo:", userInfo);
    const datasets =
      app.globalData.writeCorpora || wx.getStorageSync("writeCorpora") || [];
    console.log("datasets:", datasets);
    // Calculate Navbar Height
    const rect = wx.getMenuButtonBoundingClientRect();
    const { statusBarHeight: sysStatusBarHeight } = wx.getSystemInfoSync();
    const navBarHeight =
      (rect.top - sysStatusBarHeight) * 2 + rect.height + sysStatusBarHeight;

    if (
      (userInfo.role &&
        (userInfo.role === "RESEARCHER" ||
          ["TAGGER_PARTNER", "TAGGER_OUTSOURCING"].includes(userInfo.role))) ||
      userInfo.isSystemAdmin
    ) {
      console.log("avatar:", userInfo.avatar);
      this.setData({
        userInfo: userInfo as any,
        datasets,
      });
    } else {
      this.setData({
        headerHeight: navBarHeight,
        userInfo: userInfo as any,
      });
      wx.showToast({
        title: "没有权限访问，请联系管理员",
        icon: "none",
        duration: 4000,
      });
      return;
    }

    // 登录完成再发请求
    const { page } = options;
    const p = Number(page) || 0;

    this.setData({
      initialPage: p + 1,
      listReady: true,
      headerHeight: navBarHeight,
    });

  },

  onShow() {
    // 每次显示页面时同步主题状态
    this.syncTheme();
    if (this.data.listReady) {
      void this.selectComponent("#task-list")?.loadDatasetCategories();
    }
  },

  /** 首页下拉刷新时，获取当前用户最新的语料库权限。 */
  async refreshAllowedCorpora() {
    const app = getApp<IAppOption>();
    try {
      await app.syncAllowedCorpora();
      await new Promise<void>((resolve) => {
        this.setData({ datasets: app.globalData.writeCorpora }, () => {
          this.selectComponent("#task-list")?.resetCorpus(false);
          resolve();
        });
      });
    } catch (error) {
      console.error("刷新 allowedCorpora 失败:", error);
      wx.showToast({
        title: "语料库权限刷新失败",
        icon: "none",
      });
    }
  },

  async onPullDownRefresh() {
    try {
      await this.refreshAllowedCorpora();
      await this.selectComponent("#task-list")?.reloadTasks();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 初始化主题
   */
  /**
   * 初始化主题
   */
  initTheme() {
    const app = getApp<any>();
    const themeMode = app.getThemeMode() || "auto";
    const currentTheme = app.getTheme() || "light";

    this.setData({
      themeMode,
      currentTheme,
      themeModeText: THEME_MODE_TEXT[themeMode],
      tabBarColor:
        currentTheme === "dark"
          ? ["#8B949E", "#5D8CF5"]
          : ["#94A3B8", "#4A7CF3"],
    });
  },

  /**
   * 同步主题状态
   */
  syncTheme() {
    const app = getApp<any>();
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
        tabBarColor:
          currentTheme === "dark"
            ? ["#8B949E", "#5D8CF5"]
            : ["#94A3B8", "#4A7CF3"],
      });
    }
  },

  /**
   * 点击主题设置
   */
  onThemeSettingTap() {
    this.setData({
      showThemeSheet: true,
    });
  },

  /**
   * 选择主题
   */
  onThemeSelect(e: any) {
    const { value } = e.detail.selected;
    const app = getApp<any>();

    app.setThemeMode(value);

    // 更新页面状态
    setTimeout(() => {
      const currentTheme = app.getTheme();
      this.setData({
        themeMode: value,
        currentTheme,
        themeModeText: THEME_MODE_TEXT[value],
        showThemeSheet: false,
        tabBarColor:
          currentTheme === "dark"
            ? ["#8B949E", "#5D8CF5"]
            : ["#94A3B8", "#4A7CF3"],
      });
    }, 100);
  },

  /**
   * 关闭主题选择弹窗
   */
  onThemeSheetClose() {
    this.setData({
      showThemeSheet: false,
    });
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
    showCommonModal(this, {
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
      currentTheme: params.theme,
      tabBarColor:
        params.theme === "dark"
          ? ["#8B949E", "#4A7CF3"]
          : ["#94A3B8", "#4A7CF3"],
    });
  },
});
