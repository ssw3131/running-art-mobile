import * as Crypto from 'expo-crypto';
import { authentication, authClient, accountSecureStorage } from '../auth/runtime';
import { createMembershipController } from './controller';
import { createMembershipRemote } from './remote';

export const membership = createMembershipController({
  auth: authentication, remote: authClient ? createMembershipRemote(authClient) : null,
  storage: accountSecureStorage, uuid: Crypto.randomUUID,
});
