export interface AppConfig {
  API_URL?: string;
  API_MODE?: 'api' | 'mock' | 'hybrid';
  APP_VERSION?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppConfig;
  }
}
