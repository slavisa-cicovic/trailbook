import { type ReactNode, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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

type SettingsIconName = keyof typeof MaterialIcons.glyphMap;

function SettingsSection({ children, title }: { children: ReactNode; title: string }) {
  const { theme } = useAppTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.mutedText }]}>{title}</Text>
      <View
        style={[
          styles.preferenceGroup,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function SettingsDivider() {
  const { theme } = useAppTheme();
  return <View style={[styles.preferenceDivider, { backgroundColor: theme.border }]} />;
}

function SettingsRow({
  description,
  disabled,
  iconName,
  loading,
  onPress,
  title,
  tone = 'default',
  value,
}: {
  description?: string;
  disabled?: boolean;
  iconName: SettingsIconName;
  loading?: boolean;
  onPress?: () => void;
  title: string;
  tone?: 'default' | 'danger';
  value?: string;
}) {
  const { theme } = useAppTheme();
  const interactive = Boolean(onPress) && !disabled;
  const iconColor = tone === 'danger' ? theme.danger : theme.accent;
  const iconBackground = tone === 'danger' ? theme.dangerMuted : theme.accentMuted;

  return (
    <Pressable
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.preferenceRow,
        pressed && styles.preferenceRowPressed,
        disabled && styles.preferenceRowDisabled,
      ]}
    >
      <View style={[styles.preferenceIcon, { backgroundColor: iconBackground }]}>
        <MaterialIcons color={iconColor} name={iconName} size={20} />
      </View>
      <View style={styles.preferenceBody}>
        <Text
          style={[
            styles.preferenceTitle,
            { color: tone === 'danger' ? theme.danger : theme.primaryText },
          ]}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[styles.preferenceDescription, { color: theme.mutedText }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.preferenceTrailing}>
        {loading ? (
          <ActivityIndicator color={theme.accent} size="small" />
        ) : value ? (
          <Text style={[styles.preferenceValue, { color: theme.mutedText }]}>{value}</Text>
        ) : null}
        {interactive && !loading ? (
          <MaterialIcons color={theme.mutedText} name="chevron-right" size={22} />
        ) : null}
      </View>
    </Pressable>
  );
}

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
    <ScreenLayout
      contentStyle={styles.screenContent}
      rightActions={
        <Pressable
          accessibilityLabel={isDemo ? 'Exit demo' : 'Log out'}
          disabled={isWorking}
          hitSlop={10}
          onPress={onLogout}
          style={[
            styles.logoutAppBarButton,
            { backgroundColor: theme.dangerMuted },
            isWorking && styles.preferenceRowDisabled,
          ]}
        >
          <MaterialIcons color={theme.danger} name="logout" size={20} />
        </Pressable>
      }
      title="Settings"
      showBottomNavigation
      contentVariant="plain"
      scrollEnabled
    >
      <View style={styles.settingsRoot}>
        <SettingsSection title="Account">
          <SettingsRow
            description={
              isDemo
                ? 'Max 3 trips · no sync'
                : status === 'authenticated'
                  ? 'Full account'
                  : undefined
            }
            iconName="person"
            title={isDemo ? 'Demo user' : displayName ?? 'Signed in'}
          />
        </SettingsSection>

        <SettingsSection title="Theme">
          <View style={styles.themePreference}>
            <View style={[styles.preferenceIcon, { backgroundColor: theme.accentMuted }]}>
              <MaterialIcons color={theme.accent} name="palette" size={20} />
            </View>
            <View style={styles.preferenceBody}>
              <Text style={[styles.preferenceTitle, { color: theme.primaryText }]}>Theme</Text>
              <View style={styles.themeRow}>
                {THEME_OPTIONS.map((option) => {
                  const selected = preference === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setPreference(option.value)}
                      style={[
                        styles.themeButton,
                        { backgroundColor: selected ? theme.accent : theme.accentMuted },
                      ]}
                    >
                      <Text
                        style={[
                          styles.themeButtonText,
                          { color: selected ? theme.background : theme.accent },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </SettingsSection>

        <SettingsSection title="Data">
          <SettingsRow
            disabled={isDemo || isWorking}
            iconName="cloud-download"
            loading={isWorking}
            onPress={isDemo ? undefined : () => void onRestoreFromBackend()}
            title="Restore from backend"
            value={isDemo ? 'Unavailable' : 'Restore'}
          />
          <SettingsDivider />
          <SettingsRow
            disabled={isDemo || isWorking}
            iconName="delete-sweep"
            onPress={isDemo ? undefined : onDeleteLocalClick}
            title="Delete local trips"
            tone="danger"
            value={isDemo ? 'Unavailable' : 'Delete'}
          />
        </SettingsSection>

        <SettingsSection title="App">
          <SettingsRow
            iconName="info-outline"
            onPress={() => router.push('/about')}
            title="About Trailbook"
            value="Open"
          />
        </SettingsSection>

      </View>

      {/* Delete confirm sheet */}
      <BottomSheetModal
        visible={showDeleteConfirm}
        onClose={onDismissDeleteConfirm}
        title="Delete all local trips?"
        subtitle="This permanently removes all trips, waypoints and photos from this device."
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
  screenContent: {
    justifyContent: 'flex-start',
  },
  logoutAppBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRoot: {
    gap: 18,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  preferenceGroup: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  preferenceRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  preferenceRowPressed: {
    opacity: 0.72,
  },
  preferenceRowDisabled: {
    opacity: 0.62,
  },
  preferenceIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceBody: {
    flex: 1,
    gap: 3,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  preferenceDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  preferenceTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  preferenceValue: {
    flexShrink: 1,
    maxWidth: 110,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  preferenceDivider: {
    height: 1,
    marginLeft: 62,
  },
  themePreference: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
  },
  themeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 10,
  },
  themeButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
