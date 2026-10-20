Page({
  data: {
    url: "",
  },

  onShow() {
    getApp<IAppOption>().syncNavigationTheme?.();
  },

  onLoad(options: any) {
    const { url } = options;
    if (url) {
      this.setData({
        url: decodeURIComponent(url),
      });
    }
  },
});
