import type { PropsWithChildren } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface BottomSheetModalProps extends PropsWithChildren {
  contentStyle?: StyleProp<ViewStyle>;
  keyboardBehavior?: KeyboardAvoidingViewProps["behavior"];
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
  const defaultKeyboardOffset = Platform.OS === "android" ? 8 : 0;
  const resolvedKeyboardBehavior = keyboardBehavior ?? (Platform.OS === "ios" ? "padding" : undefined);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <Pressable onPress={onClose} style={styles.backdrop} />
        <KeyboardAvoidingView
          behavior={resolvedKeyboardBehavior}
          keyboardVerticalOffset={keyboardVerticalOffset ?? defaultKeyboardOffset}
          style={styles.keyboardAvoidingView}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ScrollView
              contentContainerStyle={[styles.content, contentStyle]}
              keyboardShouldPersistTaps="handled"
            >
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
    backgroundColor: "rgba(24, 31, 24, 0.36)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "84%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#f3efe6",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#c9d2c2",
    marginTop: 10,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2a1f",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#52624f",
  },
});
