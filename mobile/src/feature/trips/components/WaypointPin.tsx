import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { CATEGORY_ICON } from '@/constants/waypointCategories';
import type { WaypointCategory } from '@/core/domain/model/waypoint';

export function WaypointPin({ category }: { category: WaypointCategory }) {
  return (
    <View style={styles.circle}>
      <MaterialIcons name={CATEGORY_ICON[category]} size={18} color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    backgroundColor: '#5c3d1e',
    borderRadius: 18,
    elevation: 4,
    height: 36,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    width: 36,
  },
});
