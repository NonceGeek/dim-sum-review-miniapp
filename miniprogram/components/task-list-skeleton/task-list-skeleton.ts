Component({
  properties: {
    variant: { type: String, value: "list" },
    showOverview: { type: Boolean, value: true },
  },
  data: {
    skeletonCards: [0, 1],
    overviewSkeleton: [
      { width: "35%", height: "36rpx" },
      [{ width: "26%", height: "80rpx" }, { width: "26%", height: "80rpx" }, { width: "26%", height: "80rpx" }],
      { width: "100%", height: "16rpx" },
    ],
    userSkeleton: [
      [{ type: "circle", width: "72rpx", height: "72rpx" }, { width: "65%", height: "32rpx" }],
      [{ width: "26%", height: "64rpx" }, { width: "26%", height: "64rpx" }, { width: "26%", height: "64rpx" }],
      { width: "100%", height: "16rpx" },
    ],
    cards: [0, 1, 2],
    rows: [
      { width: "24%", height: "36rpx" },
      { width: "55%", height: "28rpx" },
      { width: "85%", height: "40rpx" },
      { width: "65%", height: "28rpx" },
    ],
  },
});
