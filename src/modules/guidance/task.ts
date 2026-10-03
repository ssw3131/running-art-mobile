import { AppRegistry } from 'react-native';
import { guidance } from './runtime';
AppRegistry.registerHeadlessTask('runpen-guidance-simulation', () => data => guidance.task(data));
