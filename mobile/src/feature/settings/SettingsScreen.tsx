import { useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/feature/auth/authStore';
import { useSettingsStore } from '@/feature/settings/settingsStore';
import { useThemeStore, type ThemePreference } from '@/feature/settings/themeStore';
import ScreenLayout from '@/components/layout/screen-layout';
import BottomSheetModal from '@/components/ui/bottom-sheet-modal';
import ModalActions from '@/components/ui/modal-actions';
import { useAppTheme } from '@/hooks/useAppTheme';

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'Auto', value: 'auto' },
  { label: 'Day', value: 'day' },
  { label: 'Night', value: 'night' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();

  const status = useAuthStore((s) => s.status);
  const displayName = useAuthStore((s) => s.displayName);
  const isDemo = useAuthStore((s) => s.isDemo);

  const isWorking = useSettingsStore((s) => s.isWorking);
  const statusMessage = useSettingsStore((s) => s.statusMessage);
  const showDeleteConfirm = useSettingsStore((s) => s.showDeleteConfirm);
  const onDeleteLocalClick = useSettingsStore((s) => s.onDeleteLocalClick);
  const onDismissDeleteConfirm = useSettingsStore((s) => s.onDismissDeleteConfirm);
  const onConfirmDeleteLocal = useSettingsStore((s) => s.onConfirmDeleteLocal);
  const onRestoreFromBackend = useSettingsStore((s) => s.onRestoreFromBackend);
  const onLogout = useSettingsStore((s) => s.onLogout);
  const onStatusMessageShown = useSettingsStore((s) => s.onStatusMessageShown);

  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  useEffect(() => {
    if (statusMessage) {
      Alert.alert('', statusMessage, [{ text: 'OK', onPress: onStatusMessageShown }]);
    }
  }, [statusMessage]);

  return (
    <ScreenLayout title="Settings" showBottomNavigation contentVariant="plain" scrollEnabled>
      {/* Account */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardLabel, { color: theme.mutedText }]}>Account</Text>
        <View style={styles.row}>
          <View>
            <Text style={[styles.rowTitle, { color: theme.primaryText }]}>
              {isDemo ? 'Demo user' : displayName ?? 'Signed in'}
            </Text>
            {isDemo && <Text style={[styles.rowSub, { color: theme.mutedText }]}>Max 3 trips · no sync</Text>}
            {!isDemo && status === 'authenticated' && <Text style={[styles.rowSub, { color: theme.mutedText }]}>Full account</Text>}
          </View>
        </View>
      </View>

      {/* Theme */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardLabel, { color: theme.mutedText }]}>Theme</Text>
        <View style={styles.chipRow}>
          {THEME_OPTIONS.map((opt) => {
            const selected = preference === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.chip, { backgroundColor: selected ? theme.accent : theme.accentMuted }]}
                onPress={() => setPreference(opt.value)}
              >
                <Text style={[styles.chipText, { color: selected ? theme.background : theme.primaryText }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Data */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardLabel, { color: theme.mutedText }]}>Data</Text>

        <Pressable
          style={[styles.row, styles.rowPressable, (isDemo || isWorking) && styles.rowDisabled]}
          onPress={isDemo ? undefined : () => void onRestoreFromBackend()}
          disabled={isDemo || isWorking}
        >
          <Text style={[styles.rowTitle, { color: isDemo ? theme.mutedText : theme.primaryText }]}>
            Restore from backend
          </Text>
          {isWorking
            ? <ActivityIndicator size="small" color={theme.accent} />
            : <Text style={[styles.chevron, { color: theme.mutedText }]}>›</Text>
          }
        </Pressable>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <Pressable
          style={[styles.row, styles.rowPressable, (isDemo || isWorking) && styles.rowDisabled]}
          onPress={isDemo ? undefined : onDeleteLocalClick}
          disabled={isDemo || isWorking}
        >
          <Text style={[styles.rowTitle, { color: isDemo ? theme.mutedText : theme.danger }]}>
            Delete local trips
          </Text>
          <Text style={[styles.chevron, { color: theme.mutedText }]}>›</Text>
        </Pressable>
      </View>

      {/* About */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardLabel, { color: theme.mutedText }]}>App</Text>
        <Pressable style={[styles.row, styles.rowPressable]} onPress={() => router.push('/about')}>
          <Text style={[styles.rowTitle, { color: theme.primaryText }]}>About Vellora</Text>
          <Text style={[styles.chevron, { color: theme.mutedText }]}>›</Text>
        </Pressable>
      </View>

      {/* Logout */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Pressable
          style={[styles.row, styles.rowPressable, isWorking && { opacity: 0.6 }]}
          onPress={onLogout}
          disabled={isWorking}
        >
          <Text style={[styles.rowTitle, { color: theme.danger }]}>
            {isDemo ? 'Exit demo' : 'Log out'}
          </Text>
        </Pressable>
      </View>

      {/* Delete confirm sheet */}
      <BottomSheetModal
        visible={showDeleteConfirm}
        onClose={onDismissDeleteConfirm}
        title="Delete all local trips?"
        subtitle="This removes all trips, waypoints and photos from this device. Only trips already synced to the server can be restored."
      >
        <ModalActions
          primaryLabel="Delete"
          secondaryLabel="Cancel"
          onPrimaryPress={() => void onConfirmDeleteLocal()}
          onSecondaryPress={onDismissDeleteConfirm}
        />
      </BottomSheetModal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowPressable: {},
  rowDisabled: { opacity: 0.4 },
  rowTitle: { fontSize: 16 },
  rowSub: { fontSize: 12, marginTop: 2 },
  chevron: { fontSize: 20 },
  divider: { height: StyleSheet.hairlineWidth },
  chipRow: { flexDirection: 'row', gap: 10, paddingBottom: 8 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14 },
  chipText: { fontSize: 14, fontWeight: '600' },
});
