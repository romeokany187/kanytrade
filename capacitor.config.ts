import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kanytrade.app",
  appName: "Kanytrade",
  webDir: "out",
  ios: {
    contentInset: "never",
    backgroundColor: "#101713",
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#101713",
    },
  },
};

export default config;
