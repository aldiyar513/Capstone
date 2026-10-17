# Sprint 1 Backlog

**Deadline:** November 7, 2026  
**Goal:** Enable users to upload, review, and comment on their personal practice recordings.

## 1. Implement account access

- [ ] User can sign up with email and password.
- [ ] User can log in and log out.
- [ ] Protected pages require authentication.
- [ ] Invalid credentials and missing fields show clear error messages.

## 2. Create and list personal pieces

- [ ] User can create a piece/exercise with a name.
- [ ] Empty names are rejected.
- [ ] Saved pieces appear in the personal workspace after refreshing.
- [ ] User can open a piece to view its recordings.
- [ ] Users can access only their own pieces.

## 3. Upload audio recordings

- [ ] User can select an audio file and name the recording.
- [ ] The recording is associated with the selected piece.
- [ ] Audio is stored privately, with metadata saved in the database.
- [ ] Upload progress, success, and failure are visible.
- [ ] Unsupported files and files exceeding the size limit are rejected.

## 4. Play saved recordings

- [ ] User can open and play a saved recording.
- [ ] Player supports pause and seeking.
- [ ] Current playback time and total duration are visible.
- [ ] Loading and playback failures display clear messages.
- [ ] User can navigate back to the piece.

## 5. Add and edit timestamped comments

- [ ] User can write a comment at the current playback position.
- [ ] The timestamp is visible before saving.
- [ ] Comments remain saved after refreshing.
- [ ] Comments appear in timestamp order.
- [ ] User can edit comment text and save or cancel changes.
- [ ] Clicking a comment’s timestamp seeks to that moment.
- [ ] Failed saves preserve the entered text.
- [ ] Users can access and edit only their own comments.

## 6. Browse recording history

- [ ] Each piece lists its saved recordings.
- [ ] Each recording displays its name and upload date.
- [ ] User can reopen earlier recordings and their comments.
- [ ] Empty history provides a clear upload action.

## 7. Review frontend design coverage

- [ ] Check login and sign-up screens.
- [ ] Check personal workspace and create-piece dialog.
- [ ] Check piece page and recording history.
- [ ] Check upload dialog and progress states.
- [ ] Check recording player and comment interactions.
- [ ] Identify missing empty, loading, and error states.
- [ ] Record gaps in the relevant GitHub issues.

## 8. Check accessibility and responsive layouts

- [ ] Main flow works at desktop and phone widths.
- [ ] Controls have clear labels and visible keyboard focus.
- [ ] Main actions are accessible using the keyboard.
- [ ] Text is readable and has sufficient contrast.
- [ ] Status information does not rely on color alone.

## 9. Deploy and verify the complete flow

- [ ] Frontend and backend are deployed.
- [ ] Credentials and secrets are stored in environment variables.
- [ ] Sign-up, piece creation, upload, playback, and comments work on the deployed app.
- [ ] Data persists after refreshing and logging back in.
- [ ] Two-account testing confirms private content cannot be accessed by another user.

## 10. Conduct usability testing and document the sprint

- [ ] Conduct the design walkthrough and record findings.
- [ ] Conduct the working-app walkthrough and record findings.
- [ ] Prioritize and fix major usability problems.
- [ ] Maintain GitHub issues, meaningful pull requests, and progress notes.
- [ ] Complete the README and sprint summary.
- [ ] Record a demonstration and tag the sprint release.

## Outside Sprint 1

Shared workspaces, teacher assignments, video, looping, waveforms, recording comparison, reminders, and automated musical assessment.
