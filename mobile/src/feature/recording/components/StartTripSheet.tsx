import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRecordingStore } from '../recordingStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';
import {
  accessErrorMessage,
  isPremiumAccessError,
} from '@/core/domain/access/mobileAccessPolicy';

interface Props {
  visible: boolean;
  onDismiss(): void;
}

export function StartTripSheet({ visible, onDismiss }: Props) {
  const titleInputRef = useRef<TextInput>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumError, setPremiumError] = useState(false);
  const startRecording = useRecordingStore((s) => s.startRecording);
  const { theme } = useAppTheme();
  const router = useRouter();
  const { localizeError, t } = useI18n();

  function clearPendingFocus() {
    if (!focusTimeoutRef.current) return;
    clearTimeout(focusTimeoutRef.current);
    focusTimeoutRef.current = null;
  }

  function focusTitleInput() {
    clearPendingFocus();
    if (Platform.OS === 'android') {
      focusTimeoutRef.current = setTimeout(() => {
        focusTimeoutRef.current = null;
        titleInputRef.current?.focus();
      }, 150);
      return;
    }
    titleInputRef.current?.focus();
  }

  useEffect(() => {
    if (!visible) clearPendingFocus();
    return clearPendingFocus;
  }, [visible]);

  async function onStart() {
    if (!title.trim()) { setPremiumError(false); setError(t('error.titleRequired')); return; }
    setLoading(true);
    setError(null);
    const result = await startRecording(title.trim(), description.trim() || null);
    setLoading(false);
    if (!result.ok) {
      setPremiumError(isPremiumAccessError(result.error));
      setError(localizeError(accessErrorMessage(result.error)));
    } else {
      setPremiumError(false);
      setTitle('');
      setDescription('');
      onDismiss();
    }
  }

  function onCancel() {
    clearPendingFocus();
    setTitle('');
    setDescription('');
    setError(null);
    setPremiumError(false);
    onDismiss();
  }

  function onViewPremium() {
    onCancel();
    setTimeout(() => router.push('/premium'), 250);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      onShow={focusTitleInput}
    >
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <Text style={[styles.sheetTitle, { color: theme.primaryText }]}>{t('trip.new')}</Text>

          <Text style={[styles.label, { color: theme.mutedText }]}>{t('trip.title').toUpperCase()}</Text>
          <TextInput
            ref={titleInputRef}
            style={[styles.input, { backgroundColor: theme.card, color: theme.primaryText, borderColor: theme.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder={t('trip.titlePlaceholder')}
            placeholderTextColor={theme.mutedText}
            autoFocus={Platform.OS === 'ios'}
            returnKeyType="next"
          />

          <Text style={[styles.label, { color: theme.mutedText }]}>{t('trip.description').toUpperCase()}</Text>
          <TextInput
            style={[styles.input, styles.inputMulti, { backgroundColor: theme.card, color: theme.primaryText, borderColor: theme.border }]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('trip.descriptionPlaceholder')}
            placeholderTextColor={theme.mutedText}
            multiline
            numberOfLines={3}
          />

          {error ? (
            <View style={styles.errorBlock}>
              <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
              {premiumError ? (
                <Pressable onPress={onViewPremium}>
                  <Text style={[styles.premiumLink, { color: theme.accent }]}>{t('premium.viewOptions')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.buttons}>
            <Pressable style={[styles.button, { backgroundColor: theme.accentMuted }]} onPress={onCancel} disabled={loading}>
              <Text style={[styles.cancelText, { color: theme.primaryText }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: theme.accent }, loading && styles.disabled]}
              onPress={() => void onStart()}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={theme.background} />
                : <Text style={[styles.startText, { color: theme.background }]}>{t('common.start')}</Text>
              }
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 18, 10, 0.5)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 8,
  },
  handle: {
    width: 44, height: 5, borderRadius: 999,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginTop: 6,
  },
  inputMulti: { height: 90, textAlignVertical: 'top', paddingTop: 14 },
  errorBlock: { gap: 8, marginTop: 4 },
  error: { fontSize: 13 },
  premiumLink: { fontSize: 14, fontWeight: '800' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  button: {
    flex: 1, paddingVertical: 16, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '700' },
  startText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
