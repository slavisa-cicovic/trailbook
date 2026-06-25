import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function SettingsDivider() {
  const { theme } = useAppTheme();

  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    marginLeft: 62,
  },
});
