import { flushCommonDialogs } from "../../utils/common-dialog";

interface CommonDialogOptions {
  title: string;
  content: string;
  showCancel?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  onComplete?: () => void;
}

Component({
  lifetimes: { ready() { flushCommonDialogs(); } },
  data: {
    visible: false,
    currentTheme: "light",
    title: "",
    content: "",
    showCancel: false,
    confirmText: "确定",
    cancelText: "取消",
    confirmBtn: {
      content: "确定",
      variant: "base",
      theme: "primary",
      shape: "round",
      size: "medium",
      hoverClass: "none",
    },
    cancelBtn: false as false | Record<string, unknown>,
    overlayProps: {
      zIndex: 13999,
      style: "--td-overlay-bg-color: rgba(0, 0, 0, 0.52);",
    },
  },

  methods: {
    open(options: CommonDialogOptions) {
      const app = getApp<any>();
      const currentTheme = app.getTheme?.() || "light";
      const showCancel = options.showCancel ?? Boolean(options.cancelText);
      (this as any)._dialogOptions = options;
      (this as any)._dialogSettled = false;
      this.setData({
        visible: true,
        currentTheme,
        title: options.title,
        content: options.content,
        showCancel,
        confirmText: options.confirmText || "确定",
        cancelText: options.cancelText || "取消",
        confirmBtn: {
          content: options.confirmText || "确定",
          variant: "base",
          theme: "primary",
          shape: "round",
          size: "medium",
          hoverClass: "none",
        },
        cancelBtn: showCancel
          ? {
              content: options.cancelText || "取消",
              variant: "outline",
              theme: "default",
              shape: "round",
              size: "medium",
              hoverClass: "none",
            }
          : false,
        overlayProps: {
          zIndex: 13999,
          style: `--td-overlay-bg-color: ${
            currentTheme === "dark"
              ? "rgba(0, 0, 0, 0.68)"
              : "rgba(0, 0, 0, 0.52)"
          };`,
        },
      });
    },

    settle(confirmed: boolean) {
      if ((this as any)._dialogSettled) return;
      (this as any)._dialogSettled = true;
      const options = (this as any)._dialogOptions as
        | CommonDialogOptions
        | undefined;
      (this as any)._dialogOptions = undefined;
      this.setData({ visible: false });
      try {
        if (confirmed) options?.onConfirm?.();
        else options?.onCancel?.();
      } finally {
        options?.onComplete?.();
      }
    },

    onConfirm() {
      this.settle(true);
    },

    onCancel() {
      this.settle(false);
    },

    onClose() {
      this.settle(false);
    },
  },
});
