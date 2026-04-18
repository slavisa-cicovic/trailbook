"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";

type Coordinate = {
  latitude: number;
  longitude: number;
};

interface TripRoutePreviewProps {
  points: Coordinate[];
  waypoints: Coordinate[];
}

type GoogleWindow = Window & {
  __trailbookGoogleMapsPromise?: Promise<unknown>;
  google?: {
    maps: any;
  };
};

function loadGoogleMaps() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return Promise.reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."));
  }

  const googleWindow = window as GoogleWindow;

  if (googleWindow.google?.maps) {
    return Promise.resolve(googleWindow.google.maps);
  }

  if (googleWindow.__trailbookGoogleMapsPromise) {
    return googleWindow.__trailbookGoogleMapsPromise;
  }

  googleWindow.__trailbookGoogleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-trailbook-google-maps="true"]');

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(googleWindow.google?.maps));
      existingScript.addEventListener("error", () => reject(new Error("Unable to load Google Maps script.")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.dataset.trailbookGoogleMaps = "true";
    script.onload = () => resolve(googleWindow.google?.maps);
    script.onerror = () => reject(new Error("Unable to load Google Maps script."));
    document.head.appendChild(script);
  });

  return googleWindow.__trailbookGoogleMapsPromise;
}

export function TripRoutePreview({ points, waypoints }: TripRoutePreviewProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

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
        if (disposed || !mapRef.current) {
          return;
        }

        const center =
          points[0] ??
          waypoints[0] ?? {
            latitude: 44.7866,
            longitude: 20.4489,
          };

        const map = new mapsApi.Map(mapRef.current, {
          center: { lat: center.latitude, lng: center.longitude },
          disableDefaultUI: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          zoom: 13,
        });

        const bounds = new mapsApi.LatLngBounds();

        for (const point of points) {
          bounds.extend({ lat: point.latitude, lng: point.longitude });
        }

        for (const waypoint of waypoints) {
          bounds.extend({ lat: waypoint.latitude, lng: waypoint.longitude });
          new mapsApi.Marker({
            map,
            position: { lat: waypoint.latitude, lng: waypoint.longitude },
          });
        }

        if (points.length > 0) {
          new mapsApi.Polyline({
            map,
            path: points.map((point) => ({ lat: point.latitude, lng: point.longitude })),
            geodesic: true,
            strokeColor: "#275f3b",
            strokeOpacity: 1,
            strokeWeight: 4,
          });
        }

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 40);
        }

        if (points.length + waypoints.length === 1) {
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
  }, [points, waypoints]);

  if (points.length === 0 && waypoints.length === 0) {
    return (
      <Box
        sx={{
          alignItems: "center",
          bgcolor: "#f6f1e7",
          borderRadius: 3,
          display: "flex",
          justifyContent: "center",
          minHeight: 320,
        }}
      >
        <Typography color="text.secondary">This trip has no route points yet.</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        bgcolor: "#f6f1e7",
        borderRadius: 3,
        overflow: "hidden",
        p: 1,
      }}
    >
      <Box
        ref={mapRef}
        sx={{
          borderRadius: 2,
          minHeight: 600,
          width: "100%",
        }}
      />

      <Stack direction="row" justifyContent="space-between" sx={{ px: 1, pb: 1, pt: 1 }}>
        <Typography color="text.secondary" variant="body2">
          {status === "loading" ? "Loading map..." : "Route map"}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {waypoints.length} waypoint{waypoints.length === 1 ? "" : "s"}
        </Typography>
      </Stack>

      {status === "error" ? (
        <Typography color="error" sx={{ px: 1, pb: 1 }} variant="body2">
          {errorMessage || "Unable to load the trip map."}
        </Typography>
      ) : null}
    </Box>
  );
}
