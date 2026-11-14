import { useEffect, useId, useState } from "react";
import { supabase } from "./lib/supabaseClient";

function formatTimestamp(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function passageDescription(passage) {
  return `${passage.label} · ${formatTimestamp(
    passage.start_ms
  )}–${formatTimestamp(passage.end_ms)}`;
}

function sortComments(items) {
  return [...items].sort(
    (a, b) =>
      a.timestamp_ms - b.timestamp_ms ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)
  );
}

async function commentsRequest(url, options = {}) {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;
  if (!data.session) throw new Error("Please log in first.");

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || "Comment request failed.");
  }

  if (!result) {
    throw new Error("The server returned an unexpected response.");
  }

  return result;
}

function TargetSelector({
  id,
  value,
  onChange,
  timestamp,
  passages,
  disabled,
}) {
  const missing = value && !passages.some((item) => item.id === value);

  return (
    <div className="comment-target-field">
      <label htmlFor={id}>Comment on</label>

      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">
          Timestamp · {formatTimestamp(timestamp)}
        </option>

        {missing && (
          <option value={value} disabled>
            Passage no longer available
          </option>
        )}

        {passages.map((passage) => (
          <option key={passage.id} value={passage.id}>
            {passageDescription(passage)}
          </option>
        ))}
      </select>

      {missing && (
        <p role="alert">
          Choose another passage or use the timestamp.
        </p>
      )}
    </div>
  );
}

export default function Comments({
  recordingId,
  captureTimestamp,
  onSeek,
  passagesRevision = 0,
}) {
  const inputId = useId();

  const [comments, setComments] = useState([]);
  const [passages, setPassages] = useState([]);
  const [timestamp, setTimestamp] = useState(null);
  const [passageId, setPassageId] = useState("");
  const [body, setBody] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [editPassageId, setEditPassageId] = useState("");
  const [editTimestamp, setEditTimestamp] = useState(0);
  const [expanded, setExpanded] = useState(true);

  const url = `/api/v1/recordings/${recordingId}/comments`;

  useEffect(() => {
    // Wait for a save to finish before refreshing server data.
    if (saving) return;

    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setLoadError("");

      try {
        const [commentResult, passageResult] = await Promise.all([
          commentsRequest(url, {
            signal: controller.signal,
          }),
          commentsRequest(
            `/api/v1/recordings/${recordingId}/passages`,
            { signal: controller.signal }
          ),
        ]);

        if (controller.signal.aborted) return;

        if (
          !Array.isArray(commentResult.items) ||
          !Array.isArray(passageResult.items)
        ) {
          throw new Error("The server returned an unexpected response.");
        }

        setComments(sortComments(commentResult.items));
        setPassages(passageResult.items);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error.message || "Could not load comments.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => controller.abort();
  }, [url, recordingId, passagesRevision, refresh, saving]);

  const unavailable = saving || loading || Boolean(loadError);

  function targetExists(id) {
    return !id || passages.some((passage) => passage.id === id);
  }

  function startComment() {
    const position = captureTimestamp();

    if (position === null) {
      setError("Wait for the audio to load first.");
      return;
    }

    setError("");
    setNotice("");
    setExpanded(true);
    setTimestamp(position);
    setPassageId("");
  }

  function cancelComment() {
    setTimestamp(null);
    setPassageId("");
    setBody("");
    setError("");
  }

  async function handleSave(event) {
    event.preventDefault();

    if (
      unavailable ||
      timestamp === null ||
      !body.trim() ||
      !targetExists(passageId)
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const comment = await commentsRequest(url, {
        method: "POST",
        body: JSON.stringify({
          body: body.trim(),
          timestamp_ms: timestamp,
          passage_id: passageId || null,
        }),
      });

      setComments((previous) =>
        sortComments([...previous, comment])
      );

      cancelComment();
      setNotice("Comment saved.");
    } catch (error) {
      setError(error.message || "Could not save the comment.");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(comment) {
    setExpanded(true);
    setEditingId(comment.id);
    setEditBody(comment.body);
    setEditPassageId(comment.passage_id || "");
    setEditTimestamp(comment.timestamp_ms);
    setError("");
    setNotice("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditBody("");
    setEditPassageId("");
    setError("");
  }

  async function handleEditSave(event) {
    event.preventDefault();

    if (
      unavailable ||
      editingId === null ||
      !editBody.trim() ||
      !targetExists(editPassageId)
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const updated = await commentsRequest(
        `/api/v1/comments/${editingId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            body: editBody.trim(),
            passage_id: editPassageId || null,
            timestamp_ms: editTimestamp,
          }),
        }
      );

      setComments((previous) =>
        sortComments(
          previous.map((comment) =>
            comment.id === updated.id ? updated : comment
          )
        )
      );

      cancelEditing();
      setNotice("Comment updated.");
    } catch (error) {
      setError(error.message || "Could not update the comment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="comments">
      <div className="comments-header">
        <h4 className="comments-heading">
          <button
            type="button"
            className="comments-toggle"
            aria-expanded={expanded}
            aria-controls={`${inputId}-list`}
            onClick={() => setExpanded((previous) => !previous)}
            disabled={editingId !== null}
          >
            <svg
              className="comments-chevron"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 5 7 7-7 7" />
            </svg>

            <span>Comments</span>

            {!loading && !loadError && (
              <span className="comments-count">
                {comments.length}
              </span>
            )}
          </button>
        </h4>

        <button
          className="comments-add"
          type="button"
          onClick={startComment}
          disabled={unavailable || editingId !== null || timestamp !== null}
        >
          + Add comment
        </button>
      </div>

      {timestamp !== null && (
        <form className="comments-form" onSubmit={handleSave}>
          <TargetSelector
            id={`${inputId}-target`}
            value={passageId}
            onChange={setPassageId}
            timestamp={timestamp}
            passages={passages}
            disabled={unavailable}
          />

          {!passageId && (
            <button
              className="comments-cancel"
              type="button"
              onClick={startComment}
              disabled={unavailable}
            >
              Use current playback time
            </button>
          )}

          <label htmlFor={`${inputId}-body`}>Comment</label>
          <textarea
            id={`${inputId}-body`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            disabled={saving}
            required
          />

          <div className="comments-actions">
            <button
              type="submit"
              disabled={
                unavailable || !body.trim() || !targetExists(passageId)
              }
            >
              {saving ? "Saving…" : "Save comment"}
            </button>

            <button
              className="comments-cancel"
              type="button"
              disabled={saving}
              onClick={cancelComment}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {loadError && (
        <div>
          <p role="alert">{loadError}</p>
          <button
            type="button"
            className="comments-cancel"
            onClick={() => setRefresh((previous) => previous + 1)}
            disabled={saving || loading}
          >
            Try again
          </button>
        </div>
      )}

      {loading && <p role="status">Loading comments…</p>}

      <div id={`${inputId}-list`} hidden={!expanded}>
        {comments.length > 0 ? (
          <ul className="comments-list">
            {comments.map((comment) => {
              const linked = Boolean(comment.passage_id);
              const timeLabel = linked
                ? `${formatTimestamp(
                    comment.passage_start_ms
                  )}–${formatTimestamp(comment.passage_end_ms)}`
                : formatTimestamp(comment.timestamp_ms);

              return (
                <li className="comment-row" key={comment.id}>
                  <button
                    className="comment-timestamp"
                    type="button"
                    aria-label={`Seek to ${timeLabel}`}
                    onClick={() => onSeek(comment.timestamp_ms)}
                  >
                    {timeLabel}
                  </button>

                  {editingId === comment.id ? (
                    <form
                      className="comments-form comment-edit-form"
                      onSubmit={handleEditSave}
                    >
                      <TargetSelector
                        id={`${inputId}-edit-target`}
                        value={editPassageId}
                        onChange={setEditPassageId}
                        timestamp={editTimestamp}
                        passages={passages}
                        disabled={unavailable}
                      />

                      <label htmlFor={`${inputId}-edit-body`}>
                        Edit comment
                      </label>

                      <textarea
                        id={`${inputId}-edit-body`}
                        value={editBody}
                        onChange={(event) =>
                          setEditBody(event.target.value)
                        }
                        maxLength={5000}
                        disabled={saving}
                        required
                      />

                      <div className="comments-actions">
                        <button
                          type="submit"
                          disabled={
                            unavailable ||
                            !editBody.trim() ||
                            !targetExists(editPassageId)
                          }
                        >
                          {saving ? "Saving…" : "Save changes"}
                        </button>

                        <button
                          className="comments-cancel"
                          type="button"
                          onClick={cancelEditing}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="comment-content">
                        {linked && (
                          <p className="comment-passage-label">
                            {comment.passage_label}
                          </p>
                        )}

                        <p className="comment-body">{comment.body}</p>
                      </div>

                      <button
                        className="comment-edit"
                        type="button"
                        aria-label={`Edit comment at ${timeLabel}`}
                        onClick={() => startEditing(comment)}
                        disabled={
                          unavailable ||
                          editingId !== null ||
                          timestamp !== null
                        }
                      >
                        Edit
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          !loading && !loadError && <p>No comments yet.</p>
        )}
      </div>
    </section>
  );
}