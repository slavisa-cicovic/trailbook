import { type PropsWithChildren } from 'react';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { BottomNav } from '@/components/ui/BottomNav';

interface ScreenLayoutProps extends PropsWithChildren {
  title?: string;
  contentStyle?: StyleProp<ViewStyle>;
  contentVariant?: 'card' | 'plain';
  onBack?: () => void;
  scrollEnabled?: boolean;
  showBottomNavigation?: boolean;
}

export default function ScreenLayout({
  children,
  title,
  contentStyle,
  contentVariant = 'card',
  onBack,
  scrollEnabled = true,
  showBottomNavigation = false,
}: ScreenLayoutProps) {
  const router = useRouter();
  const { theme } = useAppTheme();

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={showBottomNavigation ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <View style={styles.shell}>
          {(title || onBack) && (
            <View style={styles.header}>
              <View style={styles.headerLead}>
                {onBack ? (
                  <Pressable
                    onPress={onBack}
                    style={[styles.backButton, { backgroundColor: theme.accentMuted }]}
                  >
                    <MaterialIcons color={theme.accent} name="arrow-back" size={18} />
                  </Pressable>
                ) : null}
                <Text style={[styles.headerTitle, { color: theme.primaryText }]}>{title ?? ''}</Text>
              </View>
            </View>
          )}

          {scrollEnabled ? (
            <ScrollView
              contentContainerStyle={[
                styles.content,
                contentVariant === 'plain' && styles.contentPlain,
                contentStyle,
              ]}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={[
                  contentVariant === 'card' ? styles.card : styles.plainContentScroll,
                  contentVariant === 'card' ? { backgroundColor: theme.card } : null,
                ]}
              >
                {children}
              </View>
            </ScrollView>
          ) : (
            <View
              style={[
                styles.content,
                styles.contentNoScroll,
                contentVariant === 'plain' && styles.contentPlain,
                contentStyle,
              ]}
            >
              <View
                style={[
                  contentVariant === 'card' ? styles.card : styles.plainContent,
                  contentVariant === 'card' ? { backgroundColor: theme.card } : null,
                ]}
              >
                {children}
              </View>
            </View>
          )}

          {showBottomNavigation ? <BottomNav /> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardContainer: { flex: 1 },
  shell: { flex: 1 },
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    zIndex: 20,
    elevation: 20,
  },
  headerLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerTitle: { fontSize: 24, fontWeight: '700' },
  backButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    zIndex: 1,
  },
  contentNoScroll: { flex: 1 },
  contentPlain: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    gap: 8,
    zIndex: 1,
  },
  plainContent: { flex: 1 },
  plainContentScroll: { width: '100%' },
});
