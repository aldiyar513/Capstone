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

  const url = `/api/v1/recordings/${recordingId}/comments`;

  useEffect(() => {
    const controller = new AbortController();

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

    setTimestamp(position);
  }

  async function handleSave(event) {
    event.preventDefault();

    if (timestamp === null || !body.trim()) return;

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

  return (
    <section>
      <h4>Comments</h4>

      <button
        type="button"
        onClick={startComment}
        disabled={saving}
      >
        {timestamp === null ? "Add comment here" : "Use current time"}
      </button>

      {timestamp !== null && (
        <form onSubmit={handleSave}>
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

          <button type="submit" disabled={saving || !body.trim()}>
            {saving ? "Saving…" : "Save comment"}
          </button>
        </form>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {loading ? (
        <p>Loading comments…</p>
      ) : comments.length > 0 ? (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id}>
              <button
                type="button"
                aria-label={`Seek to ${formatTimestamp(comment.timestamp_ms)}`}
                onClick={() => onSeek(comment.timestamp_ms)}
              >
                {formatTimestamp(comment.timestamp_ms)}
              </button>

              <p style={{ whiteSpace: "pre-wrap" }}>{comment.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No comments loaded.</p>
      )}
    </section>
  );
}