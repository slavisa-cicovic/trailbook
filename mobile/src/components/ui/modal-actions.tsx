import { StyleSheet, View } from 'react-native';
import LoadingButton from './loading-button';

interface ModalActionsProps {
  primaryDisabled?: boolean;
  primaryLabel: string;
  primaryLoading?: boolean;
  primaryLoadingLabel?: string;
  secondaryDisabled?: boolean;
  secondaryLabel: string;
  onPrimaryPress: () => void;
  onSecondaryPress: () => void;
}

export default function ModalActions({
  onPrimaryPress,
  onSecondaryPress,
  primaryDisabled = false,
  primaryLabel,
  primaryLoading = false,
  primaryLoadingLabel,
  secondaryDisabled = false,
  secondaryLabel,
}: ModalActionsProps) {
  return (
    <View style={styles.actions}>
      <LoadingButton
        disabled={secondaryDisabled}
        onPress={onSecondaryPress}
        style={styles.button}
        variant="secondary"
      >
        {secondaryLabel}
      </LoadingButton>
      <LoadingButton
        disabled={primaryDisabled}
        loading={primaryLoading}
        loadingLabel={primaryLoadingLabel}
        onPress={onPrimaryPress}
        style={styles.button}
        variant="primary"
      >
        {primaryLabel}
      </LoadingButton>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  button: { flex: 1 },
});
