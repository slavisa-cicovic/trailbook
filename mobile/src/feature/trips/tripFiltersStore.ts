import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DEFAULT_FILTERS, type Filters } from './tripFilters';

const TRIP_FILTERS_KEY = 'trailbook.tripFilters.v1';

interface TripFiltersState {
  filters: Filters;
  loaded: boolean;
}

interface TripFiltersActions {
  loadFilters(): Promise<void>;
  setFilters(filters: Filters): void;
}

function normalizeFilters(value: unknown): Filters {
  if (!value || typeof value !== 'object') return DEFAULT_FILTERS;
  const candidate = value as Partial<Filters>;
  return {
    search: typeof candidate.search === 'string' ? candidate.search : DEFAULT_FILTERS.search,
    period:
      candidate.period === 'today' ||
      candidate.period === 'yesterday' ||
      candidate.period === 'last_week' ||
      candidate.period === 'all'
        ? candidate.period
        : DEFAULT_FILTERS.period,
    activities: Array.isArray(candidate.activities) ? candidate.activities : DEFAULT_FILTERS.activities,
    sort:
      candidate.sort === 'oldest' ||
      candidate.sort === 'distance' ||
      candidate.sort === 'duration' ||
      candidate.sort === 'newest'
        ? candidate.sort
        : DEFAULT_FILTERS.sort,
  };
}

export const useTripFiltersStore = create<TripFiltersState & TripFiltersActions>((set) => ({
  filters: DEFAULT_FILTERS,
  loaded: false,

  async loadFilters() {
    try {
      const stored = await AsyncStorage.getItem(TRIP_FILTERS_KEY);
      set({
        filters: stored ? normalizeFilters(JSON.parse(stored)) : DEFAULT_FILTERS,
        loaded: true,
      });
    } catch {
      set({ filters: DEFAULT_FILTERS, loaded: true });
    }
  },

  setFilters(filters) {
    set({ filters });
    AsyncStorage.setItem(TRIP_FILTERS_KEY, JSON.stringify(filters)).catch(() => undefined);
  },
}));
