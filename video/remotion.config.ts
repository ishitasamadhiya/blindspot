import { Config } from "@remotion/cli/config";
import path from "node:path";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: { ...(config.resolve?.alias ?? {}), "@web": path.resolve(process.cwd(), "../apps/web/src") },
  },
}));
