import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Application from 'expo-application';
import ScreenLayout from '@/components/layout/screen-layout';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function AboutScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();

  const rows = [
    { label: 'Version', value: Application.nativeApplicationVersion ?? '—' },
    { label: 'Build', value: Application.nativeBuildVersion ?? '—' },
    { label: 'Bundle ID', value: Application.applicationId ?? '—' },
  ];

  return (
    <ScreenLayout title="About" onBack={() => router.back()}>
      <View style={styles.hero}>
        <View style={[styles.logoBox, { backgroundColor: theme.accent }]}>
          <Text style={[styles.logoLetter, { color: theme.background }]}>V</Text>
        </View>
        <Text style={[styles.appName, { color: theme.primaryText }]}>Vellora</Text>
        <Text style={[styles.tagline, { color: theme.mutedText }]}>Your personal travel journal</Text>
      </View>

      {rows.map((row, i) => (
        <View
          key={row.label}
          style={[styles.infoRow, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
        >
          <Text style={[styles.infoLabel, { color: theme.mutedText }]}>{row.label}</Text>
          <Text style={[styles.infoValue, { color: theme.primaryText }]}>{row.value}</Text>
        </View>
      ))}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 6,
    marginBottom: 16,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoLetter: { fontSize: 38, fontWeight: '800' },
  appName: { fontSize: 24, fontWeight: '700' },
  tagline: { fontSize: 14 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: { fontSize: 15 },
  infoValue: { fontSize: 15, fontWeight: '500' },
});
