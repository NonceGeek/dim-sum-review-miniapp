// app.ts
import ENV from "./config/setting";

let loginPromise: Promise<string> | null = null;

// 主题类型定义
export type ThemeMode = 'auto' | 'light' | 'dark';
export type ThemeValue = 'light' | 'dark';

App({
  globalData: {
    userInfo: null,
    accessToken: "",
    refreshToken: "",
    allowedCorpora: [],
    themeMode: 'auto' as ThemeMode,  // 用户设置：auto/light/dark
    theme: 'light' as ThemeValue,     // 实际应用的主题：light/dark
  },

  onLaunch(options: any) {
    console.log("小程序启动参数:", options);
    
    // 初始化主题
    this.initTheme();
    
    // 监听系统主题变化
    wx.onThemeChange((result) => {
      console.log('系统主题变化:', result.theme);
      if (this.globalData.themeMode === 'auto') {
        this.applyTheme(result.theme as ThemeValue);
      }
    });
  },

  /**
   * 初始化主题设置
   */
  async initTheme() {
    try {
      const savedMode = await this.getStorage('themeMode') as ThemeMode;
      const systemInfo = wx.getSystemInfoSync();
      const systemTheme = (systemInfo.theme || 'light') as ThemeValue;
      
      if (savedMode && ['auto', 'light', 'dark'].includes(savedMode)) {
        this.globalData.themeMode = savedMode;
        if (savedMode === 'auto') {
          this.applyTheme(systemTheme);
        } else {
          this.applyTheme(savedMode as ThemeValue);
        }
      } else {
        // 默认跟随系统
        this.globalData.themeMode = 'auto';
        this.applyTheme(systemTheme);
      }
    } catch (e) {
      console.error('初始化主题失败:', e);
      this.applyTheme('light');
    }
  },

  /**
   * 应用主题到页面
   */
  applyTheme(theme: ThemeValue) {
    this.globalData.theme = theme;
    
    // 设置页面根节点的主题类
    const pages = getCurrentPages();
    pages.forEach((page: any) => {
      if (typeof page.onThemeChange === 'function') {
        page.onThemeChange({ theme });
      } else if (page.setData) {
        page.setData({ currentTheme: theme });
      }
    });
    
    // 设置导航栏样式
    const navBarStyle = theme === 'dark' 
      ? { backgroundColor: '#161B22', frontColor: '#ffffff' }
      : { backgroundColor: '#FFFFFF', frontColor: '#000000' };
    
    wx.setNavigationBarColor({
      frontColor: navBarStyle.frontColor as '#ffffff' | '#000000',
      backgroundColor: navBarStyle.backgroundColor,
      animation: { duration: 300, timingFunc: 'easeInOut' }
    });
    
    console.log('主题已应用:', theme);
  },

  /**
   * 获取当前主题模式
   */
  getThemeMode(): ThemeMode {
    return this.globalData.themeMode;
  },

  /**
   * 获取当前实际主题
   */
  getTheme(): ThemeValue {
    return this.globalData.theme;
  },

  /**
   * 设置主题模式
   */
  async setThemeMode(mode: ThemeMode) {
    this.globalData.themeMode = mode;
    await this.setStorage('themeMode', mode);
    
    if (mode === 'auto') {
      const systemInfo = wx.getSystemInfoSync();
      this.applyTheme((systemInfo.theme || 'light') as ThemeValue);
    } else {
      this.applyTheme(mode as ThemeValue);
    }
    
    console.log('主题模式已设置:', mode);
  },

  // 封装异步获取 storage
  getStorage(key: string): Promise<any> {
    return new Promise((resolve) => {
      wx.getStorage({
        key,
        success: (res) => resolve(res.data),
        fail: () => resolve(null),
      });
    });
  },

  setStorage(key: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      wx.setStorage({
        key,
        data,
        success: () => resolve(),
        fail: reject,
      });
    });
  },

  /**
   * 确保登录，返回 accessToken，可设置重试次数
   * 自动支持审核模式 mock token
   */
  ensureLogin(_retries = 1): Promise<string> {
    if (!loginPromise) {
      loginPromise = (async () => {
        // 审核模式直接返回 mock token
        if (ENV.IS_REVIEW) {
          console.log("审核模式，使用 mock token");
          const mockToken = "review-token";
          const mockUser: { nickname: string; avatar: string } = { nickname: "审核用户", avatar: "" };
          this.globalData.accessToken = mockToken;
          this.globalData.userInfo = mockUser as any;
          await Promise.all([
            this.setStorage("accessToken", mockToken),
            this.setStorage("userInfo", mockUser),
          ]);
          return mockToken;
        }

        // 尝试从 storage 获取 token
        const token = await this.getStorage("accessToken");
        if (token) {
          this.globalData.accessToken = token;
          console.log("已存在 token，直接使用");
          return token;
        }

        console.log("No token in storage, manual login required.");
        throw new Error("需要手动登录");
      })().finally(() => {
        loginPromise = null; // 登录完成后清掉
      });
    }
    return loginPromise;
  },

  // 尝试登录，失败时自动重试
  async tryLogin(retries: number): Promise<string> {
    try {
      return await this.doLogin();
    } catch (err: any) {
      console.warn(
        `登录失败: ${err.message || err.errMsg || err}`,
        `剩余重试次数: ${retries}`,
      );
      if (retries > 0) {
        await new Promise((res) => setTimeout(res, 500)); // 延迟 500ms 再重试
        return this.tryLogin(retries - 1);
      }
      throw new Error(err.message || "登录失败");
    }
  },

  // 执行登录
  doLogin(): Promise<string> {
    wx.showLoading({ title: "登录中..." });
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (!res.code) {
            wx.hideLoading();
            return reject(new Error("登录失败：未获取 code"));
          }

          wx.request({
            url: `${ENV.API_BASE_URL}/auth/login`,
            method: "POST",
            data: { code: res.code },
            timeout: 15000, // 审核环境可能较慢
            success: async (resp) => {
              wx.hideLoading();

              console.log("登录接口返回", resp.data); // 审核模式排查用

              const { accessToken, refreshToken, user, allowedCorpora } =
                (resp.data as any) || {};
              if (!accessToken)
                return reject(new Error("登录失败：未返回 token"));
              // 更新全局状态
              this.globalData.accessToken = accessToken;
              this.globalData.refreshToken = refreshToken;
              this.globalData.userInfo = user;
              this.globalData.allowedCorpora = allowedCorpora;
              // 异步存储
              await Promise.all([
                this.setStorage("accessToken", accessToken),
                this.setStorage("refreshToken", refreshToken),
                this.setStorage("userInfo", user),
                this.setStorage("allowedCorpora", allowedCorpora),
              ]);

              console.log("登录成功", user);
              resolve(accessToken);
            },
            fail: (err) => {
              wx.hideLoading();
              reject(err);
            },
          });
        },
        fail: (err) => {
          wx.hideLoading();
          reject(err);
        },
      });
    });
  },

  logout() {
    this.globalData.userInfo = null;
    this.globalData.accessToken = "";
    this.globalData.refreshToken = "";
    this.globalData.allowedCorpora = [];

    wx.removeStorage({ key: "userInfo" });
    wx.removeStorage({ key: "accessToken" });
    wx.removeStorage({ key: "refreshToken" });
    wx.removeStorage({ key: "allowedCorpora" });

    wx.reLaunch({
      url: "/pages/login/login",
    });
  },
});
