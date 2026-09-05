import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import type { TripGroupWithMembers } from '@/core/domain/model/tripGroup';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';

interface Props {
  visible: boolean;
  selectedCount: number;
  groups: TripGroupWithMembers[];
  onClose(): void;
  onCreate(title: string, description: string | null): void;
  onAddToExisting(groupId: string): void;
}

export function AddToGroupModal({
  visible,
  selectedCount,
  groups,
  onClose,
  onCreate,
  onAddToExisting,
}: Props) {
  const { theme } = useAppTheme();
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  function handleCreate() {
    onCreate(title, description.trim() ? description : null);
    setTitle('');
    setDescription('');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.title, { color: theme.primaryText }]}>{t('trips.addToGroup')}</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            {selectedCount} {t(selectedCount === 1 ? 'trips.syncedTripSelectedOne' : 'trips.syncedTripSelectedMany')}
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('trips.newGroupTitle')}
            placeholderTextColor={theme.mutedText}
            style={[styles.input, { color: theme.primaryText, borderColor: theme.border }]}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('trips.optionalDescription')}
            placeholderTextColor={theme.mutedText}
            style={[styles.input, styles.descriptionInput, { color: theme.primaryText, borderColor: theme.border }]}
            multiline
          />

          <View style={styles.actions}>
            <Pressable style={[styles.secondaryButton, { backgroundColor: theme.accentMuted }]} onPress={onClose}>
              <Text style={[styles.secondaryText, { color: theme.mutedText }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={handleCreate}>
              <Text style={[styles.primaryText, { color: theme.background }]}>{t('trips.createGroup')}</Text>
            </Pressable>
          </View>

          {groups.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>{t('trips.existingGroups')}</Text>
              <ScrollView style={styles.groupList} showsVerticalScrollIndicator={false}>
                {groups.map((item) => (
                  <Pressable
                    key={item.group.id}
                    style={[styles.groupRow, { borderColor: theme.border }]}
                    onPress={() => onAddToExisting(item.group.id)}
                  >
                    <Text style={[styles.groupTitle, { color: theme.primaryText }]}>{item.group.title}</Text>
                    <Text style={[styles.groupMeta, { color: theme.mutedText }]}>
                      {item.members.length} {t(item.members.length === 1 ? 'trips.tripOne' : 'trips.tripMany')}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  card: { borderRadius: 28, padding: 20, maxHeight: '88%' },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 6, marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 16, padding: 14, fontSize: 16, marginBottom: 10 },
  descriptionInput: { minHeight: 78, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryButton: { flex: 1, borderRadius: 18, paddingVertical: 13, alignItems: 'center' },
  secondaryButton: { flex: 1, borderRadius: 18, paddingVertical: 13, alignItems: 'center' },
  primaryText: { fontSize: 15, fontWeight: '800' },
  secondaryText: { fontSize: 15, fontWeight: '800' },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, marginTop: 18, marginBottom: 8 },
  groupList: { maxHeight: 220 },
  groupRow: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 8 },
  groupTitle: { fontSize: 16, fontWeight: '800' },
  groupMeta: { fontSize: 13, marginTop: 4 },
});
