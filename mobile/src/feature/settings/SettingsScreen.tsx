import { useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/feature/auth/authStore';
import { useSettingsStore } from '@/feature/settings/settingsStore';
import { useThemeStore, type ThemePreference } from '@/feature/settings/themeStore';
import { usePurchaseStore } from '@/feature/purchases/purchaseStore';
import SettingsDivider from '@/feature/settings/components/SettingsDivider';
import SettingsRow from '@/feature/settings/components/SettingsRow';
import SettingsSection from '@/feature/settings/components/SettingsSection';
import ScreenLayout from '@/components/layout/screen-layout';
import BottomSheetModal from '@/components/ui/bottom-sheet-modal';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
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
  const { showAlert } = useCustomAlert();

  const status = useAuthStore((s) => s.status);
  const displayName = useAuthStore((s) => s.displayName);
  const email = useAuthStore((s) => s.email);
  const isDemo = useAuthStore((s) => s.isDemo);
  const role = useAuthStore((s) => s.role);
  const purchaseAccess = usePurchaseStore((s) => s.access);
  const purchaseBusyAction = usePurchaseStore((s) => s.busyAction);
  const refreshPurchaseAccess = usePurchaseStore((s) => s.refreshAccess);

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
  const purchaseSimulationEnabled =
    (role === 'admin' || role === 'test_user') &&
    (__DEV__ || process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES === 'true');

  useEffect(() => {
    if (!statusMessage) return;
    showAlert({
      title: 'Trailbook',
      message: statusMessage,
      buttons: [{ text: 'OK', onPress: onStatusMessageShown }],
    });
  }, [onStatusMessageShown, showAlert, statusMessage]);

  useEffect(() => {
    if (status === 'authenticated') void refreshPurchaseAccess();
  }, [refreshPurchaseAccess, status]);

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
          <SettingsDivider />
          <SettingsRow
            description={isDemo ? 'Not available in demo mode' : email ?? 'Sign in again to load email'}
            iconName="mail-outline"
            title="Email"
          />
          <SettingsDivider />
          <SettingsRow
            description={
              isDemo
                ? 'Local access only'
                : purchaseAccess
                  ? `${purchaseAccess.planCode} · ${purchaseAccess.subscriptionStatus}`
                  : 'Loading purchase access'
            }
            iconName="workspace-premium"
            loading={!isDemo && purchaseBusyAction === 'access'}
            title="Purchase"
            value={isDemo ? 'Demo' : purchaseAccess?.subscriptionStatus}
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

        {purchaseSimulationEnabled ? (
          <SettingsSection title="Developer">
            <SettingsRow
              iconName="payments"
              onPress={() => router.push('/purchases')}
              title="Purchases simulation"
              value="Open"
            />
          </SettingsSection>
        ) : null}

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
