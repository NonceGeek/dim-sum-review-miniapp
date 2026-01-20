// types/index.d.ts - 全局类型定义

// 主题类型
type ThemeMode = 'auto' | 'light' | 'dark';
type ThemeValue = 'light' | 'dark';

// 用户信息类型
interface UserInfo {
  nickname: string;
  avatar?: string;
  openid?: string;
}

// App 全局数据类型
interface GlobalData {
  userInfo: UserInfo | null;
  accessToken: string;
  refreshToken: string;
  allowedCorpora: string[];
  themeMode: ThemeMode;
  theme: ThemeValue;
}

// App 实例选项类型
interface IAppOption {
  globalData: GlobalData;
  
  // Storage 方法
  getStorage(key: string): Promise<any>;
  setStorage(key: string, data: any): Promise<void>;
  
  // 登录相关
  ensureLogin(retries?: number): Promise<string>;
  tryLogin(retries: number): Promise<string>;
  doLogin(): Promise<string>;
  logout(): void;
  
  // 主题相关
  initTheme(): Promise<void>;
  applyTheme(theme: ThemeValue): void;
  getThemeMode(): ThemeMode;
  getTheme(): ThemeValue;
  setThemeMode(mode: ThemeMode): Promise<void>;
}
