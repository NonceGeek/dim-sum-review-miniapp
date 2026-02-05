const app = getApp<IAppOption>();

Page({
  data: {
    loading: false,
    currentTheme: "light",
    showPhonePopup: false,
    phone: "",
    code: "",
    counting: false,
    codeButtonText: "发送验证码",
    sendingCode: false,
    logining: false,
  },

  onLoad() {
    this.syncTheme();
  },

  onShow() {
    this.syncTheme();
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },

  async handleLogin() {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      // Reuse the existing doLogin method which handles wx.login + backend request
      await app.doLogin();

      wx.showToast({
        title: "登录成功",
        icon: "success",
      });

      // Redirect to main page
      setTimeout(() => {
        wx.reLaunch({
          url: "/pages/index/index",
        });
      }, 1500);
    } catch (err: any) {
      console.error("Login failed", err);
      wx.showToast({
        title: err.message || "登录失败",
        icon: "none",
        duration: 2000,
      });
      this.setData({ loading: false });
    }
  },

  // 打开手机号登录弹窗
  handlePhoneLogin() {
    this.setData({
      showPhonePopup: true,
    });
  },

  // 关闭弹窗
  onPopupClose(e: any) {
    this.setData({
      showPhonePopup: e.detail.visible,
    });
  },

  // 手机号输入
  onPhoneChange(e: any) {
    this.setData({
      phone: e.detail.value,
    });
  },

  // 验证码输入
  onCodeChange(e: any) {
    this.setData({
      code: e.detail.value,
    });
  },

  // 发送验证码
  async sendCode() {
    const { phone, counting } = this.data;

    if (counting) return;

    // 验证手机号
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({
        title: "请输入正确的手机号",
        icon: "none",
      });
      return;
    }

    this.setData({ sendingCode: true });

    try {
      console.log("发送验证码到:", phone);
      const res = await app.doSendSms(phone);
      if (res.success) {
        wx.showToast({
          title: "验证码已发送",
          icon: "success",
          duration: 2000,
        });

        // 开始倒计时
        this.setData({
          counting: true,
          sendingCode: false,
        });
      }
    } catch (err: any) {
      console.error("发送验证码失败", err);
      wx.showToast({
        title: err.message || "发送失败",
        icon: "none",
        duration: 2000,
      });
      this.setData({ sendingCode: false });
    }
  },

  // 倒计时结束
  onCountDownFinish() {
    this.setData({
      counting: false,
    });
  },

  // 确认手机号登录
  async confirmPhoneLogin() {
    const { phone, code, logining } = this.data;

    if (logining) return;

    // 验证输入
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({
        title: "请输入正确的手机号",
        icon: "none",
        duration: 2000,
      });
      return;
    }

    if (!code || code.length !== 6) {
      wx.showToast({
        title: "请输入6位验证码",
        icon: "none",
        duration: 2000,
      });
      return;
    }

    this.setData({ logining: true });

    try {
      await app.doPhoneLogin(phone, code);

      wx.showToast({
        title: "登录成功",
        icon: "success",
        duration: 2000,
      });

      // 关闭弹窗
      this.setData({
        showPhonePopup: false,
      });

      // 跳转到主页
      setTimeout(() => {
        wx.reLaunch({
          url: "/pages/index/index",
        });
      }, 1500);
    } catch (err: any) {
      console.error("手机号登录失败", err);
      wx.showToast({
        title: err || "登录失败",
        icon: "none",
        duration: 2000,
      });
      this.setData({ logining: false });
    }
  },
});
