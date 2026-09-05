import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ScreenLayout from '@/components/layout/screen-layout';
import { API_BASE_URL } from '@/core/data/remote/apiConfig';
import { useAuthStore } from '@/feature/auth/authStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import {
  TRAILBOOK_PRIVACY_POLICY_URL,
  TRAILBOOK_SUPPORT_EMAIL,
  TRAILBOOK_TERMS_OF_USE_URL,
  TRAILBOOK_WEBSITE_URL,
} from '@/constants/legal';
import { useI18n } from '@/i18n/i18nStore';

function getAppName() {
  return Constants.expoConfig?.name ?? 'Trailbook';
}

function getAppVersion() {
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    '1.0.0'
  );
}

function getBuildVersion(fallback = 'Development') {
  return Application.nativeBuildVersion ?? fallback;
}

function getRuntimeLabel(nativeLabel = 'Native build') {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? 'Expo Go'
    : nativeLabel;
}

function formatPlatformVersion() {
  return `${Platform.OS} ${String(Platform.Version)}`;
}

function buildSupportEmailUrl(account: string) {
  const subject = encodeURIComponent(
    `Trailbook support - ${getAppVersion()} (${formatPlatformVersion()})`,
  );
  const body = encodeURIComponent(
    [
      '',
      '',
      '---',
      `App: ${getAppName()}`,
      `Version: ${getAppVersion()}`,
      `Build: ${getBuildVersion()}`,
      `Runtime: ${getRuntimeLabel()}`,
      `Platform: ${formatPlatformVersion()}`,
      `API: ${API_BASE_URL}`,
      `Account: ${account}`,
    ].join('\n'),
  );

  return `mailto:${TRAILBOOK_SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export default function AboutScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { t } = useI18n();
  const status = useAuthStore((state) => state.status);
  const displayName = useAuthStore((state) => state.displayName);
  const account =
    status === 'demo'
      ? t('settings.demoUser')
      : status === 'authenticated'
        ? displayName ?? t('settings.signedIn')
        : t('about.notSignedIn');

  function handleContactSupport() {
    void Linking.openURL(buildSupportEmailUrl(account));
  }

  return (
    <ScreenLayout
      contentVariant="plain"
      onBack={() => router.back()}
      title={t('about.title')}
    >
      <View style={styles.root}>
        <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Image
            accessibilityIgnoresInvertColors
            source={require('../../../assets/app-icon.png')}
            style={styles.appIcon}
          />
          <Text style={[styles.appName, { color: theme.primaryText }]}>{getAppName()}</Text>
          <Text style={[styles.appVersion, { color: theme.mutedText }]}>
            {t('about.version')} {getAppVersion()}
          </Text>
        </View>

        <InfoCard label={t('about.appInfo')}>
          <InfoRow label={t('about.build')} value={getBuildVersion(t('about.development'))} />
          <InfoRow label={t('about.runtime')} value={getRuntimeLabel(t('about.nativeBuild'))} />
          <InfoRow label={t('about.platform')} value={formatPlatformVersion()} />
        </InfoCard>

        <InfoCard label={t('about.support')}>
          <InfoRow label={t('about.author')} value={TRAILBOOK_SUPPORT_EMAIL} />
          <Pressable
            onPress={handleContactSupport}
            style={({ pressed }) => [styles.emailButton, pressed && styles.emailButtonPressed]}
          >
            <Text style={[styles.emailText, { color: theme.accent }]}>{t('about.contactSupport')}</Text>
          </Pressable>
        </InfoCard>

        <InfoCard label={t('about.permissions')}>
          <Text style={[styles.bodyText, { color: theme.primaryText }]}>
            {t('about.permissionsDescription')}
          </Text>
        </InfoCard>

        <InfoCard label={t('about.links')}>
          <LegalRow label={t('settings.website')} url={TRAILBOOK_WEBSITE_URL} />
          <LegalRow label={t('about.privacy')} url={TRAILBOOK_PRIVACY_POLICY_URL} />
          <LegalRow label={t('about.terms')} url={TRAILBOOK_TERMS_OF_USE_URL} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/licenses')}
            style={styles.legalRow}
          >
            <Text style={[styles.infoRowLabel, { color: theme.mutedText }]}>{t('about.licenses')}</Text>
            <Text style={[styles.emailText, { color: theme.accent }]}>{t('common.open')}</Text>
          </Pressable>
        </InfoCard>
      </View>
    </ScreenLayout>
  );
}

function LegalRow({ label, url }: { label: string; url: string }) {
  const { theme } = useAppTheme();
  const { t } = useI18n();
  return (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={styles.legalRow}>
      <Text style={[styles.infoRowLabel, { color: theme.mutedText }]}>{label}</Text>
      <Text style={[styles.emailText, { color: theme.accent }]}>{t('common.open')}</Text>
    </Pressable>
  );
}

function InfoCard({ children, label }: { children: React.ReactNode; label: string }) {
  const { theme } = useAppTheme();

  return (
    <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.infoLabel, { color: theme.mutedText }]}>{label}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme();

  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoRowLabel, { color: theme.mutedText }]}>{label}</Text>
      <Text selectable style={[styles.infoRowValue, { color: theme.primaryText }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },
  heroCard: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 30,
  },
  appIcon: {
    width: 112,
    height: 112,
    borderRadius: 28,
    marginBottom: 18,
  },
  appName: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  appVersion: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '700',
  },
  infoCard: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  infoRow: {
    gap: 4,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 5,
  },
  infoRowLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoRowValue: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  bodyText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  emailButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  emailButtonPressed: {
    opacity: 0.7,
  },
  emailText: {
    fontSize: 17,
    fontWeight: '800',
  },
});
