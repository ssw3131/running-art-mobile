const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  // Immutable upstream fixtures are hash-verified by the route regression tests.
  { ignores: ['dist/*', '.tools/**', '.cache/**', 'android/**', 'ios/**', 'tests/reference/**'] },
]);
