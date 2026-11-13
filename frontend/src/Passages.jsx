import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import "./Passages.css";

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function sortPassages(items) {
  return [...items].sort(
    (a, b) =>
      a.start_ms - b.start_ms ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)
  );
}

async function passageRequest(url, options = {}) {
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

  if (response.status === 204) return null;

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || "Could not complete the passage request.");
  }

  if (!result) {
    throw new Error("The server returned an unexpected response.");
  }

  return result;
}

export default function Passages({ recordingId, audioRef, onSeek }) {
  const inputId = useId();
  const labelRef = useRef(null);

  const [passages, setPassages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const busy = saving || deletingId !== null;
  const url = `/api/v1/recordings/${recordingId}/passages`;

  useEffect(() => {
    const controller = new AbortController();

    async function loadPassages() {
      setLoading(true);
      setLoadError("");

      try {
        const result = await passageRequest(url, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          if (!Array.isArray(result.items)) {
            throw new Error("The server returned an unexpected passage list.");
          }

          setPassages(sortPassages(result.items));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error.message || "Could not load passages.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadPassages();

    return () => controller.abort();
  }, [url, revision]);

  useEffect(() => {
    if (formOpen) labelRef.current?.focus();
  }, [formOpen, editingId]);

  function currentPosition() {
    const audio = audioRef.current;

    if (
      !audio ||
      audio.readyState < 1 ||
      !Number.isFinite(audio.currentTime)
    ) {
      throw new Error("Wait for the audio to load first.");
    }

    return (Math.floor(audio.currentTime * 1000) / 1000).toString();
  }

  function openNewPassage() {
    setError("");
    setNotice("");

    try {
      const position = currentPosition();

      setEditingId(null);
      setLabel("");
      setStart(position);
      setEnd("");
      setNote("");
      setConfirmDeleteId(null);
      setFormOpen(true);
    } catch (error) {
      setError(error.message);
    }
  }

  function capturePosition(boundary) {
    setError("");

    try {
      const position = currentPosition();

      if (boundary === "start") {
        setStart(position);
      } else {
        setEnd(position);
      }
    } catch (error) {
      setError(error.message);
    }
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setError("");
  }

  function openEdit(passage) {
    setEditingId(passage.id);
    setLabel(passage.label);
    setStart(String(passage.start_ms / 1000));
    setEnd(String(passage.end_ms / 1000));
    setNote(passage.note);
    setConfirmDeleteId(null);
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    if (busy) return;

    setError("");
    setNotice("");

    const startSeconds = Number(start);
    const endSeconds = Number(end);

    if (
      !start.trim() ||
      !end.trim() ||
      !Number.isFinite(startSeconds) ||
      !Number.isFinite(endSeconds)
    ) {
      setError("Enter a valid start and end time.");
      return;
    }

    const startMs = Math.round(startSeconds * 1000);
    const endMs = Math.round(endSeconds * 1000);

    if (
      startMs < 0 ||
      endMs <= startMs ||
      endMs > 2_147_483_647
    ) {
      setError("Choose an end time after the start and a nonnegative start.");
      return;
    }

    const duration = audioRef.current?.duration;

    if (
      Number.isFinite(duration) &&
      endMs > Math.round(duration * 1000)
    ) {
      setError("The passage cannot extend beyond the recording.");
      return;
    }

    if (!label.trim()) {
      setError("Give the passage a label.");
      return;
    }

    setSaving(true);

    try {
      const saved = await passageRequest(
        editingId ? `/api/v1/passages/${editingId}` : url,
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify({
            label: label.trim(),
            start_ms: startMs,
            end_ms: endMs,
            note,
          }),
        }
      );

      setPassages((previous) =>
        sortPassages([
          ...previous.filter((passage) => passage.id !== saved.id),
          saved,
        ])
      );

      setNotice(editingId ? "Passage updated." : "Passage saved.");
      closeForm();
    } catch (error) {
      // Keep the form and entered values available for retrying.
      setError(error.message || "Could not save the passage.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(passageId) {
    if (busy) return;

    setDeletingId(passageId);
    setError("");
    setNotice("");

    try {
      await passageRequest(`/api/v1/passages/${passageId}`, {
        method: "DELETE",
      });

      setPassages((previous) =>
        previous.filter((passage) => passage.id !== passageId)
      );
      setConfirmDeleteId(null);
      setNotice("Passage deleted.");
    } catch (error) {
      setError(error.message || "Could not delete the passage.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section
      className="passages"
      aria-labelledby={`${inputId}-heading`}
    >
      <header className="passages-header">
        <h2 id={`${inputId}-heading`}>Saved passages</h2>

        <button
          type="button"
          onClick={openNewPassage}
          disabled={busy || loading || Boolean(loadError) || formOpen}
        >
          + New passage
        </button>
      </header>

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {formOpen && (
        <form className="passage-form" onSubmit={handleSave}>
          <h3>{editingId ? "Edit passage" : "New passage"}</h3>

          <label htmlFor={`${inputId}-label`}>Label</label>
          <input
            ref={labelRef}
            id={`${inputId}-label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="For example, difficult string change"
            maxLength={120}
            disabled={busy}
            required
          />

          <div className="passage-boundaries">
            <div className="passage-boundary">
              <label htmlFor={`${inputId}-start`}>
                Start time (seconds)
              </label>
              <input
                id={`${inputId}-start`}
                type="number"
                min="0"
                step="0.001"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                disabled={busy}
                required
              />
              <button
                type="button"
                className="passage-secondary"
                onClick={() => capturePosition("start")}
                disabled={busy}
              >
                Set start here
              </button>
            </div>

            <div className="passage-boundary">
              <label htmlFor={`${inputId}-end`}>
                End time (seconds)
              </label>
              <input
                id={`${inputId}-end`}
                type="number"
                min="0"
                step="0.001"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                disabled={busy}
                required
              />
              <button
                type="button"
                className="passage-secondary"
                onClick={() => capturePosition("end")}
                disabled={busy}
              >
                Set end here
              </button>
            </div>
          </div>

          <label htmlFor={`${inputId}-note`}>Note (optional)</label>
          <textarea
            id={`${inputId}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What would you like to work on?"
            maxLength={5000}
            rows={3}
            disabled={busy}
          />

          <div className="passage-actions">
            <button type="submit" disabled={busy}>
              {saving ? "Saving…" : "Save passage"}
            </button>
            <button
              type="button"
              className="passage-secondary"
              onClick={closeForm}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p role="status">Loading passages…</p>
      ) : loadError ? (
        <div>
          <p role="alert">{loadError}</p>
          <button
            type="button"
            className="passage-secondary"
            onClick={() => setRevision((previous) => previous + 1)}
          >
            Try again
          </button>
        </div>
      ) : passages.length === 0 ? (
        <p className="passages-empty">
          Save a difficult section to return to it later.
        </p>
      ) : (
        <ul className="passages-list">
          {passages.map((passage) => (
            <li className="passage-card" key={passage.id}>
              <div className="passage-card-heading">
                <h3>{passage.label}</h3>

                <button
                  type="button"
                  className="passage-time"
                  onClick={() => onSeek(passage.start_ms)}
                  aria-label={`Go to ${passage.label}, starting at ${formatTime(
                    passage.start_ms
                  )}`}
                >
                  {formatTime(passage.start_ms)}
                  {" – "}
                  {formatTime(passage.end_ms)}
                </button>
              </div>

              {passage.note && (
                <p className="passage-note">{passage.note}</p>
              )}

              {confirmDeleteId === passage.id ? (
                <div className="passage-delete-confirm">
                  <p>Delete this saved passage?</p>
                  <div className="passage-actions">
                    <button
                      type="button"
                      onClick={() => handleDelete(passage.id)}
                      disabled={busy}
                    >
                      {deletingId === passage.id
                        ? "Deleting…"
                        : "Delete passage"}
                    </button>
                    <button
                      type="button"
                      className="passage-secondary"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={busy}
                    >
                      Keep passage
                    </button>
                  </div>
                </div>
              ) : (
                <div className="passage-actions">
                  <button
                    type="button"
                    className="passage-secondary"
                    onClick={() => openEdit(passage)}
                    disabled={busy || formOpen}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="passage-secondary"
                    onClick={() => {
                      setConfirmDeleteId(passage.id);
                      setError("");
                      setNotice("");
                    }}
                    disabled={busy || formOpen}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}