# PLAN xx: Valhalla Map Matching

## Goal

Evaluate and potentially introduce self-hosted map matching with Valhalla to improve displayed and edited trip geometry after recording.

This is a placeholder plan.
It should receive a real plan number when implementation starts.

## Context

Recent trip investigations show a persistent platform gap:

- iOS usually provides dense and clean location traces
- Android, especially on some Samsung devices, often provides sparser and more bursty traces

Even after point-filter tuning, Android can still produce:

- long gaps between accepted points
- visible shortcuts
- geometry that is technically plausible but visually poor

This is a different problem from live sampling.
Map matching would not replace recording.
It would provide a second, derived geometry layer after the trip is recorded.

## Product Hypothesis

Valhalla could improve route presentation and editability by snapping recorded GPS traces to the road and path network.

This would be most useful for:

- driving
- cycling
- some walking trips on mapped paths

It would be less reliable for:

- off-road traces
- incomplete road/path coverage
- ferry, port, beach, or mixed-mode trips

## Product Decision Direction

If implemented, map matching should be additive.

Raw trip points must remain the source of truth.

Matched geometry should be stored and exposed as a derived artifact, not as a destructive rewrite of original trip points.

## Proposed Architecture

### 1. Keep raw GPS points

Persist raw trip points exactly as recorded today.

Do not overwrite them with matched geometry.

### 2. Add derived matched geometry

Generate a matched route from raw points using a server-side Valhalla instance.

Potential outputs:

- matched polyline / linestring
- confidence / quality metadata
- optional per-point match result metadata

### 3. Display policy

Support one of these display strategies:

- show raw geometry by default, matched as optional overlay
- show matched geometry when confidence is high, raw otherwise
- allow web trip edit/view to switch between raw and matched route

## Why Valhalla

Valhalla is attractive because:

- it can be self-hosted
- it supports map matching directly
- it supports multiple costing modes such as bicycle, pedestrian, and auto
- it avoids hard dependency on a paid third-party API for each request

## Candidate API Usage

Likely use the Valhalla map matching endpoints:

- `trace_route`
- `trace_attributes`

Likely inputs:

- recorded trip points
- travel mode / costing
- `gps_accuracy`
- timestamps when available

Likely matching mode:

- `shape_match: "map_snap"`

## Proposed Mode Mapping

Trailbook recording profiles would likely map to Valhalla costing roughly as:

- `walk` -> pedestrian
- `bike` -> bicycle
- `drive` -> auto

The following need special handling:

- `boat`
- `plane`
- `auto` with mixed or uncertain mode

For those, matching may need to be skipped or split by segment/profile.

## Scope Options

### Option A: Web-only matched display

Use matching only in web trip view/edit.

Pros:

- lowest risk
- easy to compare raw vs matched
- no mobile rollout complexity

### Option B: Server-side trip enrichment

Run matching after trip sync and persist matched geometry on the server.

Pros:

- one place to compute
- reusable by web and mobile

Cons:

- background processing and storage become more complex

### Option C: Manual repair action

Expose a user/admin action such as:

- `Generate matched route`
- `Repair route`

Pros:

- explicit
- easier to debug
- avoids automatic false positives

## Recommended First Slice

Start with:

- self-hosted Valhalla on local/server environment
- one server endpoint that accepts raw trip points and returns matched geometry
- use only for ended trips
- support only `walk`, `bike`, and `drive`
- add confidence / fallback behavior
- display matched route in web trip view as an optional overlay

## Non-goals

- Do not replace live trip point recording with Valhalla.
- Do not remove raw point storage.
- Do not auto-correct every trip without confidence checks.
- Do not attempt to match `boat` or `plane` in V1.
- Do not block trip sync on map matching.

## Open Questions

- Where should matched geometry be stored in the current data model?
- Should matching run automatically after sync or only on demand?
- Should we match the whole trip or per segment?
- How should we expose confidence / uncertainty in UI?
- What should happen when Valhalla returns discontinuities or low-confidence matches?
- Do we want to compare Valhalla against GraphHopper or Mapbox before implementation?

## Future Implementation Notes

When this plan is implemented:

- add a server integration layer for Valhalla
- define a matched-route persistence model
- keep raw and matched geometry separate
- add tests for route matching fallback behavior
- expose enough observability to compare raw vs matched output on real trips

