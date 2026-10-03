import 'react-native-url-polyfill/auto';
import './crypto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { authConfig, AUTH_STORAGE_KEY } from './config';
import { createAuthController } from './controller';
import { createSecureStorage } from './secure-storage';

const config = authConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const storage = createSecureStorage({
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: key => SecureStore.deleteItemAsync(key),
}, Crypto.randomUUID);
const client = config && Platform.OS !== 'web' ? createClient(config.url, config.key, {
  auth: { storage, storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', debug: false },
}) : null;

export const authentication = createAuthController({
  auth: client?.auth ?? null,
  storage,
  openBrowser: (url, redirect) => WebBrowser.openAuthSessionAsync(url, redirect),
});
