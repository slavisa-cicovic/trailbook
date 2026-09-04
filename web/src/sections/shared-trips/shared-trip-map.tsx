"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";

import { loadGoogleMaps } from "../trips/view/google-maps-loader";

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface RoutePoint extends Coordinate {
  timestamp: string;
}

interface SharedWaypoint extends Coordinate {
  category: string;
  id: string;
  title: string;
  description?: string | null;
  images: Array<{ getUrl: string; imageId: string }>;
}

interface SharedSegment {
  endedAt: string;
  index: number;
  segmentType: string;
  startedAt: string;
}

interface SharedTripMapProps {
  activeSegmentIndex: number | null;
  onActiveSegmentIndexChange: (index: number | null) => void;
  points: RoutePoint[];
  segments: SharedSegment[];
  waypoints: SharedWaypoint[];
}

const SEGMENT_COLOR: Record<string, string> = {
  WALK: "#4caf50",
  BIKE: "#2196f3",
  DRIVE: "#ff9800",
  BOAT: "#009688",
  PLANE: "#9c27b0",
  STATIONARY: "#9e9e9e",
  UNKNOWN: "#e0e0e0",
};

interface StyledPolyline {
  setOptions(options: { strokeOpacity: number; strokeWeight: number; zIndex: number }): void;
}

export function SharedTripMap({
  activeSegmentIndex,
  onActiveSegmentIndexChange,
  points,
  segments,
  waypoints,
}: SharedTripMapProps) {
  const theme = useTheme();
  const darkMode = theme.palette.mode === "dark";
  const mapRef = useRef<HTMLDivElement | null>(null);
  const polylinesRef = useRef<Array<{ index: number; polyline: StyledPolyline }>>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const segmentKey = useMemo(
    () => segments.map((segment) => `${segment.segmentType}:${segment.startedAt}:${segment.endedAt}`).join("|"),
    [segments],
  );
  const waypointKey = useMemo(
    () => waypoints.map((waypoint) => `${waypoint.id}:${waypoint.images.length}`).join("|"),
    [waypoints],
  );

  useEffect(() => {
    if (!mapRef.current) return;

    if (points.length === 0 && waypoints.length === 0) {
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    let disposed = false;
    setStatus("loading");
    setErrorMessage(null);

    loadGoogleMaps()
      .then((mapsApi) => {
        if (disposed || !mapRef.current) return;

        const center = points[0] ?? waypoints[0] ?? { latitude: 44.7866, longitude: 20.4489 };
        const map = new mapsApi.Map(mapRef.current, {
          center: { lat: center.latitude, lng: center.longitude },
          disableDefaultUI: false,
          fullscreenControl: true,
          mapTypeControl: true,
          streetViewControl: false,
          zoom: 13,
        });
        const bounds = new mapsApi.LatLngBounds();
        const infoWindow = new mapsApi.InfoWindow();
        polylinesRef.current = [];

        for (const point of points) {
          bounds.extend({ lat: point.latitude, lng: point.longitude });
        }

        if (segments.length > 0) {
          for (const segment of segments) {
            const startedAt = Date.parse(segment.startedAt);
            const endedAt = Date.parse(segment.endedAt);
            const segmentPoints = points.filter((point) => {
              const timestamp = Date.parse(point.timestamp);
              return timestamp >= startedAt && timestamp <= endedAt;
            });

            if (segmentPoints.length < 2) continue;

            const polyline = new mapsApi.Polyline({
              geodesic: true,
              map,
              path: segmentPoints.map((point) => ({ lat: point.latitude, lng: point.longitude })),
              strokeColor: SEGMENT_COLOR[segment.segmentType] ?? SEGMENT_COLOR.UNKNOWN,
              strokeOpacity: 1,
              strokeWeight: 5,
              zIndex: 1,
            });
            polylinesRef.current.push({ index: segment.index, polyline });
            polyline.addListener("mouseover", () => onActiveSegmentIndexChange(segment.index));
            polyline.addListener("mouseout", () => onActiveSegmentIndexChange(null));
          }
        } else if (points.length > 0) {
          new mapsApi.Polyline({
            geodesic: true,
            map,
            path: points.map((point) => ({ lat: point.latitude, lng: point.longitude })),
            strokeColor: SEGMENT_COLOR.UNKNOWN,
            strokeOpacity: 1,
            strokeWeight: 5,
          });
        }

        for (const waypoint of waypoints) {
          const position = { lat: waypoint.latitude, lng: waypoint.longitude };
          bounds.extend(position);
          const marker = new mapsApi.Marker({
            icon: waypointMarkerIcon(waypoint.category),
            map,
            position,
            title: waypoint.title,
          });

          marker.addListener("click", () => {
            infoWindow.setContent(renderWaypointInfo(waypoint, darkMode));
            infoWindow.open({ anchor: marker, map });
          });
        }

        if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
        if (points.length + waypoints.length === 1) map.setZoom(15);

        setStatus("ready");
      })
      .catch((error) => {
        if (!disposed) {
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Unable to load map.");
        }
      });

    return () => {
      disposed = true;
      polylinesRef.current = [];
    };
  }, [darkMode, onActiveSegmentIndexChange, points, segmentKey, segments, waypointKey, waypoints]);

  useEffect(() => {
    for (const { index, polyline } of polylinesRef.current) {
      polyline.setOptions({
        strokeOpacity: activeSegmentIndex === null || activeSegmentIndex === index ? 1 : 0.42,
        strokeWeight: activeSegmentIndex === index ? 9 : 5,
        zIndex: activeSegmentIndex === index ? 2 : 1,
      });
    }
  }, [activeSegmentIndex]);

  if (points.length === 0 && waypoints.length === 0) {
    return (
      <Box sx={{ alignItems: "center", bgcolor: "background.paper", borderRadius: 4, display: "flex", justifyContent: "center", minHeight: 420 }}>
        <Typography color="text.secondary">This shared trip has no route points yet.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: "background.paper", borderRadius: 4, overflow: "hidden", p: 1 }}>
      <Box ref={mapRef} sx={{ borderRadius: 3, height: { xs: 440, md: 680 }, width: "100%" }} />
      <Stack direction="row" justifyContent="space-between" sx={{ px: 1, py: 1 }}>
        <Typography color="text.secondary" variant="body2">
          {status === "loading" ? "Loading interactive map..." : "Interactive route map"}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {waypoints.length} waypoint{waypoints.length === 1 ? "" : "s"}
        </Typography>
      </Stack>
      {status === "error" ? (
        <Typography color="error" sx={{ px: 1, pb: 1 }} variant="body2">
          {errorMessage || "Unable to load map."}
        </Typography>
      ) : null}
    </Box>
  );
}

const WAYPOINT_SYMBOL: Record<string, string> = {
  GENERIC: "●",
  DEPARTURE: "⚑",
  FUEL: "⛽",
  BORDER: "◇",
  PORT: "⚓",
  FERRY: "⛴",
  RESTAURANT: "◆",
  CAFE: "☕",
  VIEWPOINT: "▲",
  MONUMENT: "▥",
  BEACH: "≈",
};

function waypointMarkerIcon(category: string) {
  const symbol = WAYPOINT_SYMBOL[category.toUpperCase()] ?? WAYPOINT_SYMBOL.GENERIC;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52"><path fill="#633b1e" stroke="#fff" stroke-width="2" d="M22 1C10.4 1 1 10.4 1 22c0 15.4 21 29 21 29s21-13.6 21-29C43 10.4 33.6 1 22 1z"/><circle cx="22" cy="21" r="14" fill="#fff"/><text x="22" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#633b1e">${symbol}</text></svg>`;
  return {
    anchor: { x: 22, y: 51 },
    scaledSize: { width: 44, height: 52 },
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
  };
}

function renderWaypointInfo(waypoint: SharedWaypoint, darkMode: boolean) {
  const photos = waypoint.images.slice(0, 4);
  const secondaryColor = darkMode ? "#cbd8c7" : "#5f574d";
  return `
    <div style="max-width: 260px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <strong style="display:block; font-size:15px; margin-bottom:4px;">${escapeHtml(waypoint.title)}</strong>
      ${
        waypoint.description
          ? `<div style="color:${secondaryColor}; font-size:13px; margin-bottom:8px;">${escapeHtml(waypoint.description)}</div>`
          : ""
      }
      ${
        photos.length > 0
          ? `<div style="display:grid; grid-template-columns: repeat(${Math.min(photos.length, 2)}, 1fr); gap:6px;">
              ${photos.map((photo) => `<img src="${escapeHtml(photo.getUrl)}" alt="${escapeHtml(waypoint.title)}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px;" />`).join("")}
            </div>`
          : `<div style="color:${secondaryColor}; font-size:12px;">No photos</div>`
      }
    </div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
