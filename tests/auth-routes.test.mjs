import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
test('every application route is explicitly inside the authenticated group or public allowlist', () => {
  const root = new URL('../src/app/', import.meta.url);
  const files = readdirSync(root, { recursive: true }).map(name => name.replaceAll('\\', '/'));
  const actual = [...new Set(files.filter(name => name.endsWith('.tsx') && !name.endsWith('_layout.tsx')).map(name => name.startsWith('(tabs)/') ? '(tabs)' : name.slice(0, -4)))].sort();
  const source = readFileSync(new URL('../src/features/auth/ServiceStack.tsx', import.meta.url), 'utf8');
  const privatePart = source.split('export const privateScreens = [')[1].split('] as const')[0];
  const declared = [...privatePart.matchAll(/\['([^']+)',/g)].map(match => match[1]);
  assert.deepEqual([...declared, 'account-entry', 'auth/callback', 'service-policy'].sort(), actual,
    'Classify every added page. Expo Router otherwise auto-registers unlisted pages outside Stack.Protected.');
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.equal(app.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-router')[1].sitemap, false);
});
