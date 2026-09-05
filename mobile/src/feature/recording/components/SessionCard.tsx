import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Trip } from '@/core/domain/model/trip';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';

interface Props {
  isRecording: boolean;
  isPaused: boolean;
  trip: Trip | null;
  stoppingTrip: boolean;
  onStartPress: () => void;
  onStopPress: () => void;
  onResumePress: () => void;
  onDetailsPress: () => void;
}

export function SessionCard({
  isRecording, isPaused, trip, stoppingTrip,
  onStartPress, onStopPress, onResumePress, onDetailsPress,
}: Props) {
  const { theme, resolvedMode } = useAppTheme();
  const { t } = useI18n();

  const cardBg = resolvedMode === 'night'
    ? 'rgba(22, 32, 24, 0.96)'
    : 'rgba(255, 253, 248, 0.96)';

  if (isRecording && trip) {
    if (isPaused) {
      return (
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Pressable
            style={[styles.playCircle, { backgroundColor: theme.accentMuted }]}
            onPress={onResumePress}
          >
            <MaterialIcons name="play-arrow" size={28} color={theme.accent} />
          </Pressable>
          <Pressable style={styles.textArea} onPress={onDetailsPress}>
            <Text style={[styles.title, { color: theme.primaryText }]} numberOfLines={1}>{trip.title}</Text>
            <Text style={[styles.sub, { color: theme.mutedText }]}>{t('recording.pausedDetails')}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Pressable style={[styles.stopCircle, { backgroundColor: theme.dangerMuted }]} onPress={onStopPress} disabled={stoppingTrip}>
          {stoppingTrip
            ? <ActivityIndicator color={theme.danger} size="small" />
            : <View style={[styles.stopSquare, { backgroundColor: theme.danger }]} />
          }
        </Pressable>
        <Pressable style={styles.textArea} onPress={onDetailsPress}>
          <Text style={[styles.title, { color: theme.primaryText }]} numberOfLines={1}>{trip.title}</Text>
          <Text style={[styles.sub, { color: theme.mutedText }]}>{t('recording.recordingDetails')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      <Pressable
        style={[styles.playCircle, { backgroundColor: theme.accentMuted }]}
        onPress={onStartPress}
      >
        <MaterialIcons name="play-arrow" size={28} color={theme.accent} />
      </Pressable>
      <Pressable style={styles.textArea} onPress={onStartPress}>
        <Text style={[styles.title, { color: theme.primaryText }]}>{t('recording.noActiveRoute')}</Text>
        <Text style={[styles.sub, { color: theme.mutedText }]}>{t('recording.tapToStart')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stopCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stopSquare: {
    width: 18,
    height: 18,
    borderRadius: 3,
  },
  textArea: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
});
