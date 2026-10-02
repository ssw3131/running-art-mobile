// Expo's Windows watcher can retain backslash paths after adding screens.
// Generate from the current app tree before typechecking using Expo's own generator.
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
process.env.EXPO_ROUTER_APP_ROOT = path.join(root, 'src/app');
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli'));
const output = path.join(root, '.expo/types');
fs.mkdirSync(output, { recursive: true });
cliRequire('@expo/router-server/build/typed-routes').regenerateDeclarations(output);
