/** 保留原生弹框的确认/取消回调约定，统一使用 common-dialog 展示。 */
type PendingDialog = { host: any; options: WechatMiniprogram.ShowModalOption };
const queue: PendingDialog[] = [];
let active = false;

export function flushCommonDialogs() {
  if (active || !queue.length) return;
  const pending = queue[0];
  const pages = getCurrentPages();
  const host = pending.host || pages[pages.length - 1];
  const dialog = host?.selectComponent?.("#common-dialog");
  // 更新提示可能早于页面 ready 到达，组件挂载后再展示。
  if (!dialog) return;
  queue.shift();
  active = true;
  const options = pending.options;
  let result: WechatMiniprogram.ShowModalSuccessCallbackResult;
  dialog.open({
    title: options.title || "提示",
    content: options.content || "",
    showCancel: options.showCancel ?? true,
    confirmText: options.confirmText || "确定",
    cancelText: options.cancelText || "取消",
    onConfirm: () => {
      result = { confirm: true, cancel: false, content: "", errMsg: "showModal:ok" };
      options.success?.(result);
    },
    onCancel: () => {
      result = { confirm: false, cancel: true, content: "", errMsg: "showModal:ok" };
      options.success?.(result);
    },
    onComplete: () => {
      active = false;
      try { options.complete?.(result); }
      finally { flushCommonDialogs(); }
    },
  });
}

export function showCommonModal(host: any, options: WechatMiniprogram.ShowModalOption) {
  queue.push({ host, options });
  flushCommonDialogs();
}
