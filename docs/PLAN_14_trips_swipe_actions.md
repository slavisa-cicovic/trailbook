# PLAN 14: Trips Swipe Actions

## Goal

Replace the visible `Open / Edit / Delete / Resume` action buttons on trip cards with swipe actions while preserving reliable tap-to-open behavior.

## Why

- The trip list should feel lighter and less button-heavy.
- `Edit` is already available from the route screen, so it should not compete for space on the list.
- Swipe actions are a better place for list management actions than visible card buttons.
- Tap and swipe on the same card created an interaction conflict on iOS that needs a gesture guard, not removal of tap.

## Scope

This plan includes:

- removing the visible action button row from trip cards
- adding swipe actions for trip management
- supporting different swipe actions for active vs ended trips
- restoring tap-to-open with gesture suppression so swipe does not trigger open

This plan does not include:

- bulk edit / bulk delete
- drag and drop ordering
- redesign of the trip details flow

## Target Behavior

- Tapping a trip card opens the route.
- Swiping a trip card reveals secondary actions.
- Ended trips expose:
  - `Open`
  - `Delete`
- Active trips expose:
  - `Open`
  - `Resume`

## Interaction Model

- Primary list interactions:
  - tap card -> open route
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
- Restore tap-to-open on the card body.
- Add a short swipe suppression guard so a swipe gesture does not fall through as a tap.

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
- Tapping a trip card opens the route.
- Swiping reveals the expected actions.
- Ended trips show `Open` and `Delete`.
- Active trips show `Open` and `Resume`.
- `npm run typecheck --workspace mobile` passes.
