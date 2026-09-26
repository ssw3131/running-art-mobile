const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Project-local SDKs and Gradle caches are tooling, not JavaScript source.
config.resolver.blockList = [
  ...config.resolver.blockList,
  /(^|[/\\])\.(tools|cache)([/\\]|$)/,
];
config.maxWorkers = 2;

module.exports = config;
