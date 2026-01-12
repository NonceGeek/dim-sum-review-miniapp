const app = getApp<IAppOption>();

Page({
  data: {
    loading: false,
  },

  async handleLogin() {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      // Reuse the existing doLogin method which handles wx.login + backend request
      await app.doLogin();
      
      wx.showToast({
        title: '登录成功',
        icon: 'success',
      });

      // Redirect to main page
      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/index/index',
        });
      }, 1500);

    } catch (err: any) {
      console.error('Login failed', err);
      wx.showToast({
        title: err.message || '登录失败',
        icon: 'none',
        duration: 2000,
      });
      this.setData({ loading: false });
    }
  },
});
