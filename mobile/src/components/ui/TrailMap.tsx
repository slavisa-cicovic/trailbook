import { forwardRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import type { MapViewProps, MapType } from 'react-native-maps';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';
import type { TranslationKey } from '@/i18n/translations';

const NIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
];

const MAP_TYPES: { label: TranslationKey; value: MapType }[] = [
  { label: 'map.standard', value: 'standard' },
  { label: 'map.satellite', value: 'satellite' },
  { label: 'map.hybrid', value: 'hybrid' },
];

type Props = Omit<MapViewProps, 'mapType' | 'provider' | 'customMapStyle' | 'userInterfaceStyle'> & {
  /** Where to position the map type switcher overlay. Default 'top-right'. */
  switcherPosition?: 'top-left' | 'top-right' | 'none';
  /** Controlled mapType. If omitted, the component manages it internally. */
  mapType?: MapType;
  onMapTypeChange?: (type: MapType) => void;
};

export const TrailMap = forwardRef<MapView, Props>(function TrailMap(
  { switcherPosition = 'top-right', mapType: controlledType, onMapTypeChange, style, children, ...rest },
  ref,
) {
  const { theme, resolvedMode } = useAppTheme();
  const { t } = useI18n();
  const [internalType, setInternalType] = useState<MapType>('standard');
  const activeType = controlledType ?? internalType;

  function handleTypeChange(t: MapType) {
    if (onMapTypeChange) onMapTypeChange(t);
    else setInternalType(t);
  }

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        mapType={activeType}
        customMapStyle={resolvedMode === 'night' ? NIGHT_MAP_STYLE : []}
        userInterfaceStyle={resolvedMode === 'night' ? 'dark' : 'light'}
        {...rest}
      >
        {children}
      </MapView>

      {switcherPosition !== 'none' && (
        <View
          style={[
            styles.switcher,
            switcherPosition === 'top-left' ? styles.switcherLeft : styles.switcherRight,
          ]}
          pointerEvents="box-none"
        >
          {MAP_TYPES.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.chip,
                { backgroundColor: activeType === option.value ? theme.accent : theme.card },
              ]}
              onPress={() => handleTypeChange(option.value)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: activeType === option.value ? theme.background : theme.primaryText },
                ]}
              >
                {t(option.label)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  switcher: { position: 'absolute', top: 14, flexDirection: 'row', gap: 8 },
  switcherLeft: { left: 14 },
  switcherRight: { right: 14 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
});
