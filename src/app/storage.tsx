import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getStorage } from '@/modules/storage/database';
import { NOTE_MAX_LENGTH, type StorageTestNote, type TestNoteRepository } from '@/modules/storage/test-notes';
import { storageErrorMessage } from '@/modules/storage/types';

export default function StorageScreen() {
  const [notes, setNotes] = useState<StorageTestNote[]>([]);
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const active = useRef(false);
  const supported = Platform.OS !== 'web';

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const repository = await getStorage();
      const rows = await repository.list();
      if (active.current) {
        setNotes(rows);
        setReady(true);
        setNotice('기기에 저장된 목록을 불러왔어요.');
      }
    } catch (cause) {
      if (active.current) setError(storageErrorMessage(cause));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    active.current = true;
    if (supported) void refresh();
    return () => { active.current = false; };
  }, [refresh, supported]));

  const mutate = async (action: (repository: TestNoteRepository) => Promise<unknown>, message: string, clearEditor: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice('');
    let committed = false;
    try {
      const repository = await getStorage();
      await action(repository);
      committed = true;
      if (active.current && clearEditor) {
        setContent('');
        setEditingId(null);
        Keyboard.dismiss();
      }
      const rows = await repository.list();
      if (active.current) {
        setNotes(rows);
        setNotice(message);
      }
    } catch (cause) {
      if (active.current) setError(committed
        ? `${message} 목록을 불러오지 못했어요. 새로고침해 주세요.`
        : storageErrorMessage(cause));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  };

  const save = () => {
    const id = editingId;
    const value = content;
    void mutate((repository) => id === null ? repository.create(value) : repository.update(id, value),
      id === null ? '메모를 저장했어요.' : '메모를 수정했어요.', true);
  };

  const confirmDelete = (note: StorageTestNote) => {
    Alert.alert('메모를 삭제할까요?', '이 테스트 메모는 다시 복원할 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => {
        void mutate((repository) => repository.remove(note.id), '메모를 삭제했어요.', editingId === note.id);
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>기기에 남는 테스트 메모</Text>
        <Text style={styles.description}>메모를 저장하고 앱을 껐다 켜 보세요. 이 기기에 저장되며 실제 코스·러닝 기록과는 별개예요.</Text>
        {!supported ? <Text style={styles.description}>저장소 테스트는 Android 개발용 앱에서 실행해 주세요.</Text> : <>
          <View style={styles.status} accessibilityLiveRegion="polite">
            {busy && <ActivityIndicator color="#183C32" />}
            <Text testID="storage-status" style={styles.description}>{busy ? '저장소 작업 중…' : error ? '저장소 확인이 필요해요' : ready ? '저장소 준비 완료' : '저장소 준비 중…'}</Text>
          </View>
          {error && <Text testID="storage-error" accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!!notice && <Text testID="storage-notice" accessibilityLiveRegion="polite" style={styles.description}>{notice}</Text>}
          <Pressable testID="storage-refresh" accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => void refresh()} style={[styles.secondary, busy && styles.disabled]}>
            <Text style={styles.secondaryText}>{error ? '다시 시도 · 새로고침' : '목록 새로고침'}</Text>
          </Pressable>
          {ready && <>
            <View style={styles.card}>
              <Text style={styles.subtitle}>{editingId === null ? '새 메모' : `메모 #${editingId} 수정`}</Text>
              <TextInput
                testID="storage-note-input" accessibilityLabel="테스트 메모 내용" value={content} onChangeText={setContent}
                placeholder="저장할 내용을 입력하세요" placeholderTextColor="#6C7871" maxLength={NOTE_MAX_LENGTH}
                editable={!busy} style={styles.input} onSubmitEditing={save} returnKeyType="done"
              />
              <Text style={styles.hint}>{content.length} / {NOTE_MAX_LENGTH}자</Text>
              <Pressable testID="storage-save" accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={save} style={[styles.button, busy && styles.disabled]}>
                <Text style={styles.buttonText}>{editingId === null ? '메모 저장' : '수정 저장'}</Text>
              </Pressable>
              {editingId !== null && <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setEditingId(null); setContent(''); }} style={styles.secondary}>
                <Text style={styles.secondaryText}>수정 취소</Text>
              </Pressable>}
            </View>
            <Text testID="storage-count" style={styles.subtitle}>저장한 메모 {notes.length}개</Text>
            {notes.length === 0 && <Text testID="storage-empty" style={styles.description}>아직 저장한 메모가 없어요.</Text>}
            {notes.map((note) => <View key={note.id} testID={`storage-note-${note.id}`} style={styles.card}>
              <Text style={styles.note}>{note.content}</Text>
              <Text style={styles.hint}>#{note.id} · 수정 {new Date(note.updatedAt).toLocaleString('ko-KR')}</Text>
              <View style={styles.actions}>
                <Pressable testID={`storage-edit-${note.id}`} accessibilityRole="button" accessibilityLabel={`메모 ${note.id} 수정`} disabled={busy} onPress={() => { setEditingId(note.id); setContent(note.content); setError(null); setNotice(''); }} style={styles.secondary}>
                  <Text style={styles.secondaryText}>수정</Text>
                </Pressable>
                <Pressable testID={`storage-delete-${note.id}`} accessibilityRole="button" accessibilityLabel={`메모 ${note.id} 삭제`} disabled={busy} onPress={() => confirmDelete(note)} style={styles.secondary}>
                  <Text style={styles.error}>삭제</Text>
                </Pressable>
              </View>
            </View>)}
          </>}
          <Text style={styles.hint}>앱 데이터 삭제·앱 제거 시 기기에 저장한 메모도 삭제돼요.</Text>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5F0' },
  content: { padding: 24, gap: 16 },
  title: { color: '#183C32', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#183C32', fontSize: 19, fontWeight: '600' },
  description: { color: '#57675F', fontSize: 15, lineHeight: 23 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, gap: 12 },
  input: { borderWidth: 1, borderColor: '#8B9C90', borderRadius: 10, padding: 14, color: '#183C32', fontSize: 16 },
  note: { color: '#183C32', fontSize: 17, lineHeight: 25 },
  hint: { color: '#57675F', fontSize: 12, lineHeight: 19 },
  button: { backgroundColor: '#183C32', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondary: { padding: 12, alignItems: 'center', borderRadius: 10, backgroundColor: '#E8EDE7' },
  secondaryText: { color: '#183C32', fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12 },
  error: { color: '#A12F2F', fontSize: 15, lineHeight: 22 },
  disabled: { opacity: 0.5 },
});
