import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Waypoint, WaypointCategory } from '@/core/domain/model/waypoint';
import * as waypointDao from '@/core/data/local/waypointDao';
import { useAppTheme } from '@/hooks/useAppTheme';
import { CATEGORY_ICON, CATEGORY_LABEL, CATEGORY_ORDER } from '@/constants/waypointCategories';

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
      await waypointDao.updateWaypoint({
        ...waypoint,
        category,
        title: title.trim(),
        description: note.trim() || null,
        updatedAt: new Date(),
      });
      onSaved();
      onDismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
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
            <Text style={[styles.label, { color: theme.mutedText }]}>TITLE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.primaryText }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Waypoint title"
              placeholderTextColor={theme.mutedText}
            />

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
