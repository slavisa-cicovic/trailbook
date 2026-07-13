import Constants from 'expo-constants';
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

const AUTHOR_EMAIL = 'sc.trailbook@gmail.com';
const PRIVACY_STATUS = 'To be published before public release';
const LICENSES_STATUS = 'To be added before public release';

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

function getBuildVersion() {
  return Application.nativeBuildVersion ?? 'Development';
}

function getRuntimeLabel() {
  return Constants.appOwnership === 'expo' ? 'Expo Go' : 'Native build';
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

  return `mailto:${AUTHOR_EMAIL}?subject=${subject}&body=${body}`;
}

export default function AboutScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const status = useAuthStore((state) => state.status);
  const displayName = useAuthStore((state) => state.displayName);
  const account =
    status === 'demo'
      ? 'Demo user'
      : status === 'authenticated'
        ? displayName ?? 'Signed in'
        : 'Not signed in';

  function handleContactSupport() {
    void Linking.openURL(buildSupportEmailUrl(account));
  }

  return (
    <ScreenLayout
      contentVariant="plain"
      onBack={() => router.back()}
      title="About"
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
            Version {getAppVersion()}
          </Text>
        </View>

        <InfoCard label="App info">
          <InfoRow label="Build" value={getBuildVersion()} />
          <InfoRow label="Runtime" value={getRuntimeLabel()} />
          <InfoRow label="Platform" value={formatPlatformVersion()} />
        </InfoCard>

        <InfoCard label="Support">
          <InfoRow label="Author" value={AUTHOR_EMAIL} />
          <Pressable
            onPress={handleContactSupport}
            style={({ pressed }) => [styles.emailButton, pressed && styles.emailButtonPressed]}
          >
            <Text style={[styles.emailText, { color: theme.accent }]}>Contact support</Text>
          </Pressable>
        </InfoCard>

        <InfoCard label="Permissions">
          <Text style={[styles.bodyText, { color: theme.primaryText }]}>
            Trailbook uses location, motion activity and camera access for trip recording,
            automatic segment detection and waypoint photos.
          </Text>
        </InfoCard>

        <InfoCard label="Legal">
          <InfoRow label="Privacy policy" value={PRIVACY_STATUS} />
          <InfoRow label="Open-source licenses" value={LICENSES_STATUS} />
        </InfoCard>
      </View>
    </ScreenLayout>
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
