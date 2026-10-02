import { getStorage } from '../storage/database';
import { createRunController } from './controller';
import { trackingDriver } from './native-driver';

export const running = createRunController(async () => (await getStorage()).runs, trackingDriver);
