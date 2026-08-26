import { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Waypoint, WaypointCategory } from '@/core/domain/model/waypoint';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { useAppTheme } from '@/hooks/useAppTheme';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_TITLE_SUGGESTION,
} from '@/constants/waypointCategories';

interface Props {
  waypoint: Waypoint;
  visible: boolean;
  onDismiss(): void;
  onSaved(): void;
}

export function EditWaypointSheet({ waypoint, visible, onDismiss, onSaved }: Props) {
  const [category, setCategory] = useState<WaypointCategory>(waypoint.category);
  const [title, setTitle] = useState(waypoint.title);
  const [note, setNote] = useState(waypoint.description ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useAppTheme();
  const titleInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setCategory(waypoint.category);
      setTitle(waypoint.title);
      setNote(waypoint.description ?? '');
      setError(null);
    }
  }, [visible, waypoint]);

  async function onSave() {
    if (!title.trim()) { setError('Title is required'); return; }
    setLoading(true);
    try {
      const result = await tripRepository.updateWaypoint({
        ...waypoint,
        category,
        title: title.trim(),
        description: note.trim() || null,
        updatedAt: new Date(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
      onDismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const suggestedTitle = CATEGORY_TITLE_SUGGESTION[category];

  function clearTitle() {
    setTitle('');
    titleInputRef.current?.focus();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onDismiss} />
        <View style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <Text style={[styles.sheetTitle, { color: theme.primaryText }]}>Edit waypoint</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <Text style={[styles.label, { color: theme.mutedText }]}>TITLE (REQUIRED)</Text>
            <View style={[styles.titleInputCard, { backgroundColor: theme.background }]}>
              <TextInput
                ref={titleInputRef}
                style={[styles.titleInput, { color: theme.primaryText }]}
                value={title}
                onChangeText={setTitle}
                placeholder="What should this waypoint be called?"
                placeholderTextColor={theme.mutedText}
                accessibilityLabel="Waypoint title"
              />
              {title.length > 0 ? (
                <Pressable
                  style={styles.clearTitleButton}
                  onPress={clearTitle}
                  accessibilityRole="button"
                  accessibilityLabel="Clear waypoint title"
                  hitSlop={4}
                >
                  <MaterialIcons name="close" size={20} color={theme.mutedText} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.suggestionRow}>
              <Text style={[styles.suggestionText, { color: theme.mutedText }]} numberOfLines={1}>
                Suggested: {suggestedTitle}
              </Text>
              <Pressable
                style={[styles.useSuggestionButton, { borderColor: theme.border }]}
                onPress={() => setTitle(suggestedTitle)}
                accessibilityRole="button"
                accessibilityLabel={`Use suggested title ${suggestedTitle}`}
              >
                <Text style={[styles.useSuggestionText, { color: theme.accent }]}>Use</Text>
              </Pressable>
            </View>

            {/* Category */}
            <Text style={[styles.label, { color: theme.mutedText }]}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {CATEGORY_ORDER.map((cat) => {
                const selected = cat === category;
                return (
                  <Pressable
                    key={cat}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.accentMuted : theme.background,
                        borderColor: selected ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <MaterialIcons
                      name={CATEGORY_ICON[cat]}
                      size={14}
                      color={selected ? theme.accent : theme.mutedText}
                    />
                    <Text style={[styles.chipText, { color: selected ? theme.accent : theme.primaryText }]}>
                      {CATEGORY_LABEL[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Note */}
            <Text style={[styles.label, { color: theme.mutedText }]}>NOTE</Text>
            <TextInput
              style={[styles.input, styles.noteInput, { backgroundColor: theme.background, color: theme.primaryText }]}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholder="Waypoint note"
              placeholderTextColor={theme.mutedText}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.buttons}>
              <Pressable
                style={[styles.button, { backgroundColor: theme.accentMuted }]}
                onPress={onDismiss}
                disabled={loading}
              >
                <Text style={[styles.cancelText, { color: theme.primaryText }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: theme.accent }, loading && { opacity: 0.6 }]}
                onPress={() => void onSave()}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={theme.background} />
                  : <Text style={[styles.saveText, { color: theme.background }]}>Save</Text>
                }
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  handle: { width: 44, height: 5, borderRadius: 999, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 26, fontWeight: '800', marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  input: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  titleInputCard: {
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleInput: {
    flex: 1,
    paddingLeft: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  clearTitleButton: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  suggestionText: { flex: 1, fontSize: 13 },
  useSuggestionButton: {
    minWidth: 56,
    minHeight: 40,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
  },
  useSuggestionText: { fontSize: 14, fontWeight: '700' },
  noteInput: { height: 100, textAlignVertical: 'top' },
  chipRow: { marginBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  error: { color: '#c0392b', fontSize: 13, marginTop: 8 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, fontWeight: '700' },
  saveText: { fontSize: 16, fontWeight: '700' },
});
