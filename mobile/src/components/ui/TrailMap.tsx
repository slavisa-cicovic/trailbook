import { forwardRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import type { MapViewProps, MapType } from 'react-native-maps';
import { useAppTheme } from '@/hooks/useAppTheme';

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

const MAP_TYPES: { label: string; value: MapType }[] = [
  { label: 'Map', value: 'standard' },
  { label: 'Satellite', value: 'satellite' },
  { label: 'Hybrid', value: 'hybrid' },
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
  const [internalType, setInternalType] = useState<MapType>('standard');
  const activeType = controlledType ?? internalType;
  const canRenderMap =
    Platform.OS !== 'android' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.expoConfig?.extra?.hasGoogleMapsApiKey === true;

  function handleTypeChange(t: MapType) {
    if (onMapTypeChange) onMapTypeChange(t);
    else setInternalType(t);
  }

  return (
    <View style={[styles.container, style]}>
      {canRenderMap ? (
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
      ) : (
        <View style={[styles.unavailable, { backgroundColor: theme.accentMuted }]}>
          <Text style={[styles.unavailableTitle, { color: theme.primaryText }]}>Map unavailable</Text>
          <Text style={[styles.unavailableText, { color: theme.mutedText }]}>Android map configuration is missing.</Text>
        </View>
      )}

      {canRenderMap && switcherPosition !== 'none' && (
        <View
          style={[
            styles.switcher,
            switcherPosition === 'top-left' ? styles.switcherLeft : styles.switcherRight,
          ]}
          pointerEvents="box-none"
        >
          {MAP_TYPES.map((t) => (
            <Pressable
              key={t.value}
              style={[
                styles.chip,
                { backgroundColor: activeType === t.value ? theme.accent : theme.card },
              ]}
              onPress={() => handleTypeChange(t.value)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: activeType === t.value ? theme.background : theme.primaryText },
                ]}
              >
                {t.label}
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
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  unavailableTitle: { fontSize: 18, fontWeight: '700' },
  unavailableText: { marginTop: 6, fontSize: 14, textAlign: 'center' },
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
