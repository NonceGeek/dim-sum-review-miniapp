import ENV from "../../config/setting";
import { ITaskDetail } from "../../types/task";
import { add8Hours } from "../../utils/date";
import request, { public_request } from "../../utils/http";
const systemInfo = wx.getSystemInfoSync();
const statusBarHeight = systemInfo.statusBarHeight;
const app = getApp<{
  globalData: {
    allowedCorpora?: { category_name: string; permission: string }[];
    categories: [];
  };
}>();

const SOURCE_NAME_DEFAULT = "llm";
// should test when use baseline: lexiconBaseCorpusName
function getSourceInfo(
  kind: string,
  lexiconBaseCorpusName: string,
  corpusName: string,
  categories: any[],
) {
  console.log("kind:", kind, lexiconBaseCorpusName, corpusName);
  console.log("category:", categories);
  const source =
    kind === "llm"
      ? SOURCE_NAME_DEFAULT
      : kind === "baseline"
        ? lexiconBaseCorpusName
        : corpusName;
  console.log("source:", source);
  const category = categories.find((cat) => cat.name === source);
  console.log("category:", category);
  return {
    source,
    source_name:
      source === "llm"
        ? SOURCE_NAME_DEFAULT
        : category
          ? (category.nickname || category.name)
          : source,
  };
}

function getAuthCorpus(data) {
  const corpusFromData = data.suggestions.map((s) => {
    if (s.kind === "original") {
      return data.context.corpusName;
    } else if (s.kind === "llm") {
      return SOURCE_NAME_DEFAULT;
    } else if (s.kind === "baseline") {
      return s.lexiconBaseCorpusName;
    }
  });
  const { role, isSystemAdmin } = wx.getStorageSync("userInfo");

  const allowedCorpora =
    wx.getStorageSync("allowedCorpora") || app.globalData.allowedCorpora || [];
  console.log("allowedCorpora:", allowedCorpora);
  const categoryWrite = allowedCorpora
    ?.map((corpus) => {
      if (corpus.permission === "WRITE") {
        return corpus.category_name;
      }
    })
    .filter(Boolean);
  if (isSystemAdmin) {
    return {
      canEdit: corpusFromData,
      canAdd: true,
      canDelete: true,
    };
  } else if (role.toUpperCase() === "RESEARCHER") {
    return {
      canEdit: corpusFromData,
      canAdd: true,
    };
  } else if (/^TAGGER_[A-Z]*$/.test(role.toUpperCase())) {
    return {
      canEdit: [
        ...categoryWrite.filter((x) => new Set(corpusFromData).has(x)),
        "llm",
      ],
    };
  } else {
    return { canEdit: ["llm"] };
  }
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
    headerHeight: 0,
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
      { label: "介绍", value: "introduction", placeholder: "请输入介绍" },
      { label: "音频", value: "audio", placeholder: "请输入音频" },
      { label: "情感", value: "emotion", placeholder: "请输入情感及情感强度" },
      { label: "其他", value: "other", placeholder: "请输入其他" },
    ],
    //长按添加内容选择index
    longPressIndex: -1,
    expandedValues: [] as string[],
    // 录音相关状态
    recording: false,
    recordTime: 0,
    recordTimer: null as number | null,
    currentAudioPath: "",
    touchStartTime: 0, // 记录 touchstart 时间戳
    touchStartTimer: null as number | null, // touchstart 延迟定时器
    touchStartX: 0, // 记录 touchstart 的 X 坐标
    touchStartY: 0, // 记录 touchstart 的 Y 坐标
    justFinishedRecording: false, // 刚完成录音标志
    // 提交按钮状态
    canSubmit: false,
    // 编辑权限
    corpus: {} as { canEdit?: string[]; canAdd?: boolean; canDelete?: boolean },
    // 情感选项
    emotions: [
      "愤怒（angry）",
      "恐惧（fear）",
      "高兴（happy）",
      "中性（neutral）",
      "悲伤（sad）",
      "惊讶（surprise）",
      "活泼（lively）",
      "困惑（confused）",
      "担心（worry）",
      "厌恶（disgust）",
      "焦虑（anxious）",
      "正直（upright）",
      "冷漠（clam）",
      "温柔（gentle）",
      "兴奋（excited）",
      "稳重（steady）",
    ],
    intensityLevels: ["弱", "较弱", "一般", "较强", "强"],
    // 情感选择器状态
    showEmotionPicker: false,
    pickerType: "", // "emotion" 或 "intensity"
    currentEmotionCardIndex: -1,
    currentEmotionBlockIndex: -1,
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
      introduction: () => ({
        new: true,
        type: "introduction",
        content: "",
      }),
      emotion: () => ({
        new: true,
        type: "emotion",
        category: "",
        intensity: "",
      }),
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

    // Calculate Navbar Height
    const rect = wx.getMenuButtonBoundingClientRect();
    const { statusBarHeight: sysStatusBarHeight } = wx.getSystemInfoSync();
    const navBarHeight =
      (rect.top - sysStatusBarHeight) * 2 + rect.height + sysStatusBarHeight;

    this.setData({
      taskId,
      status,
      headerHeight: navBarHeight,
    });
    console.log("[页面] onLoad options:", options);
    this.syncTheme();
    await this.getTask(taskId);
  },

  async onReady() {
    const app = getApp<any>();
    const { id } = wx.getStorageSync("userInfo");

    const [view, categories] = await Promise.all([
      request(`/task/${this.data.taskId}/view`, {
        method: "POST",
        data: { actorRef: id },
      }),
      public_request("/corpus_categories"), // 移除 await
    ]);

    console.log("view:", view);

    if (
      JSON.stringify(app.globalData.categories) !== JSON.stringify(categories)
    ) {
      app.globalData.categories = categories;
      wx.setStorage("categories", categories);
    }
  },

  onShow() {
    this.syncTheme();
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },

  async getTask(taskId: string) {
    wx.showLoading({
      title: "加载中...",
    });
    console.log("status:", this.data.status);
    try {
      const categories =
        wx.getStorageSync("categories") || app.globalData.categories || [];
      const data = await request(`/task/${taskId}`);

      console.log("task data:", data);
      console.log("categories:", categories);
      const suggestions =
        this.data.status === "completed"
          ? [data.selectedSuggestion]
          : data.suggestions;

      const corpusWrite = getAuthCorpus(data);
      console.log("corpus:", corpusWrite);
      const entity = suggestions.map((s: any) => {
        const { source, source_name } = getSourceInfo(
          s.kind,
          s.lexiconBaseCorpusName,
          data.context.corpusName,
          categories,
        );

        if (data.violationType === "phonetic_mismatch") {
          return {
            data: data.context.text,
            source,
            source_name,
            canEdit: (corpusWrite?.canEdit as string[]).includes(source),
            cantonesePronunciations: [s.value],
            suggestions: s,
            record: JSON.parse(JSON.stringify(s.record)),
          };
        } else {
          return {
            data: data.context.text,
            source,
            source_name,
            canEdit: (corpusWrite?.canEdit as string[]).includes(source),
            suggestions: s,
            record: JSON.parse(JSON.stringify(s.record)),
          };
        }
      }) as ITaskDetail[];

      wx.hideLoading();
      console.log("entity:", entity);
      console.log(
        "resolvedAt 原始值:",
        data.resolvedAt,
        "类型:",
        typeof data.resolvedAt,
      );

      this.setData(
        {
          taskDetail: entity,
          violationType: data.violationType,
          completedAt: add8Hours(data.resolvedAt),
          corpus: corpusWrite,
        },
        () => {
          this.checkCanSubmit();
        },
      );
    } catch (err) {
      console.error("[页面] 请求异常:", err);
      wx.hideLoading();
      wx.showToast({
        title: String(err) || "加载失败",
        icon: "none",
        duration: 2000,
      });
    }
  },
  onSwiperChange(e) {
    console.log("e:", e.detail.current);
    const { id } = wx.getStorageSync("userInfo");
    const { currentIndex, taskDetail } = this.data;
    const updatedTaskDetail = [...taskDetail];
    console.log("原始updatedTaskDetail:", updatedTaskDetail);
    const currentTask = JSON.parse(
      JSON.stringify(updatedTaskDetail[currentIndex]),
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
        JSON.stringify(currentTask) &&
      JSON.stringify(currentTask?.record) ===
        JSON.stringify(updatedTaskDetail[currentIndex].suggestions?.record) &&
      currentTask.source !== id
    ) {
      this.setData(
        {
          currentIndex: e.detail.current,
        },
        () => {
          this.checkCanSubmit();
        },
      );
    } else {
      wx.showModal({
        title: "提示",
        content: "是否保存并提交当前编辑内容？",
        showCancel: true,
        cancelText: "取消",
        confirmText: "确定",
        success: async (res) => {
          if (res.confirm) {
            await this.doSubmit();
          } else if (res.cancel) {
            console.log("用户点击取消");

            updatedTaskDetail[currentIndex] = currentTask;

            if (currentTask.source === id) {
              updatedTaskDetail.pop();
            } else {
              updatedTaskDetail[currentIndex].record =
                currentTask.suggestions.record;
            }

            this.setData(
              {
                currentIndex: e.detail.current,
                taskDetail: updatedTaskDetail,
                hidden: !currentTask.source === id,
              },
              () => {
                this.checkCanSubmit();
              },
            );
          }
        },
      });
    }
  },
  async onSubmit() {
    wx.showModal({
      title: "提示",
      content: "是否确认提交？",
      showCancel: true,
      cancelText: "取消",
      confirmText: "确定",
      success: async (res) => {
        if (res.confirm) {
          await this.doSubmit();
        } else {
          console.log("用户点击了取消");
        }
      },
    });
  },
  async doSubmit() {
    const { id } = wx.getStorageSync("userInfo");
    const currentIndex = this.data.currentIndex;
    const taskDetail = this.data.taskDetail;

    // 检查情感数据完整性
    const isEmotionValid = this.checkEmotion();
    if (!isEmotionValid) {
      return; // 验证失败，阻止提交
    }

    // 深拷贝，避免修改原数据
    const preSubmit = JSON.parse(JSON.stringify(taskDetail[currentIndex]));
    console.log("preSubmit.suggestions:", preSubmit.suggestions);

    // 过滤掉空的blocks（既没有content也没有url）
    if (preSubmit.record && preSubmit.record.data) {
      preSubmit.record.data = preSubmit.record.data
        .map((c) => ({
          ...c,
          blocks: c.blocks.filter(
            (b) =>
              (b.content && b.content.trim()) ||
              (b.url && b.url.trim()) ||
              b.category ||
              b.intensity,
          ),
        }))
        .filter((c) => c.jyutping);
    }

    const submitData = { ...preSubmit.suggestions, record: preSubmit.record };
    console.log("submitData:", submitData);
    wx.showLoading({ title: "请稍后..." });

    const data = await request(`/task/submit/${this.data.taskId}`, {
      method: "POST",
      data: {
        actorRef: id,
        selected: [submitData],
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

  // 返回上一页
  onBack() {
    wx.navigateBack();
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
      canEdit: true,
      record: {
        data: [
          {
            new: true,
            jyutping: "",
            blocks: [this.addBlock("phrase"), this.addBlock("sentence")],
          },
        ],
      },
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
      },
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
      JSON.stringify(updatedTaskDetail[currentIndex]),
    );

    const verifyJyutping = currentTask.record.data.every((b) => b.jyutping);
    if (!verifyJyutping) {
      wx.showToast({
        title: "请输入粤拼",
        icon: "none",
        duration: 2000,
      });
      return;
    }

    if (!currentTask.record) {
      currentTask.record = { data: [] };
    } else if (!currentTask.record.data) {
      currentTask.record.data = [];
    }
    currentTask.record.data.push({
      new: true,
      jyutping: "",
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
      },
    );
  },

  onLongPressOriginal(e: any) {
    this.setData({
      showPopup: true,
      currentCustomId: "original",
      longPressIndex: e.currentTarget.dataset.index,
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
      // 检查是否只包含英文字母和数字，逗号，英文句号，空格
      const alphanumericRegex = /^[a-zA-Z0-9 ,.]+$/;
      if (!alphanumericRegex.test(value)) {
        wx.showToast({
          title: "粤音只能输入英文和数字，英文逗号句号和空格",
          icon: "none",
          duration: 2000,
        });
        return; // 阻止更新
      }
    }

    const updatedTaskDetail = [...taskDetail];
    const currentTask = JSON.parse(
      JSON.stringify(updatedTaskDetail[currentIndex]),
    );

    if (!currentTask.record || !currentTask.record.data) {
      return;
    }

    if (field === "cantonesePronunciations") {
      // 处理粤音
      currentTask.record.data[index].jyutping = value;
    } else if (field === "emotionContent") {
      // 处理情感描述
      currentTask.record.data[parentindex].blocks[index]["content"] = value;
    } else if (field === "emotionIntensity") {
      // 处理情感强度
      currentTask.record.data[parentindex].blocks[index]["intensity"] = value;
    } else if (index !== undefined && parentindex !== undefined) {
      // 处理数组字段
      currentTask.record.data[parentindex].blocks[index]["content"] = value;
    }

    updatedTaskDetail[currentIndex] = currentTask;

    this.setData(
      {
        taskDetail: updatedTaskDetail,
      },
      () => {
        this.checkCanSubmit();
      },
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
    const { currentIndex, taskDetail, longPressIndex } = this.data;
    const updatedTaskDetail = [...taskDetail];
    const currentTask = JSON.parse(
      JSON.stringify(updatedTaskDetail[currentIndex]),
    );

    if (
      !currentTask.record ||
      !currentTask.record.data ||
      !currentTask.record.data.length
    ) {
      return;
    }

    currentTask.record.data[longPressIndex].blocks.push(this.addBlock(value));
    console.log("currentTask:", currentTask);
    updatedTaskDetail[currentIndex] = currentTask;

    this.setData(
      {
        taskDetail: updatedTaskDetail,
      },
      () => {
        this.checkCanSubmit();
      },
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
      JSON.stringify(updatedTaskDetail[currentIndex]),
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
      },
    );
  },

  // 开始录音
  onStartRecord(e: any) {
    const { cardIndex, blockIndex } = e.currentTarget.dataset;
    const touch = e.touches[0];

    console.log("开始录音", cardIndex, blockIndex);

    // 记录 touchstart 时间戳和位置
    this.setData({
      touchStartTime: Date.now(),
      touchStartX: touch.clientX,
      touchStartY: touch.clientY,
    });

    // 清除之前的定时器
    if (this.data.touchStartTimer) {
      clearTimeout(this.data.touchStartTimer);
    }

    // 延迟 200ms 后才开始录音，避免和点击冲突
    const timer = setTimeout(() => {
      this.checkAndStartRecord(cardIndex, blockIndex);
    }, 200) as unknown as number;

    this.setData({ touchStartTimer: timer });
  },

  // 录音按钮触摸移动，取消录音
  onRecordTouchMove(e: any) {
    const touch = e.touches[0];

    // 计算移动距离
    const deltaX = Math.abs(touch.clientX - this.data.touchStartX);
    const deltaY = Math.abs(touch.clientY - this.data.touchStartY);

    // 只有移动超过 15px 才认为是滑动，取消录音
    if (deltaX > 15 || deltaY > 15) {
      console.log("检测到滑动，取消录音", deltaX, deltaY);

      // 清除延迟定时器，取消即将开始的录音
      if (this.data.touchStartTimer) {
        clearTimeout(this.data.touchStartTimer);
        this.setData({ touchStartTimer: null });
      }

      // 如果正在录音，停止录音
      if (this.data.recording) {
        const recorderManager = (this as any).recorderManager;
        if (recorderManager) {
          recorderManager.stop();
        }
        this.setData({
          recording: false,
          recordTime: 0,
        });
        // 清除录音计时器
        if (this.data.recordTimer) {
          clearInterval(this.data.recordTimer);
          this.setData({ recordTimer: null });
        }
        // 隐藏 toast
        wx.hideToast();
      }
    }
  },

  checkAndStartRecord(cardIndex: number, blockIndex: number) {
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
    console.log("真正开始录音", cardIndex, blockIndex);

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
    const { cardIndex, blockIndex } = e.currentTarget.dataset;
    console.log(
      "停止录音被调用",
      cardIndex,
      blockIndex,
      "当前录音状态:",
      this.data.recording,
    );

    // 清除 touchstart 延迟定时器
    if (this.data.touchStartTimer) {
      console.log("清除延迟定时器");
      clearTimeout(this.data.touchStartTimer);
      this.setData({ touchStartTimer: null });
    }

    // 如果没有真正开始录音，直接返回
    if (!this.data.recording) return;

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

    // 设置标志，表示刚完成录音，阻止播放
    this.setData({ justFinishedRecording: true });
    setTimeout(() => {
      this.setData({ justFinishedRecording: false });
    }, 300);
  },

  // 保存音频到block
  saveAudioToBlock(
    cardIndex: number,
    blockIndex: number,
    filePath: string,
    duration: number,
  ) {
    console.log("开始上传音频到OSS:", filePath);

    wx.showLoading({
      title: "上传中...",
      mask: true,
    });

    const token = wx.getStorageSync("accessToken") || "";
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dateStr = `${year}${month}${day}`;
    const timestamp = Date.now();
    const taskId = this.data.taskId || "unknown";
    wx.uploadFile({
      url: `${ENV.API_BASE_URL}/upload`,
      filePath: filePath,
      name: "file",
      formData: {
        taskId: taskId,
        fileName: `${dateStr}_${taskId}_${timestamp}.mp3`,
      },
      header: {
        Authorization: `Bearer ${token}`,
      },
      success: (uploadRes) => {
        wx.hideLoading();

        const statusCode = uploadRes.statusCode;
        console.log("上传响应:", uploadRes);

        if (statusCode === 200) {
          let data;
          try {
            data = JSON.parse(uploadRes.data);
          } catch (e) {
            console.error("解析响应失败:", uploadRes.data);
            wx.showToast({
              title: "上传失败",
              icon: "error",
              duration: 2000,
            });
            return;
          }

          // 获取服务器返回的音频URL
          const serverUrl = data.url || data.data?.url;

          if (!serverUrl) {
            console.error("服务器未返回URL:", data);
            wx.showToast({
              title: "上传失败",
              icon: "error",
              duration: 2000,
            });
            return;
          }

          console.log("服务器返回的音频URL:", serverUrl);

          const { currentIndex, taskDetail } = this.data;
          const updatedTaskDetail = [...taskDetail];
          const currentTask = JSON.parse(
            JSON.stringify(updatedTaskDetail[currentIndex]),
          );

          if (!currentTask.record || !currentTask.record.data) {
            console.error("record或record.data不存在");
            return;
          }

          // 使用服务器返回的真实URL
          currentTask.record.data[cardIndex].blocks[blockIndex].url = serverUrl;
          currentTask.record.data[cardIndex].blocks[blockIndex].duration =
            Math.floor(duration / 1000);

          updatedTaskDetail[currentIndex] = currentTask;

          this.setData({
            taskDetail: updatedTaskDetail,
          });

          wx.showToast({
            title: "录音完成",
            icon: "success",
            duration: 1500,
          });
        } else {
          console.error("上传失败，状态码:", statusCode);
          wx.showToast({
            title: String(uploadRes.data.error) || "上传失败",
            icon: "error",
            duration: 2000,
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("上传失败:", err);
        wx.showToast({
          title: "上传失败",
          icon: "error",
          duration: 2000,
        });
      },
    });
  },

  // 播放音频
  onPlayAudio(e: any) {
    const { url } = e.currentTarget.dataset;

    // 如果正在录音或刚完成录音，不播放
    if (this.data.recording || this.data.justFinishedRecording) {
      return;
    }

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
    if (
      !currentTask ||
      !currentTask.record ||
      !currentTask.record.data ||
      currentTask.record.data.length === 0
    ) {
      this.setData({ canSubmit: false });
      return;
    }

    // 检查是否至少有一个 card 的 jyutping 完整（非空）
    const hasValidJyutping = currentTask.record.data.some(
      (card: any) => card.jyutping && card.jyutping.trim() !== "",
    );

    this.setData({ canSubmit: hasValidJyutping });
  },

  // 显示选择器
  onShowPicker(e: any) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }

    const { pickerType, cardIndex, blockIndex } = e.currentTarget.dataset;
    console.log(
      "显示选择器 - 类型:",
      pickerType,
      "cardIndex:",
      cardIndex,
      "blockIndex:",
      blockIndex,
    );

    this.setData({
      showEmotionPicker: true,
      pickerType: pickerType,
      currentEmotionCardIndex: cardIndex,
      currentEmotionBlockIndex: blockIndex,
    });
  },

  // 关闭选择器
  onEmotionPickerClose() {
    this.setData({
      showEmotionPicker: false,
      pickerType: "",
      currentEmotionCardIndex: -1,
      currentEmotionBlockIndex: -1,
    });
  },

  // 确认选择
  onEmotionConfirm(e: any) {
    const { value } = e.detail;
    const {
      currentIndex,
      taskDetail,
      currentEmotionCardIndex,
      currentEmotionBlockIndex,
      pickerType,
    } = this.data;

    if (currentEmotionCardIndex === -1 || currentEmotionBlockIndex === -1) {
      return;
    }

    const updatedTaskDetail = [...taskDetail];
    const currentTask = JSON.parse(
      JSON.stringify(updatedTaskDetail[currentIndex]),
    );

    if (!currentTask.record || !currentTask.record.data) {
      return;
    }
    console.log(
      "currentTask.record.data[currentEmotionCardIndex].blocks[currentEmotionBlockIndex]:",
      currentTask.record.data[currentEmotionCardIndex].blocks[
        currentEmotionBlockIndex
      ],
    );
    // 根据类型更新对应字段
    if (pickerType === "emotion") {
      currentTask.record.data[currentEmotionCardIndex].blocks[
        currentEmotionBlockIndex
      ].category = value;
    } else if (pickerType === "intensity") {
      currentTask.record.data[currentEmotionCardIndex].blocks[
        currentEmotionBlockIndex
      ].intensity = value;
    }

    updatedTaskDetail[currentIndex] = currentTask;
    console.log("updatedTaskDetail[currentIndex]:", updatedTaskDetail);
    this.setData(
      {
        taskDetail: updatedTaskDetail,
        showEmotionPicker: false,
        pickerType: "",
        currentEmotionCardIndex: -1,
        currentEmotionBlockIndex: -1,
      },
      () => {
        this.checkCanSubmit();
      },
    );
  },
  checkEmotion() {
    const { currentIndex, taskDetail } = this.data;
    const currentTask = taskDetail[currentIndex];

    if (!currentTask || !currentTask.record || !currentTask.record.data) {
      return;
    }

    // 检查是否所有 block 都有完整的情感数据（要么都填，要么都不填）
    const allBlocksValid = currentTask.record.data
      .map((c: any) => ({
        ...c,
        blocks: c.blocks.filter(
          (b: any) =>
            (b.content && b.content.trim()) || (b.url && b.url.trim()),
        ),
      }))
      .filter((c: any) => c.jyutping)
      .every((card: any) =>
        card.blocks.every((block: any) => {
          if (block.category) {
            return block.intensity !== undefined && block.intensity !== "";
          }
          if (block.intensity) {
            return block.category !== undefined && block.category !== "";
          }
          return true;
        }),
      );

    console.log("所有 block 验证结果:", allBlocksValid);

    if (!allBlocksValid) {
      wx.showToast({
        title: "请完整填写情感和情感强度",
        icon: "none",
        duration: 2000,
      });
      return false;
    }

    return true;
  },
});
