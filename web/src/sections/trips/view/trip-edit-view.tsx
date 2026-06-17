"use client";

import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  getCurrentUser,
  getTripDetail,
  isTripUserRole,
  saveTripEdit,
  type AuthUser,
} from "../../../lib/auth-api";
import type { UserTripDetail } from "../../../lib/auth-api";
import {
  buildDraftFromDetail,
  type DraftTripEdit,
  recomputeDraftSummary,
  removeDraftPointRange,
  smoothDraftRoute,
  updateDraftSegmentMode,
} from "./trip-edit-helpers";
import { TripEditMap } from "./trip-edit-map";

const PROFILE_OPTIONS: UserTripDetail["trip"]["recordingProfile"][] = ["walk", "bike", "drive", "boat", "plane", "stationary"];
const WAYPOINT_CATEGORY_OPTIONS: UserTripDetail["waypoints"][number]["category"][] = [
  "generic",
  "departure",
  "fuel",
  "border",
  "port",
  "ferry",
  "restaurant",
  "cafe",
  "viewpoint",
  "monument",
  "beach",
];

function formatDistanceKm(distanceMeters: number) {
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function formatProfile(value: UserTripDetail["trip"]["recordingProfile"]) {
  if (value === "stationary") {
    return "Pause";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card elevation={0} sx={{ border: "1px solid #e6ddcb", flex: 1 }}>
      <CardContent>
        <Stack spacing={1}>
          <Typography color="text.secondary" variant="body2">
            {label}
          </Typography>
          <Typography variant="h5">{value}</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

interface TripEditViewProps {
  tripId: string;
}

export function TripEditView({ tripId }: TripEditViewProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [initialDraft, setInitialDraft] = useState<DraftTripEdit | null>(null);
  const [draft, setDraft] = useState<DraftTripEdit | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTrimPicker, setActiveTrimPicker] = useState<"start" | "end" | null>(null);
  const [trimSelection, setTrimSelection] = useState<{ startIndex: number | null; endIndex: number | null }>({
    startIndex: null,
    endIndex: null,
  });

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.user) {
          router.replace("/login");
          setUser(null);
          return;
        }

        if (result.user.role === "admin") {
          router.replace("/dashboard");
          setUser(result.user);
          return;
        }

        setUser(result.user);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load current user.");
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!user || !isTripUserRole(user.role)) {
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setError(null);

    getTripDetail(tripId)
      .then((result) => {
        if (!cancelled) {
          const nextDraft = buildDraftFromDetail(result);
          setInitialDraft(nextDraft);
          setDraft(nextDraft);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load trip.");
          setInitialDraft(null);
          setDraft(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tripId, user]);

  const dirty = useMemo(() => {
    if (!initialDraft || !draft) {
      return false;
    }

    return JSON.stringify(initialDraft) !== JSON.stringify(draft);
  }, [draft, initialDraft]);

  function handlePickTrimPoint(index: number) {
    if (activeTrimPicker === "start") {
      setTrimSelection((current) => ({ ...current, startIndex: index }));
      setActiveTrimPicker(null);
    } else if (activeTrimPicker === "end") {
      setTrimSelection((current) => ({ ...current, endIndex: index }));
      setActiveTrimPicker(null);
    }
  }

  async function handleSave() {
    if (!draft) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const saved = await saveTripEdit(draft.trip.id, {
        trip: {
          title: draft.trip.title,
          description: draft.trip.description,
        },
        segments: draft.segments,
        points: draft.points,
        waypoints: draft.waypoints,
        pauses: draft.pauses,
      });

      const nextDraft = buildDraftFromDetail(saved);
      setInitialDraft(nextDraft);
      setDraft(nextDraft);
      setTrimSelection({ startIndex: null, endIndex: null });
      setActiveTrimPicker(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save trip edits.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || detailLoading) {
    return (
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={28} />
          <Typography color="text.secondary">Loading editor...</Typography>
        </Stack>
      </Paper>
    );
  }

  if (!user || !isTripUserRole(user.role)) {
    return (
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="h5">Redirecting...</Typography>
        </Stack>
      </Paper>
    );
  }

  if (!draft) {
    return (
      <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 4 }}>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="h5">Trip editor could not be loaded.</Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack alignItems={{ md: "center" }} direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
        <Stack spacing={1}>
          <Button component={Link} href={`/trips/${draft.trip.id}`} sx={{ alignSelf: "flex-start", px: 0 }} variant="text">
            Back to trip
          </Button>
          <Typography variant="h4">Edit trip</Typography>
          <Typography color="text.secondary">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1.5}>
          <Button
            disabled={!dirty || saving}
            onClick={() => {
              if (initialDraft) {
                setDraft(initialDraft);
                setTrimSelection({ startIndex: null, endIndex: null });
                setActiveTrimPicker(null);
              }
            }}
            variant="outlined"
          >
            Discard
          </Button>
          <Button disabled={!dirty || saving || draft.trip.title.trim().length === 0} onClick={handleSave} variant="contained">
            {saving ? "Saving..." : "Save"}
          </Button>
        </Stack>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Stack spacing={2}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <SummaryCard label="Distance" value={formatDistanceKm(draft.summary.distanceMeters)} />
          <SummaryCard label="Waypoints" value={`${draft.summary.waypointCount}`} />
          <SummaryCard label="Photos" value={`${draft.summary.photoCount}`} />
          <SummaryCard label="Segments" value={`${draft.summary.segmentCount}`} />
        </Stack>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: "minmax(0, 2.25fr) minmax(340px, 1fr)",
            alignItems: "start",
          }}
        >
          <TripEditMap
            activeTrimPicker={activeTrimPicker}
            draft={draft}
            onPickTrimPoint={handlePickTrimPoint}
            trimSelection={trimSelection}
          />

          <Stack spacing={2}>
            <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Details</Typography>
                <TextField
                  label="Title"
                  onChange={(event) => setDraft((current) => (current ? { ...current, trip: { ...current.trip, title: event.target.value } } : current))}
                  value={draft.trip.title}
                />
                <TextField
                  label="Description"
                  minRows={4}
                  multiline
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, trip: { ...current.trip, description: event.target.value } } : current))
                  }
                  value={draft.trip.description ?? ""}
                />
              </Stack>
            </Paper>

            <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Route tools</Typography>
                <Stack direction="row" spacing={1}>
                  <Button onClick={() => setDraft((current) => (current ? smoothDraftRoute(current) : current))} variant="outlined">
                    Smooth route
                  </Button>
                </Stack>
                <Divider />
                <Stack spacing={1.5}>
                  <Typography color="text.secondary" variant="body2">
                    Remove a bad route section by picking start and end points on the map.
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button onClick={() => setActiveTrimPicker("start")} variant={activeTrimPicker === "start" ? "contained" : "outlined"}>
                      Pick start
                    </Button>
                    <Button onClick={() => setActiveTrimPicker("end")} variant={activeTrimPicker === "end" ? "contained" : "outlined"}>
                      Pick end
                    </Button>
                  </Stack>
                  <Typography color="text.secondary" variant="body2">
                    Start: {trimSelection.startIndex ?? "—"} • End: {trimSelection.endIndex ?? "—"}
                  </Typography>
                  <Button
                    disabled={trimSelection.startIndex === null || trimSelection.endIndex === null}
                    onClick={() => {
                      setDraft((current) =>
                        current && trimSelection.startIndex !== null && trimSelection.endIndex !== null
                          ? removeDraftPointRange(current, trimSelection.startIndex, trimSelection.endIndex)
                          : current,
                      );
                      setTrimSelection({ startIndex: null, endIndex: null });
                      setActiveTrimPicker(null);
                    }}
                    variant="outlined"
                  >
                    Remove selected section
                  </Button>
                </Stack>
              </Stack>
            </Paper>

            <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Segments</Typography>
                {draft.segments.map((segment) => (
                  <Stack key={segment.localId} spacing={1.5}>
                    <Typography variant="body2">
                      {segment.startedAt.slice(0, 10)} • {formatDistanceKm(segment.distanceMeters)}
                    </Typography>
                    <TextField
                      label="Mode"
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? updateDraftSegmentMode(
                                current,
                                segment.localId,
                                event.target.value as UserTripDetail["trip"]["recordingProfile"],
                              )
                            : current,
                        )
                      }
                      select
                      value={segment.recordingProfile}
                    >
                      {PROFILE_OPTIONS.map((profile) => (
                        <MenuItem key={profile} value={profile}>
                          {formatProfile(profile)}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Divider />
                  </Stack>
                ))}
              </Stack>
            </Paper>

            <Paper elevation={0} sx={{ border: "1px solid #e6ddcb", p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Waypoints</Typography>
                {draft.waypoints.length > 0 ? (
                  draft.waypoints.map((waypoint, waypointIndex) => (
                    <Stack key={waypoint.localId} spacing={1.5}>
                      <TextField
                        label="Title"
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? recomputeDraftSummary({
                                  ...current,
                                  waypoints: current.waypoints.map((entry, index) =>
                                    index === waypointIndex ? { ...entry, title: event.target.value } : entry,
                                  ),
                                })
                              : current,
                          )
                        }
                        value={waypoint.title}
                      />
                      <TextField
                        label="Category"
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  waypoints: current.waypoints.map((entry, index) =>
                                    index === waypointIndex
                                      ? {
                                          ...entry,
                                          category: event.target.value as UserTripDetail["waypoints"][number]["category"],
                                        }
                                      : entry,
                                  ),
                                }
                              : current,
                          )
                        }
                        select
                        value={waypoint.category}
                      >
                        {WAYPOINT_CATEGORY_OPTIONS.map((category) => (
                          <MenuItem key={category} value={category}>
                            {category}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        label="Note"
                        minRows={3}
                        multiline
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  waypoints: current.waypoints.map((entry, index) =>
                                    index === waypointIndex ? { ...entry, note: event.target.value } : entry,
                                  ),
                                }
                              : current,
                          )
                        }
                        value={waypoint.note ?? ""}
                      />
                      <Divider />
                    </Stack>
                  ))
                ) : (
                  <Typography color="text.secondary">This trip has no waypoints.</Typography>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
}
