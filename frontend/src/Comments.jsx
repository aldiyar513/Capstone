import { useEffect, useId, useState } from "react";
import { supabase } from "./lib/supabaseClient";

function formatTimestamp(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Comment request failed.");
  }

  return result;
}

export default function Comments({
  recordingId,
  captureTimestamp,
  onSeek,
}) {
  const inputId = useId();

  const [comments, setComments] = useState([]);
  const [timestamp, setTimestamp] = useState(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [expanded, setExpanded] = useState(true);

  const url = `/api/v1/recordings/${recordingId}/comments`;

  useEffect(() => {
    const controller = new AbortController();

    setComments([]);
    setTimestamp(null);
    setBody("");
    setEditingId(null);
    setEditBody("");
    setError("");
    setNotice("");
    setLoading(true);

    async function loadComments() {
      try {
        const result = await commentsRequest(url, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setComments(result.items);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error.message || "Could not load comments.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadComments();

    return () => controller.abort();
  }, [url]);

  function startComment() {
    setError("");
    setNotice("");

    const position = captureTimestamp();

    if (position === null) {
      setError("Wait for the audio to load first.");
      return;
    }
    setExpanded(true);
    setTimestamp(position);
  }

  async function handleSave(event) {
    event.preventDefault();

    if (saving || timestamp === null || !body.trim()) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const comment = await commentsRequest(url, {
        method: "POST",
        body: JSON.stringify({
          timestamp_ms: timestamp,
          body: body.trim(),
        }),
      });

      setComments((previous) =>
        [...previous, comment].sort(
          (a, b) => a.timestamp_ms - b.timestamp_ms
        )
      );

      setBody("");
      setTimestamp(null);
      setNotice("Comment saved.");
    } catch (error) {
      setError(error.message || "Could not save the comment.");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(comment) {
    setEditingId(comment.id);
    setEditBody(comment.body);
    setError("");
    setNotice("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditBody("");
  }

  async function handleEditSave(event) {
    event.preventDefault();

    if (saving || editingId === null || !editBody.trim()) return;

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
          }),
        }
      );

      setComments((previous) =>
        previous.map((comment) =>
          comment.id === updated.id ? updated : comment
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

              {!loading && (
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
            disabled={saving || loading || editingId !== null}
          >
            {timestamp === null ? "+ Add comment" : "Use current time"}
          </button>
        </div>

        {timestamp !== null && (
          <form className="comments-form" onSubmit={handleSave}>
            <p>Comment at {formatTimestamp(timestamp)}</p>

            <label htmlFor={inputId}>Your note</label>
            <textarea
              id={inputId}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={5000}
              disabled={saving}
              required
            />

            <div className="comments-actions">
              <button type="submit" disabled={saving || !body.trim()}>
                {saving ? "Saving…" : "Save comment"}
              </button>

              <button
                className="comments-cancel"
                type="button"
                disabled={saving}
                onClick={() => {
                  setTimestamp(null);
                  setBody("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}

        <div id={`${inputId}-list`} hidden={!expanded}>
          {loading ? (
            <p role="status">Loading comments…</p>
          ) : comments.length > 0 ? (
            <ul className="comments-list">
              {comments.map((comment) => (
                <li className="comment-row" key={comment.id}>
                  <button
                    className="comment-timestamp"
                    type="button"
                    aria-label={`Seek to ${formatTimestamp(
                      comment.timestamp_ms
                    )}`}
                    onClick={() => onSeek(comment.timestamp_ms)}
                  >
                    {formatTimestamp(comment.timestamp_ms)}
                  </button>

                  {editingId === comment.id ? (
                    <form
                      className="comments-form comment-edit-form"
                      onSubmit={handleEditSave}
                    >
                      <label htmlFor={`${inputId}-edit-${comment.id}`}>
                        Edit comment
                      </label>

                      <textarea
                        id={`${inputId}-edit-${comment.id}`}
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                        maxLength={5000}
                        disabled={saving}
                        required
                      />

                      <div className="comments-actions">
                        <button
                          type="submit"
                          disabled={saving || !editBody.trim()}
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
                      <p className="comment-body">{comment.body}</p>

                      <button
                        className="comment-edit"
                        type="button"
                        aria-label={`Edit comment at ${formatTimestamp(
                          comment.timestamp_ms
                        )}`}
                        onClick={() => startEditing(comment)}
                        disabled={
                          saving ||
                          editingId !== null ||
                          timestamp !== null
                        }
                      >
                        Edit
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            !error && <p>No comments yet.</p>
          )}
        </div>
      </section>
    );
}