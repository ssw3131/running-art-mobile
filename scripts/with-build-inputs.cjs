const { withAppBuildGradle } = require('expo/config-plugins');

// Match Metro's tool/cache exclusion in Gradle's JS input snapshot as well.
// In particular, Google SDK credentials must never be traversed as app source.
module.exports = function withBuildInputs(config) {
  return withAppBuildGradle(config, config => {
    const marker = '// RunPen: exclude local tooling from bundle inputs';
    if (!config.modResults.contents.includes(marker)) {
      config.modResults.contents += `\n${marker}\ntasks.withType(com.facebook.react.tasks.BundleHermesCTask).configureEach {\n    sources.exclude('.cache/**', '.tools/**', '.git/**', 'server/**')\n}\n`;
    }
    return config;
  });
};
