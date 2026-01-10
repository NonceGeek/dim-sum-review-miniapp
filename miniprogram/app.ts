// app.ts
import ENV from './config/setting';

let loginPromise: Promise<string> | null = null;

App({
  globalData: {
    userInfo: null,
    accessToken: '',
    refreshToken: '',
  },

  onLaunch(options: any) {
    console.log('小程序启动参数:', options);
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
  ensureLogin(retries = 1): Promise<string> {
    if (!loginPromise) {
      loginPromise = (async () => {
        // 审核模式直接返回 mock token
        if (ENV.IS_REVIEW) {
          console.log('审核模式，使用 mock token');
          const mockToken = 'review-token';
          const mockUser = { nickname: '审核用户', avatar: '' };
          this.globalData.accessToken = mockToken;
          this.globalData.userInfo = mockUser;
          await Promise.all([
            this.setStorage('accessToken', mockToken),
            this.setStorage('userInfo', mockUser),
          ]);
          return mockToken;
        }

        // 尝试从 storage 获取 token
        const token = await this.getStorage('accessToken');
        if (token) {
          this.globalData.accessToken = token;
          console.log('已存在 token，直接使用');
          return token;
        }

        // 如果没有 token，调用 doLogin（带重试机制）
        return await this.tryLogin(retries);
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
      console.warn(`登录失败: ${err.message || err.errMsg || err}`, `剩余重试次数: ${retries}`);
      if (retries > 0) {
        await new Promise(res => setTimeout(res, 500)); // 延迟 500ms 再重试
        return this.tryLogin(retries - 1);
      }
      throw new Error(err.message || '登录失败');
    }
  },

  // 执行登录
  doLogin(): Promise<string> {
    wx.showLoading({ title: '登录中...' });
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (!res.code) {
            wx.hideLoading();
            return reject(new Error('登录失败：未获取 code'));
          }

          wx.request({
            url: `${ENV.API_BASE_URL}/auth/login`,
            method: 'POST',
            data: { code: res.code },
            timeout: 15000, // 审核环境可能较慢
            success: async (resp) => {
              wx.hideLoading();

              console.log('登录接口返回', resp.data); // 审核模式排查用

              const { accessToken, refreshToken, user } = resp.data || {};
              if (!accessToken) return reject(new Error('登录失败：未返回 token'));

              // 更新全局状态
              this.globalData.accessToken = accessToken;
              this.globalData.refreshToken = refreshToken;
              this.globalData.userInfo = user;

              // 异步存储
              await Promise.all([
                this.setStorage('accessToken', accessToken),
                this.setStorage('refreshToken', refreshToken),
                this.setStorage('userInfo', user),
              ]);

              console.log('登录成功', user);
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
});
