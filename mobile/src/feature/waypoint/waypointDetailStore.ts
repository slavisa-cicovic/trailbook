import { create } from 'zustand';
import type { Waypoint, WaypointImage } from '@/core/domain/model/waypoint';
import type { DisplayRoutePoint } from '@/core/domain/model/displayRoutePoint';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import * as displayRoutePointDao from '@/core/data/local/displayRoutePointDao';

interface WaypointDetailState {
  waypoint: Waypoint | null;
  images: WaypointImage[];
  routePoints: DisplayRoutePoint[];
  prevId: string | null;
  nextId: string | null;
  loading: boolean;
  error: string | null;
}

interface WaypointDetailActions {
  load(waypointId: string): Promise<void>;
  reload(): Promise<void>;
  reset(): void;
}

export const useWaypointDetailStore = create<WaypointDetailState & WaypointDetailActions>((set, get) => ({
  waypoint: null,
  images: [],
  routePoints: [],
  prevId: null,
  nextId: null,
  loading: false,
  error: null,

  async load(waypointId) {
    set({ loading: true, error: null });
    try {
      const waypoint = await waypointDao.getById(waypointId);
      if (!waypoint) { set({ loading: false, error: 'Waypoint not found' }); return; }

      const [images, siblings, routePoints] = await Promise.all([
        waypointImageDao.getForWaypoint(waypointId),
        waypointDao.getForTrip(waypoint.tripId),
        displayRoutePointDao.getForTrip(waypoint.tripId),
      ]);

      const sorted = siblings.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const idx = sorted.findIndex((w) => w.id === waypointId);
      const prevId = idx > 0 ? sorted[idx - 1].id : null;
      const nextId = idx < sorted.length - 1 ? sorted[idx + 1].id : null;

      set({ waypoint, images, routePoints, prevId, nextId, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  async reload() {
    const id = get().waypoint?.id;
    if (id) await get().load(id);
  },

  reset() {
    set({ waypoint: null, images: [], routePoints: [], prevId: null, nextId: null, error: null });
  },
}));
