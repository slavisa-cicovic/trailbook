PLAN 26: Segment Mode Editing On Route Screen

Goal
- Let the user correct an existing trip segment mode directly from the route screen.
- Keep the trip model canonical after edits, not just the UI summary.
- Merge adjacent segments automatically when they end up with the same mode after an edit.

Why
- Full automatic mode detection is useful later, but manual correction is lower risk and gives users direct control now.
- Real trips often contain a few segmentation mistakes that are easier to fix after recording than during recording.
- If the user changes one segment from `walk` to `drive`, the resulting trip summary and map should become cleaner immediately.

Scope
- Mobile only.
- Route screen only.
- Applies to owner trips, not shared trips.
- Supports changing a segment mode between the current supported recording modes:
  - `walk`
  - `bike`
  - `drive`
  - `boat`
  - `plane`

Out Of Scope
- Auto mode / automatic activity detection.
- Segment splitting by arbitrary point selection.
- Editing shared trip segments.
- Server sync conflict resolution for concurrent segment edits on multiple devices.

User Experience
- On the route screen `Segments` list, each segment row gets a small edit icon.
- Tapping the icon opens a lightweight modal/dialog with the available modes.
- After the user confirms the new mode:
  - the selected segment mode changes
  - adjacent segments with the same resulting mode are merged automatically
  - the `Segments` list refreshes immediately
  - trip mode summary on the route screen refreshes immediately
  - map segment coloring refreshes immediately

Expected Merge Behavior
- If only the selected segment changes and neither neighbor has the same mode:
  - keep the same segment boundaries, only update the mode
- If the previous segment has the same mode after the edit:
  - merge selected segment into previous segment
- If the next segment has the same mode after the edit:
  - merge selected segment into next segment
- If both previous and next segments have the same mode after the edit:
  - merge all three into one segment

Example
- Before:
  - `Walk 5 km`
  - `Drive 50 km`
- User changes `Walk` to `Drive`
- After:
  - `Drive 55 km`

Canonical Data Rules
- Segment editing must update the stored trip segment records, not just a derived summary.
- Segment merge must preserve trip ownership and trip linkage.
- Trip points must continue to belong to the correct resulting segment after merge.
- Waypoints must continue to belong to the correct resulting segment after merge.
- Attachments remain attached to their waypoint; they should not need direct changes if waypoint segment linkage is updated correctly.

Data Mutation Strategy
- Add a dedicated trip-segment editing service function:
  - `updateTripSegmentMode(...)`
- Add a merge-capable helper:
  - `mergeAdjacentTripSegments(...)`
- Preferred implementation flow:
  1. update the selected segment mode
  2. scan previous and next visible segments within the same trip
  3. if adjacent segments now share the same mode, merge them
  4. remap `segmentLocalId` on trip points that belonged to removed segments
  5. remap `segmentLocalId` on waypoints that belonged to removed segments
  6. remove merged-away segment records
  7. persist updated segments, trip points, and waypoints

Merge Invariants
- Never merge segments across different trips.
- Never merge deleted segments into visible segments.
- Keep the oldest surviving segment as the canonical merged segment record.
- The surviving segment should keep:
  - original `localId`
  - trip linkage
  - user linkage
- The surviving segment should update:
  - `recordingProfile`
  - `startedAt`
  - `endedAt`
  - `updatedAt`

Recalculation Rules
- Segment distance and duration should continue to be derived from the trip points assigned to the final segment structure.
- Route screen summary should not cache stale segment values after edit.
- Segment color blocks on the map should re-read the final segment structure after merge.

UI Details
- Add a small mode-edit icon to each segment row in the route screen `Segments` card.
- The dialog should show the current mode and a flat list of replacement modes.
- On save, close the dialog only after the local state is updated successfully.
- If the edit fails, keep the trip untouched and show an alert.

Validation
- Do not allow editing while the trip is still active, unless later explicitly supported.
- Do not allow editing if the target segment cannot be resolved from current trip data.
- Do not expose the edit control on shared trip screens.

Testing
- Unit-level logic coverage for:
  - mode change without merge
  - merge with previous
  - merge with next
  - merge with both previous and next
  - point reassignment after merge
  - waypoint reassignment after merge
- Mobile typecheck must pass.
- Manual verification:
  - edit a middle segment
  - confirm the summary changes
  - confirm map colors change
  - confirm waypoint details still open correctly after merge

Delivery Order
1. Add segment edit/merge helpers in trip segment service layer.
2. Update route screen UI with edit icon and mode selection dialog.
3. Wire persistence updates for segments, trip points, and waypoints.
4. Verify route summary and map rendering after merge.
5. Add tests for merge cases.

Future Follow-Up
- Add `Auto (beta)` mode suggestion later, but let user override inferred segments with this same segment editing flow.
