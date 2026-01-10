import { ITaskDetail } from "../../types/task";
import { formatTime } from "../../utils/date";
import request, { agent_request, public_request } from "../../utils/http";
const systemInfo = wx.getSystemInfoSync();
const statusBarHeight = systemInfo.statusBarHeight;
Page({
  /**
   * 页面的初始数据
   */
  data: {
    taskId: "",
    status: "notified",
    taskDetail: [],
    currentIndex: 0,
    statusBarHeight,
    hidden: false,
    violationType: "", //检查类型
    cantonesePronunciations: [] as string[],
    phrases: [] as string[],
    sentiments: [],
    completedAt: "",
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options: { taskId: string }) {
    const { taskId, status } = options;
    this.setData({
      taskId,
      status,
    });
    console.log("[页面] onLoad options:", options);
    await this.getTask(taskId);
  },
  async getTask(taskId: string) {
    wx.showLoading({
      title: "加载中...",
    });
    console.log('status:',this.data.status)
    try {
      const { id } = wx.getStorageSync("userInfo");
      const [data, categories, view] = await Promise.all([
        request(`/task/${taskId}`),
        public_request("/corpus_categories"),
        this.data.status === "completed" ? null : agent_request(`/tasks/${this.data.taskId}/view`, {
          method: "POST",
          data: {
            actorRef: id,
          },
        })
      ]);
      console.log("task data:", data);
      console.log("categories:", categories);
      console.log("view:", view)
      let entity = [] as ITaskDetail[];
      if (data.violationType === "phonetic_mismatch") {
        console.log('selectedSuggestion:', data.selectedSuggestion)
        entity = (this.data.status === "completed"
          ? [data.selectedSuggestion]
          : data.suggestions
        ).map((s) => {
          const json = {
            data: data.context.problemChar,
            sentenseText: data.context.sentenceText,
          };
          json.source =
            s.source === "lexicon" ? s.lexiconBaseCorpusName : s.source;
          const fd_cat = categories.find((cat) => cat.name === json.source);
          json.source_name = fd_cat ? fd_cat.nickname : "llm";
          json.cantonesePronunciations = [s.value];
          json.suggestions = s;

          return json;
        });
      } else {
        console.log('selectedSuggestion:', data.selectedSuggestion)
        entity = (this.data.status === "completed"
          ? [data.selectedSuggestion]
          : data.suggestions
        ).map((s) => {
          const json = {
            data: data.context.sentenceText,
            phrases_join: s.value,
            suggestions: s,
          };
          json.source =
            s.source === "lexicon" ? s.lexiconBaseCorpusName : s.source;
          const fd_cat = categories.find((cat) => cat.name === json.source);
          json.source_name = fd_cat ? fd_cat.nickname : "llm";
          return json;
        });
      }

      wx.hideLoading();
      this.setData({
        taskDetail: entity || [],
        violationType: data.violationType,
        completedAt: formatTime(data.resolvedAt),
      });
    } catch (err) {
      console.error("[页面] 请求异常:", err);
    }
  },
  onSwiperChange(e) {
    this.setData({ currentIndex: e.detail.current });
  },
  async onSubmit() {
    const { id } = wx.getStorageSync("userInfo");
    const currentIndex = this.data.currentIndex;
    const taskDetail = this.data.taskDetail;
    const preSubmit = taskDetail[currentIndex];
    wx.showLoading({ title: "请稍后..." });
    // const post_view = await agent_request(`/tasks/${this.data.taskId}/view`, {
    //   method: "POST",
    //   data: {
    //     actorRef: id,
    //   },
    // });
    // if (post_view.ok) {
    const data = await request(`/task/submit/${this.data.taskId}`, {
      method: "POST",
      data: {
        actorRef: id,
        selected: [preSubmit.suggestions],
      },
    });
    if (data.ok) {
      wx.hideLoading();
      wx.showToast({
        title: "已提交",
        icon: "success",
        duration: 3000,
        mask: true,
        success: () => {
          setTimeout(() => {
            wx.navigateTo({ url: "/pages/index/index?page=0" });
          }, 200);
        },
      });
    } else {
      wx.hideLoading();
      wx.showToast({
        title: "提交失败",
        icon: "error",
      });
    }
    // } else {
    //   wx.hideLoading();
    //   wx.showToast({
    //     title: "查看任务失败",
    //     icon: "success",
    //   });
    // }
  },
  onCancel() {
    const taskId = this.data.taskId;
    wx.showModal({
      title: "提示",
      content: "是否返回上一页？",
      showCancel: true,
      cancelText: "取消",
      confirmText: "确定",
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({
              title: "请稍后...",
            });
            const data = await request(`/task/cancel/${taskId}`, {
              method: "POST",
            });
            wx.hideLoading();

            if (data.ok) {
              // 请求成功后弹出提示信息
              wx.showToast({
                title: "取消成功",
                icon: "success",
                duration: 3000,
                mask: true,
                success: () => {
                  setTimeout(() => {
                    wx.navigateTo({ url: "/pages/index/index?page=0" });
                  }, 200);
                },
              });
            } else {
              wx.showToast({
                title: "取消失败",
                icon: "error",
                duration: 2000,
                mask: true,
              });
            }
          } catch (err) {
            console.error(err);
            wx.showToast({
              title: "取消失败",
              icon: "none",
              duration: 2000,
            });
          }
        } else if (res.cancel) {
          console.log("用户点击取消");
        }
      },
    });
  },
  onAddClick() {
    const { id, name } = wx.getStorageSync("userInfo");
    console.log("this.data.taskDetail:", this.data.taskDetail);
    const data = {
      data: this.data.taskDetail[0].data,
      source: id,
      source_name: name,
      // cantonesePronunciations: [],
      // phrases: [],
      // sentiments: [],
      new: true,
    };
    const newTaskDetail = this.data.taskDetail;
    newTaskDetail.push(data);
    console.log("new:", newTaskDetail);
    this.setData({
      taskDetail: newTaskDetail,
      hidden: true,
      cantonesePronunciations: [""],
      phrases: [""],
      sentiments: [{ sentiment: "", exampleSentences: "" }],
    });
  },
  onAddCellClick(e) {
    const { type } = e.target.dataset;
    const newData = this.data[type];
    let flag = false;
    if (
      type === "sentiments" &&
      (!newData[newData.length - 1].sentiment ||
        !newData[newData.length - 1].exampleSentences)
    ) {
      flag = true;
    }
    if (type !== "sentiments" && newData[newData.length - 1] === "") {
      flag = true;
    }

    if (flag) {
      wx.showToast({
        title: "请编辑完整再新增",
        icon: "error",
      });
    } else {
      if (type === "sentiments") {
        newData.push({
          sentiment: "",
          exampleSentences: "",
        });
      } else {
        newData.push("");
      }
      this.setData({
        [type]: newData,
      });
    }
  },
  onRemoveCellClick(e) {
    const { type } = e.target.dataset;
    const newData = this.data[type];
    newData.pop();
    this.setData({
      [type]: newData,
    });
  },
  onShareAppMessage() {
    return {
      title: '任务详情',
      path: `/pages/task/task?taskId=${this.data.taskId}&status=${this.data.status}`,
    }
  },
  onShareTimeline() {
    return {
      title: '任务详情',
      path: `/pages/task/task?taskId=${this.data.taskId}&status=${this.data.status}`,
    }
  }
});
