Component({
  properties: {
    value: { type: String, value: "uncompleted" },
    page: { type: String, value: "index" },
  },
  methods: {
    onChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const { value } = event.detail;
      if (this.data.page === "index") {
        this.triggerEvent("change", { value });
        return;
      }
      const pages = getCurrentPages();
      const indexPosition = pages.findIndex((page) => page.route === "pages/index/index");
      if (indexPosition >= 0 && indexPosition < pages.length - 1) {
        pages[indexPosition].setData({ active: value });
        wx.navigateBack({ delta: pages.length - 1 - indexPosition });
      } else {
        wx.redirectTo({ url: `/pages/index/index?active=${value}` });
      }
    },
  },
});
