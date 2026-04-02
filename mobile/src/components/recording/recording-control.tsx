import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RecordingStatus } from "../../domain/trips";

interface RecordingControlProps {
  onPress: () => void;
  status: RecordingStatus;
}

const controlByStatus: Record<
  RecordingStatus,
  { caption: string; label: string; buttonColor: string; ringColor: string }
> = {
  idle: {
    caption: "Tap to start a new trip",
    label: "START",
    buttonColor: "#243224",
    ringColor: "#dce8d4",
  },
  recording: {
    caption: "Tap to stop the current trip",
    label: "STOP",
    buttonColor: "#c54834",
    ringColor: "#f2cbc3",
  },
  interrupted: {
    caption: "Tap to continue or stop the interrupted trip",
    label: "RESUME?",
    buttonColor: "#d5832b",
    ringColor: "#f2dfc0",
  },
};

export default function RecordingControl({ onPress, status }: RecordingControlProps) {
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
            {
              backgroundColor: config.buttonColor,
            },
          ]}
        >
          <Text style={styles.buttonLabel}>{config.label}</Text>
        </View>
      </Pressable>
      <Text style={styles.caption}>{config.caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: 12,
  },
  outerRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  innerButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fffdf8",
    textAlign: "center",
  },
  caption: {
    fontSize: 13,
    fontWeight: "600",
    color: "#243224",
    textAlign: "center",
  },
});
