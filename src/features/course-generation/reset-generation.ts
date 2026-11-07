import { Alert } from 'react-native';

export function confirmResetGeneration(onConfirm: () => void) {
  Alert.alert('재설정 및 재생성하기', '현재 생성된 코스중 저장하지 않은 코스는 삭제됩니다.', [
    { text: '취소', style: 'cancel' }, { text: '확인', onPress: onConfirm },
  ]);
}
