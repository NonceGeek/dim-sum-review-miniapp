import ENV from "../config/setting";

/**
 * 小程序 request 封装
 * - 自动带 token
 * - token 过期自动刷新并重试
 * - 打印使用 JSON.stringify 避免 Worker 克隆错误
 */

let isRefreshing = false;
let refreshQueue: Function[] = [];
const app = getApp<{ globalData: { accessToken?: string } }>();

function request(url: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const token =
      wx.getStorageSync("accessToken") || app.globalData.accessToken || "";

    wx.request({
      url: `${ENV.API_BASE_URL}${url}`,
      method: options.method || "GET",
      data: options.data || {},
      timeout: 10000,
      header: {
        ...(options.header || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },

      success: async (res) => {
        try {
          // 只打印序列化后的对象，避免 Worker postMessage 报错
          // console.log(`[request] URL: ${url}`, JSON.stringify(res));

          // 只有 401 才视为 token 过期，403 是权限不足
          const isTokenExpired = res.statusCode === 401;

          if (!isTokenExpired) {
            return resolve(res.data);
          }

          // 重试次数限制（最多重试 3 次）
          const retryCount = options._retryCount || 0;
          if (retryCount >= 3) {
            console.error("[request] 重试 3 次仍失败");
            wx.showToast({
              title: "登录已过期，请重新进入小程序",
              icon: "none",
              duration: 3000,
            });
            return reject(new Error("登录过期，请重新进入小程序"));
          }

          handleTokenExpired(
            url,
            { ...options, _retryCount: retryCount + 1 },
            resolve,
            reject
          );
        } catch (err) {
          console.error("[request] success 回调异常:", err);
          reject(err);
        }
      },

      fail: (err) => {
        console.error("[request] wx.request fail:", JSON.stringify(err));
        reject(err);
      },
    });
  });
}

function handleTokenExpired(
  url: string,
  options: any = {},
  resolve: (value: any) => void,
  reject: (arg0: any) => void
) {
  if (isRefreshing) {
    // ✅ 已在刷新，排队等待
    return refreshQueue.push(() =>
      request(url, options).then(resolve).catch(reject)
    );
  }

  isRefreshing = true;

  refreshToken()
    .then((ok) => {
      isRefreshing = false;

      if (!ok) {
        const queue = refreshQueue.slice();
        refreshQueue = [];
        queue.forEach((cb) => cb());
        wx.removeStorageSync("accessToken");
        wx.removeStorageSync("refreshToken");

        return reject(new Error("登录过期"));
      }

      // ✅ 刷新成功，执行队列
      refreshQueue.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.error(e);
        }
      });
      refreshQueue = [];

      // ✅ 当前请求重试
      request(url, options).then(resolve).catch(reject);
    })
    .catch(() => {
      isRefreshing = false;
      refreshQueue = [];
      reject(new Error("refresh error"));
    });
}

/**
 * 刷新 token
 */
function refreshToken(): Promise<boolean> {
  return new Promise((resolve) => {
    const refreshToken = wx.getStorageSync("refreshToken");
    if (!refreshToken) {
      console.warn("[refreshToken] 没有 refreshToken");
      return resolve(false);
    }

    wx.request({
      url: `${ENV.API_BASE_URL}/auth/refresh`,
      method: "POST",
      data: { refreshToken },

      success(res) {
        console.log("[refreshToken] 返回:", JSON.stringify(res));

        if (res.statusCode !== 200 || !(res.data as any)?.accessToken) {
          console.warn("[refreshToken] 刷新失败");
          return resolve(false);
        }

        const { accessToken, refreshToken: newRefreshToken } = res.data as {
          accessToken: string;
          refreshToken: string;
        };
        wx.setStorageSync("accessToken", accessToken);
        wx.setStorageSync("refreshToken", newRefreshToken);
        console.log("[refreshToken] 刷新成功");
        resolve(true);
      },

      fail(err) {
        console.error("[refreshToken] 请求失败:", JSON.stringify(err));
        resolve(false);
      },
    });
  });
}

function public_request(url: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${ENV.API_PUBLIC_URL}${url}`,
      method: options.method || "GET",
      data: options.data || {},
      timeout: 10000,
      header: {
        ...(options.header || {}),
      },

      success: async (res) => {
        // console.lo g("public res:", res);
        resolve(res.data); // 正常返回
      },

      fail: (err) => {
        console.error("[request] wx.request fail:", JSON.stringify(err));
        reject(err);
      },
    });
  });
}

function agent_request(url: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${ENV.API_AGENT_URL}${url}`,
      method: options.method || "GET",
      data: options.data || {},
      timeout: 10000,
      header: {
        ...(options.header || {}),
      },

      success: async (res) => {
        // console.log("agent res:", res);
        resolve(res.data); // 正常返回
      },

      fail: (err) => {
        console.error("[request] wx.request fail:", JSON.stringify(err));
        reject(err);
      },
    });
  });
}
export { public_request, agent_request };
export default request;
