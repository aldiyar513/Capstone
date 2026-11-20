import { useEffect, useId, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import "./Passages.css";

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Overlapping passages occupy separate timeline rows.
function arrangePassages(passages) {
  const ends = [];

  const items = [...passages]
    .sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms)
    .map((passage) => {
      let row = ends.findIndex((end) => end <= passage.start_ms);

      if (row === -1) row = ends.length;

      ends[row] = passage.end_ms;

      return { ...passage, row };
    });

  return { items, rows: Math.max(1, ends.length) };
}

async function passageRequest(path, options = {}) {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;
  if (!data.session) throw new Error("Please log in first.");

  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (response.status === 204) return null;

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || "Could not complete the request.");
  }

  if (!result) throw new Error("Unexpected server response.");

  return result;
}

export default function Passages({
  recordingId,
  audioRef,
  duration,
  currentTime,
  selectedId,
  onSelect,
  onChanged,
}) {
  const inputId = useId();

  const [passages, setPassages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const url = `/api/v1/recordings/${recordingId}/passages`;
  const selected = passages.find((passage) => passage.id === selectedId);

  const durationMs =
    Number.isFinite(duration) && duration > 0 ? duration * 1000 : 0;

  const { items, rows } = arrangePassages(passages);

  const playheadPercent = durationMs
    ? Math.min(100, Math.max(0, (currentTime * 1000 / durationMs) * 100))
    : 0;

  useEffect(() => {
    const controller = new AbortController();

    async function loadPassages() {
      setLoading(true);
      setLoadError("");

      try {
        const result = await passageRequest(url, {
          signal: controller.signal,
        });

        if (!Array.isArray(result.items)) {
          throw new Error("Could not read saved passages.");
        }

        if (!controller.signal.aborted) {
          setPassages(result.items);
        }
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadPassages();

    return () => controller.abort();
  }, [url, revision]);

  function capturePosition() {
    const audio = audioRef.current;

    if (
      !audio ||
      audio.readyState < 1 ||
      !Number.isFinite(audio.currentTime)
    ) {
      throw new Error("Wait for the audio to load first.");
    }

    return String(Math.floor(audio.currentTime * 1000) / 1000);
  }

  function newPassage() {
    setError("");
    setNotice("");

    try {
      const position = capturePosition();

      setEditingId(null);
      setLabel("");
      setStart(position);
      setEnd("");
      setFormOpen(true);
    } catch (error) {
      setError(error.message);
    }
  }

  function editPassage() {
    if (!selected) return;

    setEditingId(selected.id);
    setLabel(selected.label);
    setStart(String(selected.start_ms / 1000));
    setEnd(String(selected.end_ms / 1000));
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function captureBoundary(boundary) {
    setError("");

    try {
      const value = capturePosition();

      if (boundary === "start") setStart(value);
      else setEnd(value);
    } catch (error) {
      setError(error.message);
    }
  }

  async function savePassage(event) {
    event.preventDefault();
    if (busy) return;

    setError("");
    setNotice("");

    const startMs = Math.round(Number(start) * 1000);
    const endMs = Math.round(Number(end) * 1000);

    if (
      !start.trim() ||
      !end.trim() ||
      !Number.isSafeInteger(startMs) ||
      !Number.isSafeInteger(endMs) ||
      startMs < 0 ||
      endMs <= startMs ||
      endMs > 2_147_483_647
    ) {
      setError("Choose a valid start time and an end time after it.");
      return;
    }

    if (!durationMs || endMs > Math.round(durationMs)) {
      setError("The passage must fit within the recording.");
      return;
    }

    if (!label.trim()) {
      setError("Give the passage a short label.");
      return;
    }

    setBusy(true);

    try {
      const saved = await passageRequest(
        editingId ? `/api/v1/passages/${editingId}` : url,
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify({
            label: label.trim(),
            start_ms: startMs,
            end_ms: endMs,
          }),
        }
      );

      setPassages((previous) => [
        ...previous.filter((passage) => passage.id !== saved.id),
        saved,
      ]);

      setFormOpen(false);
      setEditingId(null);
      setNotice("Passage saved.");
      onChanged?.();
      onSelect(saved);
    } catch (error) {
      setError(error.message || "Could not save the passage.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePassage() {
    if (!selected || busy) return;

    const confirmed = window.confirm(
      `Delete "${selected.label}"? Its comments will remain as timestamped comments.`
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await passageRequest(`/api/v1/passages/${selected.id}`, {
        method: "DELETE",
      });

      setPassages((previous) =>
        previous.filter((passage) => passage.id !== selected.id)
      );

      onSelect(null);
      onChanged?.();
      setNotice("Passage deleted. Its comments were kept.");
    } catch (error) {
      setError(error.message || "Could not delete the passage.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="passage-map"
      aria-labelledby={`${inputId}-heading`}
    >
      <header className="passage-map-header">
        <h2 id={`${inputId}-heading`}>Passages</h2>

        <button
          type="button"
          className="passage-map-secondary"
          onClick={newPassage}
          disabled={
            busy || loading || Boolean(loadError) || formOpen || !durationMs
          }
        >
          + Mark passage
        </button>
      </header>

      {loading && <p role="status">Loading passages…</p>}

      {loadError && (
        <div>
          <p role="alert">{loadError}</p>
          <button
            type="button"
            onClick={() => setRevision((previous) => previous + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !loadError && durationMs > 0 && (
        <>
          <div
            className="passage-map-track"
            style={{ height: `${rows * 42 + 12}px` }}
            role="group"
            aria-label="Saved passage ranges"
          >
            {items.map((passage, index) => {
              const left = Math.min(
                100,
                Math.max(0, passage.start_ms / durationMs * 100)
              );

              const right = Math.min(
                100,
                Math.max(left, passage.end_ms / durationMs * 100)
              );

              return (
                <button
                  key={passage.id}
                  type="button"
                  className="passage-map-range"
                  aria-pressed={selectedId === passage.id}
                  aria-label={`${passage.label}, ${formatTime(
                    passage.start_ms
                  )} to ${formatTime(passage.end_ms)}`}
                  title={`${passage.label} · ${formatTime(
                    passage.start_ms
                  )}–${formatTime(passage.end_ms)}`}
                  style={{
                    left: `${left}%`,
                    width: `${right - left}%`,
                    top: `${passage.row * 42 + 6}px`,
                  }}
                  disabled={busy || formOpen}
                  onClick={() => {
                    setError("");
                    setNotice("");
                    onSelect(passage);
                  }}
                >
                  <span>{index + 1}. {passage.label}</span>
                </button>
              );
            })}

            <div
              className="passage-map-playhead"
              style={{ left: `${playheadPercent}%` }}
              aria-hidden="true"
            />
          </div>

          <div className="passage-map-scale" aria-hidden="true">
            <span>0:00</span>
            <span>{formatTime(durationMs)}</span>
          </div>

          {passages.length === 0 && (
            <p className="passage-map-hint">
              Mark a section you want to practise again.
            </p>
          )}
        </>
      )}

      {selected && !formOpen && (
        <div className="passage-map-selection">
          <div>
            <strong>{selected.label}</strong>
            <span className="passage-map-selection-time">
              {formatTime(selected.start_ms)}–{formatTime(selected.end_ms)}
            </span>
          </div>

          <div className="passage-map-actions">
            <button
              type="button"
              className="passage-map-secondary"
              onClick={editPassage}
              disabled={busy}
            >
              Edit
            </button>

            <button
              type="button"
              className="passage-map-secondary"
              onClick={deletePassage}
              disabled={busy}
            >
              Delete
            </button>

            <button
              type="button"
              className="passage-map-secondary"
              onClick={() => onSelect(null)}
              disabled={busy}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {formOpen && (
        <form className="passage-map-form" onSubmit={savePassage}>
          <h3>{editingId ? "Edit passage" : "Mark a passage"}</h3>

          <label htmlFor={`${inputId}-label`}>Label</label>
          <input
            id={`${inputId}-label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="For example, second phrase"
            maxLength={120}
            disabled={busy}
            required
            autoFocus
          />

          <div className="passage-map-boundaries">
            <div>
              <label htmlFor={`${inputId}-start`}>
                Start (seconds)
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
                className="passage-map-secondary"
                onClick={() => captureBoundary("start")}
                disabled={busy}
              >
                Set start here
              </button>
            </div>

            <div>
              <label htmlFor={`${inputId}-end`}>
                End (seconds)
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
                className="passage-map-secondary"
                onClick={() => captureBoundary("end")}
                disabled={busy}
              >
                Set end here
              </button>
            </div>
          </div>

          <div className="passage-map-actions">
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save passage"}
            </button>

            <button
              type="button"
              className="passage-map-secondary"
              disabled={busy}
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}