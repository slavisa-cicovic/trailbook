import { type PropsWithChildren, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { BottomNav } from '@/components/ui/BottomNav';
import { TopAppBar } from '@/components/ui/TopAppBar';

interface ScreenLayoutProps extends PropsWithChildren {
  title?: string;
  contentStyle?: StyleProp<ViewStyle>;
  contentVariant?: 'card' | 'plain';
  onBack?: () => void;
  rightActions?: ReactNode;
  scrollEnabled?: boolean;
  showBottomNavigation?: boolean;
}

export default function ScreenLayout({
  children,
  title,
  contentStyle,
  contentVariant = 'card',
  onBack,
  rightActions,
  scrollEnabled = true,
  showBottomNavigation = false,
}: ScreenLayoutProps) {
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
            <TopAppBar onBack={onBack} rightActions={rightActions} title={title ?? ''} />
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
