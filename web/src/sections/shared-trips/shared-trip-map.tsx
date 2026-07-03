"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";

import { loadGoogleMaps } from "../trips/view/google-maps-loader";

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface SharedWaypoint extends Coordinate {
  id: string;
  title: string;
  description?: string | null;
  images: Array<{ getUrl: string; imageId: string }>;
}

interface SharedTripMapProps {
  points: Coordinate[];
  waypoints: SharedWaypoint[];
}

export function SharedTripMap({ points, waypoints }: SharedTripMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

        for (const point of points) {
          bounds.extend({ lat: point.latitude, lng: point.longitude });
        }

        if (points.length > 0) {
          new mapsApi.Polyline({
            geodesic: true,
            map,
            path: points.map((point) => ({ lat: point.latitude, lng: point.longitude })),
            strokeColor: "#2f6b3f",
            strokeOpacity: 1,
            strokeWeight: 5,
          });
        }

        for (const waypoint of waypoints) {
          const position = { lat: waypoint.latitude, lng: waypoint.longitude };
          bounds.extend(position);
          const marker = new mapsApi.Marker({
            map,
            position,
            title: waypoint.title,
          });

          marker.addListener("click", () => {
            infoWindow.setContent(renderWaypointInfo(waypoint));
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
    };
  }, [points, waypointKey, waypoints]);

  if (points.length === 0 && waypoints.length === 0) {
    return (
      <Box sx={{ alignItems: "center", bgcolor: "#f2eadb", borderRadius: 4, display: "flex", justifyContent: "center", minHeight: 420 }}>
        <Typography color="text.secondary">This shared trip has no route points yet.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: "#f2eadb", borderRadius: 4, overflow: "hidden", p: 1 }}>
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

function renderWaypointInfo(waypoint: SharedWaypoint) {
  const photos = waypoint.images.slice(0, 4);
  return `
    <div style="max-width: 260px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <strong style="display:block; font-size:15px; margin-bottom:4px;">${escapeHtml(waypoint.title)}</strong>
      ${
        waypoint.description
          ? `<div style="color:#5f574d; font-size:13px; margin-bottom:8px;">${escapeHtml(waypoint.description)}</div>`
          : ""
      }
      ${
        photos.length > 0
          ? `<div style="display:grid; grid-template-columns: repeat(${Math.min(photos.length, 2)}, 1fr); gap:6px;">
              ${photos.map((photo) => `<img src="${escapeHtml(photo.getUrl)}" alt="${escapeHtml(waypoint.title)}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px;" />`).join("")}
            </div>`
          : `<div style="color:#83796c; font-size:12px;">No photos</div>`
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
