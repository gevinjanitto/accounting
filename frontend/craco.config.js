const path = require("path");
require("dotenv").config();

module.exports = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: { "@": path.resolve(__dirname, "src") },
    configure: (webpackConfig) => {
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/build/**", "**/dist/**", "**/coverage/**", "**/public/**"],
      };
      return webpackConfig;
    },
  },
  devServer: (devServerConfig) => {
    const { onAfterSetupMiddleware, onBeforeSetupMiddleware, https, ...cfg } = devServerConfig;
    cfg.server = https ? "https" : "http";
    cfg.setupMiddlewares = (middlewares, devServer) => {
      if (onBeforeSetupMiddleware) onBeforeSetupMiddleware(devServer);
      if (onAfterSetupMiddleware) onAfterSetupMiddleware(devServer);
      return middlewares;
    };
    return cfg;
  },
};
