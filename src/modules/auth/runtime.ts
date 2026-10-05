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
import { configuredSignInProviders } from './providers';
import { createProfilePhotoStore } from '../account/photo-remote';

const config = authConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export const accountSecureStorage = createSecureStorage({
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: key => SecureStore.deleteItemAsync(key),
}, Crypto.randomUUID);
const storage = accountSecureStorage;
export const authClient = config && Platform.OS !== 'web' ? createClient(config.url, config.key, {
  auth: { storage, storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', debug: false },
}) : null;

export const profilePhotosEnabled = process.env.EXPO_PUBLIC_PROFILE_PHOTOS_ENABLED === 'true';
export const authentication = createAuthController({
  auth: authClient?.auth ?? null,
  providers: configuredSignInProviders(process.env.EXPO_PUBLIC_AUTH_KAKAO_ENABLED, process.env.EXPO_PUBLIC_AUTH_NAVER_ENABLED),
  storage,
  profilePhotos: authClient && profilePhotosEnabled ? createProfilePhotoStore(authClient, Crypto.randomUUID) : undefined,
  openBrowser: (url, redirect) => WebBrowser.openAuthSessionAsync(url, redirect),
  canChangeAccount: async () => {
    const { getStorage } = await import('../storage/database');
    const active=await (await getStorage()).sync.hasActiveRun();
    // Expiry must not lock a runner out of re-authenticating to finish their run.
    return !active || active.owner_id!==(authentication.getSnapshot().account?.id??'');
  },
});
