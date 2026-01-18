import { ITaskDetail } from "../../types/task";
import { formatTime } from "../../utils/date";
import request, { agent_request, public_request } from "../../utils/http";
const systemInfo = wx.getSystemInfoSync();
const statusBarHeight = systemInfo.statusBarHeight;

const SOURCE_NAME_DEFAULT = "llm";
function getSourceInfo(suggestion: any, categories: any[]) {
  const source =
    suggestion.source === "lexicon"
      ? suggestion.lexiconBaseCorpusName
      : suggestion.source;
  const category = categories.find((cat) => cat.name === source);
  return {
    source,
    source_name: category ? category.nickname : SOURCE_NAME_DEFAULT,
  };
}

function formatBlocks(suggestion: any) {
  return [
    {
      type: "definition",
      content: suggestion.explanation,
    },
    {
      type: "phrase",
      content: suggestion.value,
    },
  ];
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    taskId: "",
    status: "notified",
    taskDetail: [] as any[],
    currentIndex: 0,
    statusBarHeight,
    hidden: false,
    violationType: "", //检查类型
    completedAt: "",
    // 可添加的额外字段配置
    extraFields: [
      { label: "词组", value: "phrase", placeholder: "请输入词组" },
      {
        label: "例句",
        value: "sentence",
        placeholder: "请输入例句",
      },
      { label: "解释", value: "definition", placeholder: "请输入解释" },
      // { label: "介绍", value: "introduction", placeholder: "请输入介绍" },
      { label: "音频", value: "audio", placeholder: "请输入音频" },
      { label: "其他", value: "other", placeholder: "请输入其他" },
    ],
    expandedValues: [] as string[],
    // 录音相关状态
    recording: false,
    recordTime: 0,
    recordTimer: null as number | null,
    currentAudioPath: "",
    // 提交按钮状态
    canSubmit: false,
  },

  addBlock(type: string) {
    const blockMap: Record<
      string,
      () => { type: string; content?: string; url?: string }
    > = {
      phrase: () => ({
        new: true,
        type: "phrase",
        content: "",
      }),
      sentence: () => ({
        new: true,
        type: "sentence",
        content: "",
      }),
      audio: () => ({
        new: true,
        type: "audio",
        url: "",
      }),
      definition: () => ({
        new: true,
        type: "definition",
        content: "",
      }),
      // introduction: () => ({
      //   new: true,
      //   type: "introduction",
      //   content: "",
      // }),
      other: () => ({
        new: true,
        type: "other",
        content: "",
      }),
    };
    return blockMap[type]();
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

  //////
  async getTask(taskId: string) {
    wx.showLoading({
      title: "加载中...",
    });
    console.log("status:", this.data.status);
    try {
      const { id } = wx.getStorageSync("userInfo");
      const [data, categories] = await Promise.all([
        request(`/task/${taskId}`),
        public_request("/corpus_categories"),
        this.data.status === "completed"
          ? null
          : agent_request(`/tasks/${this.data.taskId}/view`, {
              method: "POST",
              data: {
                actorRef: id,
              },
            }),
      ]);
      console.log("task data:", data);
      console.log("categories:", categories);
      const suggestions =
        this.data.status === "completed"
          ? [data.selectedSuggestion]
          : data.suggestions;
      const entity = suggestions.map((s: any) => {
        const { source, source_name } = getSourceInfo(s, categories);

        if (data.violationType === "phonetic_mismatch") {
          return {
            data: data.context.problemChar,
            sentenseText: data.context.sentenceText,
            source,
            source_name,
            cantonesePronunciations: [s.value],
            suggestions: s,
            // test
            record: {
              data: [
                {
                  jyutping: "wai4",
                  type: "character", // 或 "word", "idiom", 'sentence'
                  text: "為",
                  blocks: formatBlocks(s),
                },
              ],
            },
          };
        } else {
          return {
            data: data.context.sentenceText,
            phrases_join: s.value,
            source,
            source_name,
            suggestions: s,
            // test
            record: {
              data: [
                {
                  jyutping: "wai4",
                  type: "character", // 或 "word", "idiom", 'sentence'
                  text: "為",
                  blocks: formatBlocks(s),
                },
              ],
            },
          };
        }
      }) as ITaskDetail[];

      wx.hideLoading();
      console.log("entity:", entity);
      this.setData(
        {
          taskDetail: entity,
          violationType: data.violationType,
          completedAt: formatTime(data.resolvedAt),
        },
        () => {
          this.checkCanSubmit();
        }
      );
    } catch (err) {
      console.error("[页面] 请求异常:", err);
    }
  },
  onSwiperChange(e) {
    const { currentIndex, taskDetail } = this.data;
    const updatedTaskDetail = [...taskDetail];
    console.log("原始updatedTaskDetail:", updatedTaskDetail);
    const currentTask = JSON.parse(
      JSON.stringify(updatedTaskDetail[currentIndex])
    );
    if (currentTask.record && currentTask.record.data) {
      currentTask.record.data = currentTask.record.data
        .filter((c) => !c.new)
        .map((c) => ({
          ...c,
          blocks: c.blocks.filter((b) => !b.new),
        }));
    }
    if (
      JSON.stringify(updatedTaskDetail[currentIndex]) ===
      JSON.stringify(currentTask)
    ) {
      this.setData(
        {
          currentIndex: e.detail.current,
        },
        () => {
          this.checkCanSubmit();
        }
      );
    } else {
      wx.showModal({
        title: "提示",
        content: "是否保存提交？",
        showCancel: true,
        cancelText: "取消",
        confirmText: "确定",
        success: async (res) => {
          if (res.confirm) {
            this.onSubmit();
          } else if (res.cancel) {
            console.log("用户点击取消");

            updatedTaskDetail[currentIndex] = currentTask;

            this.setData(
              {
                currentIndex: e.detail.current,
                taskDetail: updatedTaskDetail,
              },
              () => {
                this.checkCanSubmit();
              }
            );
          }
        },
      });
    }
  },
  //////
  async onSubmit() {
    const { id } = wx.getStorageSync("userInfo");
    const currentIndex = this.data.currentIndex;
    const taskDetail = this.data.taskDetail;

    // 深拷贝，避免修改原数据
    const preSubmit = JSON.parse(JSON.stringify(taskDetail[currentIndex]));

    // 过滤掉空的blocks（既没有content也没有url）
    if (preSubmit.record && preSubmit.record.data) {
      preSubmit.record.data = preSubmit.record.data.map((c) => ({
        ...c,
        blocks: c.blocks.filter(
          (b) => (b.content && b.content.trim()) || (b.url && b.url.trim())
        ),
      }));
    }

    wx.showLoading({ title: "请稍后..." });

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
      new: true,
    };
    const newTaskDetail = this.data.taskDetail;
    newTaskDetail.push(data);
    console.log("new:", newTaskDetail);
    this.setData(
      {
        taskDetail: newTaskDetail,
        hidden: true,
      },
      () => {
        this.checkCanSubmit();
      }
    );
  },
  onShareAppMessage() {
    return {
      title: "任务详情",
      path: `/pages/task/task?taskId=${this.data.taskId}&status=${this.data.status}`,
    };
  },
  onShareTimeline() {
    return {
      title: "任务详情",
      path: `/pages/task/task?taskId=${this.data.taskId}&status=${this.data.status}`,
    };
  },
  onCollapseChange(e: any) {
    console.log("e.detail.value:", e.detail.value);
    this.setData({
      expandedValues: e.detail.value,
    });
  },

  onAddNewCantonese() {
    const newId = `custom_${Date.now()}`;
    const { taskDetail, currentIndex } = this.data;
    const updatedTaskDetail = [...taskDetail];
    const currentTask = JSON.parse(
      JSON.stringify(updatedTaskDetail[currentIndex])
    );
    if (!currentTask.record) {
      currentTask.record = { data: [] };
    } else if (!currentTask.record.data) {
      currentTask.record.data = [];
    }
    currentTask.record.data.push({
      new: true,
      jyutping: "",
      type: "character", // 或 "word", "idiom", 'sentence'
      text: "",
      blocks: [this.addBlock("phrase"), this.addBlock("sentence")],
    });

    updatedTaskDetail[currentIndex] = currentTask;

    this.setData(
      {
        taskDetail: updatedTaskDetail,
        expandedValues: [...this.data.expandedValues, newId],
      },
      () => {
        this.checkCanSubmit();
      }
    );
  },

  onLongPressOriginal(e: any) {
    this.setData({
      showPopup: true,
      currentCustomId: "original",
    });
  },
  onOriginalBaseFieldChange(e: any) {
    console.log("e:", e.currentTarget.dataset);
    const { field, index, parentindex } = e.currentTarget.dataset;
    const value = e.detail;
    const { taskDetail, currentIndex } = this.data;

    // 词组字段验证：只允许输入汉字
    if (field === "phrase" && value) {
      // 检查是否只包含汉字
      const chineseRegex = /^[\u4e00-\u9fa5]+$/;
      if (!chineseRegex.test(value)) {
        wx.showToast({
          title: "词组只能输入汉字",
          icon: "none",
          duration: 2000,
        });
        return; // 阻止更新
      }
    }

    // 粤拼字段验证：只允许输入英文和数字
    if (field === "cantonesePronunciations" && value) {
      // 检查是否只包含英文字母和数字
      const alphanumericRegex = /^[a-zA-Z0-9]+$/;
      if (!alphanumericRegex.test(value)) {
        wx.showToast({
          title: "粤拼只能输入英文和数字",
          icon: "none",
          duration: 2000,
        });
        return; // 阻止更新
      }
    }

    const updatedTaskDetail = [...taskDetail];
    const currentTask = JSON.parse(
      JSON.stringify(updatedTaskDetail[currentIndex])
    );

    if (!currentTask.record || !currentTask.record.data) {
      return;
    }

    if (field === "cantonesePronunciations") {
      // 处理粤音
      currentTask.record.data[index].jyutping = value;
    } else if (index !== undefined && parentindex !== undefined) {
      // 处理数组字段（如 cantonesePronunciations）
      currentTask.record.data[parentindex].blocks[index]["content"] = value;
    }

    updatedTaskDetail[currentIndex] = currentTask;

    this.setData(
      {
        taskDetail: updatedTaskDetail,
      },
      () => {
        this.checkCanSubmit();
      }
    );
  },
  onPopupClose() {
    this.setData({
      showPopup: false,
      currentCustomId: "",
    });
  },
  onPopupSelect(e: any) {
    const { value } = e.currentTarget.dataset;
    console.log("value:", value);
    const { currentIndex, taskDetail } = this.data;
    const updatedTaskDetail = [...taskDetail];
    const currentTask = JSON.parse(
      JSON.stringify(updatedTaskDetail[currentIndex])
    );

    if (!currentTask.record || !currentTask.record.data || !currentTask.record.data.length) {
      return;
    }

    currentTask.record.data.at(-1).blocks.push(this.addBlock(value));
    console.log("currentTask:", currentTask);
    updatedTaskDetail[currentIndex] = currentTask;

    this.setData(
      {
        taskDetail: updatedTaskDetail,
      },
      () => {
        this.checkCanSubmit();
      }
    );
    this.onPopupClose();
  },

  onDeleteBlock(e: any) {
    wx.showModal({
      title: "确认删除",
      content: "确定要删除吗？",
      success: (res) => {
        if (res.confirm) {
          this.doDeleteBlock(e);
        }
      },
    });
  },

  doDeleteBlock(e: any) {
    const { cardIndex, blockIndex } = e.currentTarget.dataset;
    console.log("delete e:", e.currentTarget.dataset);
    const { currentIndex, taskDetail } = this.data;
    const updatedTaskDetail = [...taskDetail];
    const currentTask = JSON.parse(
      JSON.stringify(updatedTaskDetail[currentIndex])
    );

    if (!currentTask.record || !currentTask.record.data) {
      return;
    }

    if (cardIndex !== undefined && blockIndex !== undefined) {
      currentTask.record.data[cardIndex].blocks.splice(blockIndex, 1);
    }
    if (cardIndex !== undefined && blockIndex === undefined) {
      currentTask.record.data.splice(cardIndex, 1);
    }

    updatedTaskDetail[currentIndex] = currentTask;

    this.setData(
      {
        taskDetail: updatedTaskDetail,
      },
      () => {
        this.checkCanSubmit();
      }
    );
  },

  // 开始录音
  onStartRecord(e: any) {
    const { cardIndex, blockIndex } = e.currentTarget.dataset;
    console.log("开始录音", cardIndex, blockIndex);

    // 检查录音权限
    wx.getSetting({
      success: (res) => {
        if (!res.authSetting["scope.record"]) {
          wx.authorize({
            scope: "scope.record",
            success: () => {
              this.doStartRecord(cardIndex, blockIndex);
            },
            fail: () => {
              wx.showModal({
                title: "提示",
                content: "需要录音权限才能使用此功能",
                showCancel: false,
              });
            },
          });
        } else {
          this.doStartRecord(cardIndex, blockIndex);
        }
      },
    });
  },

  doStartRecord(cardIndex: number, blockIndex: number) {
    this.setData({
      recording: true,
      recordTime: 0,
    });

    // 开始录音计时
    const timer = setInterval(() => {
      this.setData({
        recordTime: this.data.recordTime + 1,
      });
    }, 1000);
    this.setData({ recordTimer: timer });

    // 调用微信录音API
    const recorderManager = wx.getRecorderManager();
    recorderManager.start({
      format: "mp3",
      sampleRate: 44100, // 标准采样率
      numberOfChannels: 1, // 单声道
      encodeBitRate: 128000, // 比特率
    });

    recorderManager.onStop((res) => {
      console.log("录音完成", res);
      const { tempFilePath, duration } = res;
      this.saveAudioToBlock(cardIndex, blockIndex, tempFilePath, duration);
    });

    // 保存 recorderManager 实例以便后续停止
    (this as any).recorderManager = recorderManager;

    wx.showToast({
      title: "正在录音...",
      icon: "loading",
      duration: 1000,
    });
  },

  // 停止录音
  onStopRecord(e: any) {
    if (!this.data.recording) return;

    const { cardIndex, blockIndex } = e.currentTarget.dataset;
    console.log("停止录音", cardIndex, blockIndex);

    // 清除计时器
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
    }

    this.setData({
      recording: false,
      recordTime: 0,
      recordTimer: null,
    });

    // 停止录音
    const recorderManager = (this as any).recorderManager;
    if (recorderManager) {
      recorderManager.stop();
    }

    wx.hideToast();
  },

  // 保存音频到block
  saveAudioToBlock(
    cardIndex: number,
    blockIndex: number,
    filePath: string,
    duration: number
  ) {
    console.log("临时录音路径:", filePath);

    const { currentIndex, taskDetail } = this.data;
    const updatedTaskDetail = [...taskDetail];
    const currentTask = JSON.parse(
      JSON.stringify(updatedTaskDetail[currentIndex])
    );

    if (!currentTask.record || !currentTask.record.data) {
      return;
    }

    // iOS 临时文件可以直接播放，不需要保存
    currentTask.record.data[cardIndex].blocks[blockIndex].url = filePath;
    currentTask.record.data[cardIndex].blocks[blockIndex].duration = Math.floor(
      duration / 1000
    );

    updatedTaskDetail[currentIndex] = currentTask;

    this.setData({
      taskDetail: updatedTaskDetail,
    });

    wx.showToast({
      title: "录音完成",
      icon: "success",
      duration: 1500,
    });
  },

  // 播放音频
  onPlayAudio(e: any) {
    const { url } = e.currentTarget.dataset;
    console.log("=== 播放音频 ===");
    console.log("URL:", url);

    if (!url) {
      wx.showToast({ title: "暂无录音", icon: "none" });
      return;
    }

    const backgroundAudioManager = wx.getBackgroundAudioManager();
    if (backgroundAudioManager.src) {
      backgroundAudioManager.stop();
    }

    backgroundAudioManager.title = "录音播放";
    backgroundAudioManager.epname = "录音";
    backgroundAudioManager.singer = "用户";
    backgroundAudioManager.coverImgUrl = "";

    backgroundAudioManager.onCanplay(() => {
      console.log("BackgroundAudio onCanplay");
    });

    backgroundAudioManager.onPlay(() => {
      console.log("BackgroundAudio onPlay");
      wx.showToast({ title: "正在播放...", icon: "loading", duration: 1000 });
    });

    backgroundAudioManager.onError((err) => {
      console.error("BackgroundAudio 错误:", err);
      wx.showToast({
        title: `播放错误:${err.errCode}`,
        icon: "none",
        duration: 3000,
      });
    });

    backgroundAudioManager.onEnded(() => {
      console.log("BackgroundAudio 播放结束");
    });

    // 设置音频源并播放
    backgroundAudioManager.src = url;

    console.log("使用 BackgroundAudioManager 播放");
  },

  checkCanSubmit() {
    const { currentIndex, taskDetail } = this.data;

    if (!taskDetail || taskDetail.length === 0) {
      this.setData({ canSubmit: false });
      return;
    }

    const currentTask = taskDetail[currentIndex];
    if (!currentTask || !currentTask.record || !currentTask.record.data || currentTask.record.data.length === 0) {
      this.setData({ canSubmit: false });
      return;
    }

    // 检查是否至少有一个 card 的 jyutping 完整（非空）
    const hasValidJyutping = currentTask.record.data.some(
      (card: any) => card.jyutping && card.jyutping.trim() !== ""
    );

    this.setData({ canSubmit: hasValidJyutping });
  },
});
