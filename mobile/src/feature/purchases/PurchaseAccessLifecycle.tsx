import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuthStore } from '@/feature/auth/authStore';

import { usePurchaseStore } from './purchaseStore';

const ACCESS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Keeps the local purchase cache synchronized with the authoritative backend.
 * A failed refresh deliberately leaves the last verified cache untouched so a
 * temporary connection failure does not revoke valid offline access.
 */
export function PurchaseAccessLifecycle() {
  const authStatus = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.userId);
  const hydrateAccess = usePurchaseStore((state) => state.hydrateAccess);
  const refreshAccess = usePurchaseStore((state) => state.refreshAccess);
  const lastRefreshRequestedAt = useRef(0);

  useEffect(() => {
    let canceled = false;
    lastRefreshRequestedAt.current = 0;

    void hydrateAccess(userId).then(() => {
      if (canceled || authStatus !== 'authenticated') return;
      lastRefreshRequestedAt.current = Date.now();
      void refreshAccess({ silent: true });
    });

    return () => {
      canceled = true;
    };
  }, [authStatus, hydrateAccess, refreshAccess, userId]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    function refreshIfDue(nextState: AppStateStatus = AppState.currentState) {
      if (nextState !== 'active') return;
      const now = Date.now();
      if (now - lastRefreshRequestedAt.current < ACCESS_REFRESH_INTERVAL_MS) return;
      lastRefreshRequestedAt.current = now;
      void refreshAccess({ silent: true });
    }

    const appStateSubscription = AppState.addEventListener('change', refreshIfDue);
    const timer = setInterval(refreshIfDue, ACCESS_REFRESH_INTERVAL_MS);
    return () => {
      appStateSubscription.remove();
      clearInterval(timer);
    };
  }, [authStatus, refreshAccess]);

  return null;
}
