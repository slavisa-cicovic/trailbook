import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import type { Waypoint, WaypointCategory } from '@/core/domain/model/waypoint';
import * as waypointDao from '@/core/data/local/waypointDao';
import { useAppTheme } from '@/hooks/useAppTheme';

const CATEGORIES: WaypointCategory[] = [
  'GENERIC', 'DEPARTURE', 'FUEL', 'BORDER', 'PORT',
  'FERRY', 'RESTAURANT', 'CAFE', 'VIEWPOINT', 'MONUMENT', 'BEACH',
];
const CATEGORY_LABEL: Record<WaypointCategory, string> = {
  GENERIC: 'Generic', DEPARTURE: 'Departure', FUEL: 'Fuel', BORDER: 'Border',
  PORT: 'Port', FERRY: 'Ferry', RESTAURANT: 'Restaurant', CAFE: 'Cafe',
  VIEWPOINT: 'Viewpoint', MONUMENT: 'Monument', BEACH: 'Beach',
};

interface Props {
  waypoint: Waypoint;
  visible: boolean;
  onDismiss(): void;
  onSaved(): void;
}

export function EditWaypointSheet({ waypoint, visible, onDismiss, onSaved }: Props) {
  const [category, setCategory] = useState<WaypointCategory>(waypoint.category);
  const [title, setTitle] = useState(waypoint.title);
  const [description, setDescription] = useState(waypoint.description ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useAppTheme();

  useEffect(() => {
    if (visible) {
      setCategory(waypoint.category);
      setTitle(waypoint.title);
      setDescription(waypoint.description ?? '');
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
        description: description.trim() || null,
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
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <Text style={[styles.sheetTitle, { color: theme.primaryText }]}>Edit Waypoint</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: theme.mutedText }]}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              {CATEGORIES.map((cat) => {
                const selected = cat === category;
                return (
                  <Pressable
                    key={cat}
                    style={[
                      styles.chip,
                      { backgroundColor: selected ? theme.accent : theme.accentMuted },
                    ]}
                    onPress={() => { setCategory(cat); setTitle(CATEGORY_LABEL[cat]); }}
                  >
                    <Text style={[styles.chipText, { color: selected ? theme.background : theme.primaryText }]}>
                      {CATEGORY_LABEL[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.label, { color: theme.mutedText }]}>TITLE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card, color: theme.primaryText, borderColor: theme.border }]}
              value={title}
              onChangeText={setTitle}
              placeholderTextColor={theme.mutedText}
            />

            <Text style={[styles.label, { color: theme.mutedText }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top', backgroundColor: theme.card, color: theme.primaryText, borderColor: theme.border }]}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={2}
              placeholderTextColor={theme.mutedText}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.buttons}>
              <Pressable style={[styles.button, { backgroundColor: theme.accentMuted }]} onPress={onDismiss} disabled={loading}>
                <Text style={[styles.cancelText, { color: theme.primaryText }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: theme.accent }, loading && styles.disabled]}
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 18, 10, 0.5)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  handle: { width: 44, height: 5, borderRadius: 999, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  chipText: { fontSize: 13, fontWeight: '600' },
  error: { color: '#c0392b', fontSize: 13, marginTop: 8 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, fontWeight: '700' },
  saveText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
