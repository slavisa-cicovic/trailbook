"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";

import type { DraftTripEdit } from "./trip-edit-helpers";
import { getRecordingProfileColor } from "./trip-edit-helpers";
import { loadGoogleMaps } from "./google-maps-loader";

interface TripEditMapProps {
  draft: DraftTripEdit;
  activeTrimPicker: "start" | "end" | null;
  trimSelection: { startIndex: number | null; endIndex: number | null };
  onPickTrimPoint: (index: number) => void;
}

function findNearestPointIndex(
  points: DraftTripEdit["points"],
  target: { latitude: number; longitude: number },
) {
  if (points.length === 0) {
    return -1;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const distance =
      (point.latitude - target.latitude) * (point.latitude - target.latitude) +
      (point.longitude - target.longitude) * (point.longitude - target.longitude);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestIndex;
}

export function TripEditMap({ draft, activeTrimPicker, trimSelection, onPickTrimPoint }: TripEditMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    if (draft.points.length === 0 && draft.waypoints.length === 0) {
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    let disposed = false;
    setStatus("loading");
    setErrorMessage(null);

    loadGoogleMaps()
      .then((mapsApi) => {
        if (disposed || !mapRef.current) {
          return;
        }

        const center = draft.points[0] ?? draft.waypoints[0] ?? { latitude: 44.7866, longitude: 20.4489 };
        const map = new mapsApi.Map(mapRef.current, {
          center: { lat: center.latitude, lng: center.longitude },
          disableDefaultUI: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          zoom: 13,
        });
        const bounds = new mapsApi.LatLngBounds();

        for (const point of draft.points) {
          bounds.extend({ lat: point.latitude, lng: point.longitude });
        }

        for (const segment of draft.segments) {
          const segmentPoints = draft.points
            .filter((point) => point.segmentLocalId === segment.localId)
            .map((point) => ({ lat: point.latitude, lng: point.longitude }));

          if (segmentPoints.length > 1) {
            new mapsApi.Polyline({
              map,
              path: segmentPoints,
              geodesic: true,
              strokeColor: getRecordingProfileColor(segment.recordingProfile),
              strokeOpacity: 1,
              strokeWeight: 4,
            });
          }
        }

        for (const waypoint of draft.waypoints) {
          bounds.extend({ lat: waypoint.latitude, lng: waypoint.longitude });
          new mapsApi.Marker({
            map,
            position: { lat: waypoint.latitude, lng: waypoint.longitude },
          });
        }

        if (trimSelection.startIndex !== null && draft.points[trimSelection.startIndex]) {
          const point = draft.points[trimSelection.startIndex]!;
          new mapsApi.Marker({
            map,
            position: { lat: point.latitude, lng: point.longitude },
            label: "A",
          });
        }

        if (trimSelection.endIndex !== null && draft.points[trimSelection.endIndex]) {
          const point = draft.points[trimSelection.endIndex]!;
          new mapsApi.Marker({
            map,
            position: { lat: point.latitude, lng: point.longitude },
            label: "B",
          });
        }

        if (activeTrimPicker) {
          map.addListener("click", (event: any) => {
            const latLng = event.latLng;

            if (!latLng) {
              return;
            }

            const index = findNearestPointIndex(draft.points, {
              latitude: latLng.lat(),
              longitude: latLng.lng(),
            });

            if (index >= 0) {
              onPickTrimPoint(index);
            }
          });
        }

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 40);
        }

        if (draft.points.length + draft.waypoints.length === 1) {
          map.setZoom(15);
        }

        setStatus("ready");
      })
      .catch((error) => {
        if (!disposed) {
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Unable to load the trip map.");
        }
      });

    return () => {
      disposed = true;
    };
  }, [activeTrimPicker, draft, onPickTrimPoint, trimSelection.endIndex, trimSelection.startIndex]);

  return (
    <Box sx={{ bgcolor: "#f6f1e7", borderRadius: 3, overflow: "hidden", p: 1 }}>
      <Box ref={mapRef} sx={{ borderRadius: 2, minHeight: 720, width: "100%" }} />
      <Stack direction="row" justifyContent="space-between" sx={{ px: 1, pb: 1, pt: 1 }}>
        <Typography color="text.secondary" variant="body2">
          {status === "loading"
            ? "Loading editor map..."
            : activeTrimPicker
              ? `Pick ${activeTrimPicker} trim point on the map`
              : "Editor map"}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {draft.points.length} points • {draft.waypoints.length} waypoints
        </Typography>
      </Stack>
      {status === "error" ? (
        <Typography color="error" sx={{ px: 1, pb: 1 }} variant="body2">
          {errorMessage || "Unable to load the editor map."}
        </Typography>
      ) : null}
    </Box>
  );
}
