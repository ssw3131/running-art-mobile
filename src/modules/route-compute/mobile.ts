import { fetch } from 'expo/fetch';
import { computeBaseUrl, createRemoteCalculation } from './client';

const base = computeBaseUrl(process.env.EXPO_PUBLIC_COMPUTE_BASE_URL);
// Public road computation supports guests; no account/refresh token is sent.
export const calculateServerRoute = base ? createRemoteCalculation(base, fetch) : undefined;
