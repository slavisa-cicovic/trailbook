import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';

export interface CustomAlertButton {
  onPress?: () => void;
  style?: 'cancel' | 'default' | 'destructive';
  text: string;
}

export interface CustomAlertOptions {
  buttons?: CustomAlertButton[];
  message?: string;
  title: string;
}

interface CustomAlertContextValue {
  showAlert(options: CustomAlertOptions): void;
}

const CustomAlertContext = createContext<CustomAlertContextValue | null>(null);

export function CustomAlertProvider({ children }: PropsWithChildren) {
  const { theme } = useAppTheme();
  const { t } = useI18n();
  const [alert, setAlert] = useState<CustomAlertOptions | null>(null);

  const showAlert = useCallback((options: CustomAlertOptions) => {
    setAlert(options);
  }, []);

  const dismiss = useCallback((button?: CustomAlertButton) => {
    setAlert(null);
    button?.onPress?.();
  }, []);

  const contextValue = useMemo(() => ({ showAlert }), [showAlert]);
  const buttons = alert?.buttons?.length
    ? alert.buttons
    : [{ text: t('common.ok') } satisfies CustomAlertButton];
  const cancelButton = buttons.find((button) => button.style === 'cancel');
  const dismissButton = cancelButton ?? buttons[buttons.length - 1];

  return (
    <CustomAlertContext.Provider value={contextValue}>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => dismiss(dismissButton)}
        transparent
        visible={alert !== null}
      >
        <View style={styles.backdrop}>
          <View
            accessibilityViewIsModal
            style={[
              styles.dialog,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            {alert?.title ? (
              <Text style={[styles.title, { color: theme.primaryText }]}>
                {alert.title}
              </Text>
            ) : null}
            {alert?.message ? (
              <Text style={[styles.message, { color: theme.mutedText }]}>
                {alert.message}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {buttons.map((button, index) => {
                const destructive = button.style === 'destructive';
                const primary = button.style !== 'cancel' && index === buttons.length - 1;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={`${button.text}-${index}`}
                    onPress={() => dismiss(button)}
                    style={({ pressed }) => [
                      styles.button,
                      {
                        backgroundColor: destructive
                          ? theme.dangerMuted
                          : primary
                            ? theme.accent
                            : theme.accentMuted,
                      },
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        {
                          color: destructive
                            ? theme.danger
                            : primary
                              ? theme.background
                              : theme.primaryText,
                        },
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </CustomAlertContext.Provider>
  );
}

export function useCustomAlert() {
  const context = useContext(CustomAlertContext);
  if (!context) {
    throw new Error('useCustomAlert must be used inside CustomAlertProvider.');
  }
  return context;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 18, 10, 0.5)',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    gap: 12,
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  button: {
    minWidth: 88,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  buttonPressed: {
    opacity: 0.76,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
