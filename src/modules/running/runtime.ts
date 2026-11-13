import { getStorage } from '../storage/database';
import { createRunController } from './controller';
import { trackingDriver } from './native-driver';
import { AppState } from 'react-native';
import { planApproach } from './navigation';
import { recordingChanged } from './recording-events';

export const running = createRunController(async () => (await getStorage()).runs, trackingDriver, planApproach, recordingChanged);
AppState.addEventListener('change', state => {
  if (state === 'background') { running.cancelPreparation(); void running.monitor().catch(() => {}); }
});
