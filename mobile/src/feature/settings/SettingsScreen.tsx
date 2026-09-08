import { useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Linking,
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
import { isPremiumAccessError } from '@/core/domain/access/mobileAccessPolicy';
import type { PurchaseAccess } from '@/core/domain/model/purchase';
import { SUPPORTED_LANGUAGES, useI18n, useI18nStore, type LanguagePreference } from '@/i18n/i18nStore';
import { TRAILBOOK_WEBSITE_URL } from '@/constants/legal';

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'Auto', value: 'auto' },
  { label: 'Day', value: 'day' },
  { label: 'Night', value: 'night' },
];

const LANGUAGE_LABEL: Record<LanguagePreference, string> = {
  system: 'System', en: 'English', sr: 'Srpski', it: 'Italiano', es: 'Español', de: 'Deutsch', fr: 'Français',
};

export default function SettingsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const { locale, t } = useI18n();
  const languagePreference = useI18nStore((s) => s.preference);
  const setLanguagePreference = useI18nStore((s) => s.setPreference);

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
  const showDeleteAccountConfirm = useSettingsStore((s) => s.showDeleteAccountConfirm);
  const showDeleteConfirm = useSettingsStore((s) => s.showDeleteConfirm);
  const onDeleteAccountClick = useSettingsStore((s) => s.onDeleteAccountClick);
  const onDeleteLocalClick = useSettingsStore((s) => s.onDeleteLocalClick);
  const onDismissDeleteAccountConfirm = useSettingsStore(
    (s) => s.onDismissDeleteAccountConfirm,
  );
  const onDismissDeleteConfirm = useSettingsStore((s) => s.onDismissDeleteConfirm);
  const onConfirmDeleteAccount = useSettingsStore((s) => s.onConfirmDeleteAccount);
  const onConfirmDeleteLocal = useSettingsStore((s) => s.onConfirmDeleteLocal);
  const onExportDatabase = useSettingsStore((s) => s.onExportDatabase);
  const onRestoreFromBackend = useSettingsStore((s) => s.onRestoreFromBackend);
  const onLogout = useSettingsStore((s) => s.onLogout);
  const onStatusMessageShown = useSettingsStore((s) => s.onStatusMessageShown);

  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const purchaseSimulationEnabled =
    (role === 'admin' || role === 'test_user') &&
    (__DEV__ || process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES === 'true');
  const developerDataToolsEnabled =
    (role === 'admin' || role === 'test_user') &&
    (__DEV__ || process.env.EXPO_PUBLIC_ENABLE_DATA_TOOLS === 'true');

  useEffect(() => {
    if (!statusMessage) return;
    showAlert({
      title: 'Trailbook',
      message: statusMessage,
      buttons: isPremiumAccessError(statusMessage)
        ? [
            { text: t('settings.notNow'), style: 'cancel', onPress: onStatusMessageShown },
            {
              text: t('settings.viewPremium'),
              onPress: () => {
                onStatusMessageShown();
                router.push('/premium');
              },
            },
          ]
        : [{ text: t('common.ok'), onPress: onStatusMessageShown }],
    });
  }, [onStatusMessageShown, router, showAlert, statusMessage, t]);

  useEffect(() => {
    if (status === 'authenticated') void refreshPurchaseAccess();
  }, [refreshPurchaseAccess, status]);

  return (
    <ScreenLayout
      contentStyle={styles.screenContent}
      rightActions={
        <Pressable
          accessibilityLabel={isDemo ? t('settings.exitDemo') : t('settings.logout')}
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
      title={t('settings.title')}
      showBottomNavigation
      contentVariant="plain"
      scrollEnabled
    >
      <View style={styles.settingsRoot}>
        <SettingsSection title={t('settings.account')}>
          <SettingsRow
            description={
              isDemo
                ? t('settings.demoLimits')
                : status === 'authenticated'
                  ? t('settings.fullAccount')
                  : undefined
            }
            iconName="person"
            title={isDemo ? t('settings.demoUser') : displayName ?? t('settings.signedIn')}
          />
          <SettingsDivider />
          <SettingsRow
            description={isDemo ? t('settings.demoUnavailable') : email ?? t('settings.emailReload')}
            iconName="mail-outline"
            title={t('settings.email')}
          />
          <SettingsDivider />
          <SettingsRow
            description={
              isDemo
                ? t('settings.localOnly')
                : purchaseAccess
                  ? purchaseDescription(purchaseAccess, t, locale)
                  : t('settings.loadingAccess')
            }
            iconName="workspace-premium"
            loading={!isDemo && purchaseBusyAction === 'access'}
            onPress={!isDemo ? () => router.push('/premium') : undefined}
            title={t('settings.purchase')}
            value={isDemo
              ? t('settings.demo')
              : purchaseAccess
                ? purchaseStatusLabel(purchaseAccess, t)
                : undefined}
          />
          {!isDemo && status === 'authenticated' ? (
            <>
              <SettingsDivider />
              <SettingsRow
                description={t('settings.deleteAccountDescription')}
                disabled={isWorking}
                iconName="delete-forever"
                onPress={onDeleteAccountClick}
                title={t('settings.deleteAccount')}
                tone="danger"
                value={t('common.delete')}
              />
            </>
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('settings.themeSection')}>
          <View style={styles.themePreference}>
            <View style={[styles.preferenceIcon, { backgroundColor: theme.accentMuted }]}>
              <MaterialIcons color={theme.accent} name="palette" size={20} />
            </View>
            <View style={styles.preferenceBody}>
              <Text style={[styles.preferenceTitle, { color: theme.primaryText }]}>{t('settings.theme')}</Text>
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
                        {option.value === 'auto' ? t('settings.themeAuto') : option.value === 'day' ? t('settings.themeDay') : t('settings.themeNight')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </SettingsSection>

        <SettingsSection title={t('settings.languageSection')}>
          <View style={styles.themePreference}>
            <View style={[styles.preferenceIcon, { backgroundColor: theme.accentMuted }]}>
              <MaterialIcons color={theme.accent} name="language" size={20} />
            </View>
            <View style={styles.preferenceBody}>
              <Text style={[styles.preferenceTitle, { color: theme.primaryText }]}>{t('settings.language')}</Text>
              <View style={styles.languageRow}>
                {(['system', ...SUPPORTED_LANGUAGES] as LanguagePreference[]).map((option) => {
                  const selected = languagePreference === option;
                  return <Pressable key={option} onPress={() => void setLanguagePreference(option)} style={[styles.languageButton, { backgroundColor: selected ? theme.accent : theme.accentMuted }]}><Text style={[styles.themeButtonText, { color: selected ? theme.background : theme.accent }]}>{option === 'system' ? t('settings.systemDefault') : LANGUAGE_LABEL[option]}</Text></Pressable>;
                })}
              </View>
            </View>
          </View>
        </SettingsSection>

        {!isDemo ? (
          <SettingsSection title={t('settings.cloudData')}>
            <SettingsRow
              description={t('settings.restoreDescription')}
              disabled={isWorking}
              iconName="cloud-download"
              loading={isWorking}
              onPress={() => void onRestoreFromBackend()}
              title={t('settings.restoreMissing')}
              value={t('common.restore')}
            />
          </SettingsSection>
        ) : null}

        <SettingsSection title={t('settings.app')}>
          <SettingsRow
            description="trailbook.rs"
            iconName="language"
            onPress={() => void Linking.openURL(TRAILBOOK_WEBSITE_URL)}
            title={t('settings.website')}
            value={t('common.open')}
          />
          <SettingsDivider />
          <SettingsRow
            iconName="info-outline"
            onPress={() => router.push('/about')}
            title={t('settings.about')}
            value={t('common.open')}
          />
        </SettingsSection>

        {purchaseSimulationEnabled || developerDataToolsEnabled ? (
          <SettingsSection title={t('settings.developer')}>
            {purchaseSimulationEnabled ? (
              <SettingsRow
                iconName="payments"
                onPress={() => router.push('/purchases')}
                title={t('settings.purchaseSimulation')}
                value={t('common.open')}
              />
            ) : null}
            {purchaseSimulationEnabled && developerDataToolsEnabled ? <SettingsDivider /> : null}
            {developerDataToolsEnabled ? (
              <>
                <SettingsRow
                  disabled={isWorking}
                  iconName="delete-sweep"
                  onPress={onDeleteLocalClick}
                  title={t('settings.deleteLocal')}
                  tone="danger"
                  value={t('common.delete')}
                />
                <SettingsDivider />
                <SettingsRow
                  disabled={isWorking}
                  iconName="storage"
                  loading={isWorking}
                  onPress={() => void onExportDatabase()}
                  title={t('settings.exportDatabase')}
                  value={t('common.share')}
                />
              </>
            ) : null}
          </SettingsSection>
        ) : null}

      </View>

      {/* Delete confirm sheet */}
      <BottomSheetModal
        visible={showDeleteConfirm}
        onClose={onDismissDeleteConfirm}
        title={t('settings.deleteLocalTitle')}
        subtitle={t('settings.deleteLocalDescription')}
      >
        <ModalActions
          primaryLabel={t('common.delete')}
          secondaryLabel={t('common.cancel')}
          onPrimaryPress={() => void onConfirmDeleteLocal()}
          onSecondaryPress={onDismissDeleteConfirm}
        />
      </BottomSheetModal>

      <BottomSheetModal
        visible={showDeleteAccountConfirm}
        onClose={onDismissDeleteAccountConfirm}
        title={t('settings.deleteAccountTitle')}
        subtitle={t('settings.deleteAccountWarning')}
      >
        <ModalActions
          primaryDisabled={isWorking}
          primaryLabel={t('settings.deleteAccount')}
          primaryLoading={isWorking}
          primaryLoadingLabel={t('settings.deleting')}
          secondaryDisabled={isWorking}
          secondaryLabel={t('common.cancel')}
          onPrimaryPress={() => void onConfirmDeleteAccount()}
          onSecondaryPress={onDismissDeleteAccountConfirm}
        />
      </BottomSheetModal>

    </ScreenLayout>
  );
}

type Translate = ReturnType<typeof useI18n>['t'];

function purchaseDescription(access: PurchaseAccess, t: Translate, locale: string) {
  const plan = access.planCode === 'premium_yearly'
    ? t('premium.plan.yearly')
    : access.planCode === 'premium_monthly'
      ? t('premium.plan.monthly')
      : t('premium.plan.none');
  const period = access.currentPeriodEndsAt
    ? ` · ${t('premium.period.until', {
        date: new Date(access.currentPeriodEndsAt).toLocaleDateString(locale),
      })}`
    : '';
  return `${plan} · ${purchaseStatusLabel(access, t)}${period}`;
}

function purchaseStatusLabel(access: PurchaseAccess, t: Translate) {
  const statuses: Record<PurchaseAccess['subscriptionStatus'], string> = {
    active: t('premium.status.active'),
    billing_retry: t('premium.status.retry'),
    canceled: t('premium.status.canceled'),
    expired: t('premium.status.expired'),
    in_grace_period: t('premium.status.grace'),
    lifetime: t('premium.status.lifetime'),
    revoked: t('premium.status.revoked'),
  };
  return statuses[access.subscriptionStatus];
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
  languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  languageButton: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
});
