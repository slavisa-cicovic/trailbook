import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useState } from 'react';
import BottomSheetModal from '@/components/ui/bottom-sheet-modal';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';
import { verifyPhotoMetadata, type VerificationState } from '@/core/domain/photo/photoVerification';
import type { PhotoCoordinates } from '@/core/domain/photo/photoLocation';

interface Props {
  capturedAt: Date | null;
  photoCoordinates: PhotoCoordinates | null;
  style?: StyleProp<ViewStyle>;
  waypointCoordinates: PhotoCoordinates | null;
  waypointCreatedAt: Date | null;
}

function formatDistance(distanceM: number): string {
  return distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${Math.round(distanceM)} m`;
}

function formatDuration(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

export function PhotoVerificationIndicator({
  capturedAt,
  photoCoordinates,
  style,
  waypointCoordinates,
  waypointCreatedAt,
}: Props) {
  const [visible, setVisible] = useState(false);
  const { theme } = useAppTheme();
  const { locale, t } = useI18n();
  const result = verifyPhotoMetadata({
    capturedAt,
    photoCoordinates,
    waypointCoordinates,
    waypointCreatedAt,
  });

  if (result.severity === 'verified') return null;
  const color = result.severity === 'mismatch' ? theme.danger : '#b56a00';
  const backgroundColor = result.severity === 'mismatch' ? theme.dangerMuted : '#fff0cf';

  function statusText(kind: 'location' | 'time', state: VerificationState): string {
    if (state === 'match') return t('waypoint.verificationMatches');
    if (state === 'unavailable') {
      return t(kind === 'location'
        ? 'waypoint.verificationLocationUnavailable'
        : 'waypoint.verificationTimeUnavailable');
    }
    const detail = kind === 'location' && result.distanceM !== null
      ? formatDistance(result.distanceM)
      : kind === 'time' && result.timeDifferenceMs !== null
        ? formatDuration(result.timeDifferenceMs)
        : null;
    return `${t(kind === 'location'
      ? 'waypoint.verificationLocationDiffers'
      : 'waypoint.verificationTimeDiffers')}${detail ? ` · ${detail}` : ''}`;
  }

  return (
    <>
      <Pressable
        accessibilityLabel={t('waypoint.verificationOpen')}
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          setVisible(true);
        }}
        style={[styles.indicator, { backgroundColor }, style]}
      >
        <MaterialIcons color={color} name="error-outline" size={18} />
      </Pressable>
      <BottomSheetModal
        onClose={() => setVisible(false)}
        title={t('waypoint.verificationTitle')}
        visible={visible}
      >
        <VerificationRow
          label={t('waypoint.verificationLocation')}
          state={result.location}
          text={statusText('location', result.location)}
        />
        <VerificationRow
          label={t('waypoint.verificationTime')}
          state={result.time}
          text={statusText('time', result.time)}
        />
        <View style={[styles.timestamps, { borderColor: theme.border }]}>
          <Text style={[styles.timestamp, { color: theme.mutedText }]}>
            {t('waypoint.photoTakenAt')} {capturedAt ? capturedAt.toLocaleString(locale) : t('waypoint.photoTimeUnknown')}
          </Text>
          <Text style={[styles.timestamp, { color: theme.mutedText }]}>
            {t('waypoint.createdAt')} {waypointCreatedAt ? waypointCreatedAt.toLocaleString(locale) : t('waypoint.photoTimeUnknown')}
          </Text>
        </View>
        <Pressable onPress={() => setVisible(false)} style={[styles.close, { backgroundColor: theme.accent }]}>
          <Text style={[styles.closeText, { color: theme.background }]}>{t('common.close')}</Text>
        </Pressable>
      </BottomSheetModal>
    </>
  );
}

function VerificationRow({ label, state, text }: { label: string; state: VerificationState; text: string }) {
  const { theme } = useAppTheme();
  const color = state === 'match' ? theme.accent : state === 'mismatch' ? theme.danger : '#b56a00';
  const icon = state === 'match' ? 'check-circle-outline' : state === 'mismatch' ? 'cancel' : 'help-outline';
  return (
    <View style={styles.row}>
      <MaterialIcons color={color} name={icon} size={24} />
      <View style={styles.rowText}>
        <Text style={[styles.label, { color: theme.primaryText }]}>{label}</Text>
        <Text style={[styles.detail, { color: theme.mutedText }]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  close: { alignItems: 'center', borderRadius: 16, marginTop: 20, paddingVertical: 14 },
  closeText: { fontSize: 16, fontWeight: '800' },
  detail: { fontSize: 14, marginTop: 2 },
  indicator: { alignItems: 'center', borderRadius: 999, height: 28, justifyContent: 'center', width: 28 },
  label: { fontSize: 16, fontWeight: '800' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 10 },
  rowText: { flex: 1 },
  timestamp: { fontSize: 13, lineHeight: 20 },
  timestamps: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 14 },
});
