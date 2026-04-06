# PLAN 14: Trips Swipe Actions

## Goal

Replace the visible `Open / Edit / Delete / Resume` action buttons on trip cards with swipe actions and remove the tap-versus-swipe interaction conflict.

## Why

- The trip list should feel lighter and less button-heavy.
- `Edit` is already available from the route screen, so it should not compete for space on the list.
- Swipe actions are a better place for list management actions than visible card buttons.
- Tap and swipe on the same card created an interaction conflict on iOS.

## Scope

This plan includes:

- removing the visible action button row from trip cards
- removing tap-to-open from the list card itself
- adding swipe actions for trip management
- supporting different swipe actions for active vs ended trips

This plan does not include:

- bulk edit / bulk delete
- drag and drop ordering
- redesign of the trip details flow

## Target Behavior

- Swiping a trip card reveals secondary actions.
- Ended trips expose:
  - `Open`
  - `Delete`
- Active trips expose:
  - `Open`
  - `Resume`

## Interaction Model

- Primary list interaction:
  - swipe left on card -> reveal actions
- Route metadata editing stays on the route screen, not on the trip list card

## Implementation Steps

### Phase 1: Swipe Container Choice

- Introduce a stable swipe row implementation for React Native list items.
- Keep the scope narrow to trip cards only.
- Prefer a proven gesture-based list row pattern over a custom ad hoc pan implementation.

### Phase 2: Card Refactor

- Remove the visible `cardActions` row from `TripsScreen`.
- Wrap each trip card in a swipeable container.
- Keep the current visual card body, but remove tap-to-open from the card itself to avoid gesture conflicts.

### Phase 3: Action Mapping

- Ended trip:
  - `Open`
  - `Delete`
- Active trip:
  - `Open`
  - `Resume`

### Phase 4: UX Polish

- Make action labels clear and compact.
- Ensure the swipe action area works on both iOS and Android.
- Ensure swipe gestures do not break vertical scrolling.
- Remove duplicate sync state from the trip card body if the status is already visible in the card header.

## Validation

- Visible action buttons are removed.
- Swiping reveals the expected actions.
- Ended trips show `Open` and `Delete`.
- Active trips show `Open` and `Resume`.
- `npm run typecheck --workspace mobile` passes.
