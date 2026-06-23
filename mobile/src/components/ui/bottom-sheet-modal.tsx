import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type KeyboardAvoidingViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';

interface BottomSheetModalProps extends PropsWithChildren {
  contentStyle?: StyleProp<ViewStyle>;
  keyboardBehavior?: KeyboardAvoidingViewProps['behavior'];
  keyboardVerticalOffset?: number;
  onClose: () => void;
  subtitle?: string;
  title?: string;
  visible: boolean;
}

export default function BottomSheetModal({
  children,
  contentStyle,
  keyboardBehavior,
  keyboardVerticalOffset,
  onClose,
  subtitle,
  title,
  visible,
}: BottomSheetModalProps) {
  const { theme, resolvedMode } = useAppTheme();
  const defaultKeyboardOffset = Platform.OS === 'android' ? 8 : 0;
  const resolvedKeyboardBehavior = keyboardBehavior ?? (Platform.OS === 'ios' ? 'padding' : undefined);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.screen}>
        <StatusBar barStyle={resolvedMode === 'night' ? 'light-content' : 'dark-content'} />
        <Pressable onPress={onClose} style={styles.backdrop} />
        <KeyboardAvoidingView
          behavior={resolvedKeyboardBehavior}
          keyboardVerticalOffset={keyboardVerticalOffset ?? defaultKeyboardOffset}
          style={styles.keyboardAvoidingView}
        >
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <ScrollView
              contentContainerStyle={[styles.content, contentStyle]}
              keyboardShouldPersistTaps="handled"
            >
              {title ? <Text style={[styles.title, { color: theme.primaryText }]}>{title}</Text> : null}
              {subtitle ? <Text style={[styles.subtitle, { color: theme.mutedText }]}>{subtitle}</Text> : null}
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'rgba(10, 18, 10, 0.5)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '84%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    marginTop: 10,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 14,
  },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20 },
});
