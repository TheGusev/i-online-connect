import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "site.yaonline.app",
  appName: "Я Онлайн",
  webDir: "android-web",
  backgroundColor: "#0B0F1A",
  server: {
    url: "https://xn--41a.site",
    androidScheme: "https",
    cleartext: false,
    errorPath: "offline.html",
    allowNavigation: [
      "xn--41a.site",
      "oauth.yandex.ru",
      "passport.yandex.ru",
      "*.yandex.ru",
      "oauth.telegram.org",
      "*.telegram.org",
    ],
  },
  android: {
    allowMixedContent: false,
    appendUserAgent: "YaOnlineApp/1.0",
    webContentsDebuggingEnabled: false,
  },
};

export default config;
