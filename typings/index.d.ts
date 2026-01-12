/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo | null;
    accessToken: string;
    refreshToken: string;
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback;
  ensureLogin(retries?: number): Promise<string>;
  tryLogin(retries: number): Promise<string>;
  doLogin(): Promise<string>;
  logout(): void;
  getStorage(key: string): Promise<any>;
  setStorage(key: string, data: any): Promise<void>;
}