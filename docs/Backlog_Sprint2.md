# Sprint 2 Backlog

**Deadline:** December 12, 2026
**Goal:** Enable passage-based practice, recording comparison, and optional teacher feedback.

## 1. Apply the frontend design

- [ ] Apply the Figma colours, typography, spacing, and layouts.
- [ ] Keep the player and comments easy to access.
- [ ] Move supporting information into Details.
- [ ] Existing functionality continues to work.

## 2. Save and revisit passages

- [ ] User can select a passage with start and end times.
- [ ] Invalid boundaries are rejected.
- [ ] User can attach a note to a passage.
- [ ] Saved passages remain available after refreshing.
- [ ] Selecting a passage returns the player to that section.
- [ ] Existing timestamped comments continue to work.

## 3. Loop passages and adjust playback speed

- [ ] User can enable and disable passage looping.
- [ ] Playback repeats within the selected boundaries.
- [ ] User can adjust playback speed and restore normal speed.
- [ ] Switching recordings resets the active passage appropriately.

## 4. Organise attempts around practice goals

- [ ] User can create a practice goal within a piece.
- [ ] Multiple attempts can be linked to the same goal.
- [ ] Each attempt retains its own recording and passage boundaries.
- [ ] Related recordings and notes remain available across sessions.

## 5. Compare recordings

- [ ] User can open two attempts from the same piece together.
- [ ] Each recording has independently selected passage boundaries.
- [ ] User can play the corresponding passages in sequence.
- [ ] Only one recording plays at a time.
- [ ] Comparison works with recordings of different lengths and tempos.

## 6. Connect teacher and student accounts

- [ ] User can invite another account to connect.
- [ ] A connection requires acceptance.
- [ ] Users can view their connection status.
- [ ] Invalid invitations and duplicate requests are handled.
- [ ] Connecting does not automatically share recordings.

## 7. Share selected recordings

- [ ] Student can share a recording with a connected teacher.
- [ ] Teacher can open and play shared recordings.
- [ ] Unshared recordings and personal notes remain private.
- [ ] Student can see who has access and revoke sharing.
- [ ] Revocation blocks new access requests.
- [ ] Existing signed-link expiry behaviour is documented.

## 8. Add feedback and link later attempts

- [ ] Teacher can add timestamped or passage-based feedback.
- [ ] Teacher can edit their own feedback.
- [ ] Personal notes and teacher feedback are distinguishable.
- [ ] Student can link a later attempt to feedback.
- [ ] Sharing a later attempt requires an explicit action.
- [ ] Independent learners can use personal goals and linked attempts without a teacher.

## 9. Verify reliability, permissions, and accessibility

- [ ] Automated tests cover passage validation and access permissions.
- [ ] Separate accounts confirm that private content remains protected.
- [ ] Failed requests, expired playback links, and session expiry are handled.
- [ ] Failed saves preserve entered text where appropriate.
- [ ] Main actions work with keyboard navigation and visible focus.
- [ ] Layouts, labels, and contrast remain readable.
- [ ] The complete workflow passes regression testing.

## 10. Conduct user testing and document the sprint

- [ ] Prepare and conduct task-based user testing.
- [ ] Record findings and fix the main usability blockers.
- [ ] Update the README, database diagram, and API documentation.
- [ ] Link testing evidence and document remaining limitations.
- [ ] Complete the sprint report and demonstration videos.
- [ ] Tag the working release and submit by December 12.

## Outside Sprint 2

Automatic passage alignment, automated musical assessment,
AI-generated feedback, and public deployment.