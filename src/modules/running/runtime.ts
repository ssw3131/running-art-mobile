import { getStorage } from '../storage/database';
import { createRunController } from './controller';
import { trackingDriver } from './native-driver';
import { AppState } from 'react-native';

export const running = createRunController(async () => (await getStorage()).runs, trackingDriver);
AppState.addEventListener('change', state => {
  if (state === 'background') void running.monitor().catch(() => {});
});
