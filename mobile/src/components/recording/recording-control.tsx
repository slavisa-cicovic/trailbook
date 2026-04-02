import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RecordingStatus } from "../../domain/trips";

interface RecordingControlProps {
  compact?: boolean;
  onPress: () => void;
  status: RecordingStatus;
}

const controlByStatus: Record<
  RecordingStatus,
  {
    caption: string;
    buttonColor: string;
    iconName: keyof typeof MaterialIcons.glyphMap;
    ringColor: string;
  }
> = {
  idle: {
    caption: "Tap to start a new trip",
    iconName: "play-arrow",
    buttonColor: "#243224",
    ringColor: "#dce8d4",
  },
  recording: {
    caption: "Tap to stop the current trip",
    iconName: "stop",
    buttonColor: "#c54834",
    ringColor: "#f2cbc3",
  },
  interrupted: {
    caption: "Tap to continue or stop the interrupted trip",
    iconName: "refresh",
    buttonColor: "#d5832b",
    ringColor: "#f2dfc0",
  },
};

export default function RecordingControl({
  compact = false,
  onPress,
  status,
}: RecordingControlProps) {
  const config = controlByStatus[status];

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={onPress}
        style={[
          styles.outerRing,
          {
            backgroundColor: config.ringColor,
          },
        ]}
      >
        <View
          style={[
            styles.innerButton,
            compact && styles.innerButtonCompact,
            {
              backgroundColor: config.buttonColor,
            },
          ]}
        >
          <MaterialIcons color="#fffdf8" name={config.iconName} size={compact ? 30 : 40} />
        </View>
      </Pressable>
      {!compact ? <Text style={styles.caption}>{config.caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: 12,
  },
  outerRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
  },
  innerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  innerButtonCompact: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  caption: {
    fontSize: 13,
    fontWeight: "600",
    color: "#243224",
    textAlign: "center",
  },
});
