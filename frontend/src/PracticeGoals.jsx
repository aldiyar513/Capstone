import { useEffect, useId, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import "./PracticeGoals.css";

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

async function goalRequest(path, options = {}) {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;
  if (!data.session) throw new Error("Please log in first.");

  const response = await fetch(`/api/v1${path}`, {
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

  if (!result) {
    throw new Error("The server returned an unexpected response.");
  }

  return result;
}

export default function PracticeGoals({ pieceId }) {
  return <GoalsWorkspace key={pieceId} pieceId={pieceId} />;
}

function GoalsWorkspace({ pieceId }) {
  const inputId = useId();

  const [goals, setGoals] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedGoal = goals.find((goal) => goal.id === selectedId);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGoals() {
      setLoading(true);
      setLoadError("");

      try {
        const result = await goalRequest(`/pieces/${pieceId}/goals`, {
          signal: controller.signal,
        });

        if (!Array.isArray(result.items)) {
          throw new Error("Could not read the goals list.");
        }

        if (!controller.signal.aborted) {
          setGoals(result.items);
          setSelectedId((previous) =>
            result.items.some((goal) => goal.id === previous)
              ? previous
              : result.items[0]?.id || ""
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadGoals();

    return () => controller.abort();
  }, [pieceId, revision]);

  async function createGoal(event) {
    event.preventDefault();

    if (saving || !title.trim()) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const goal = await goalRequest(`/pieces/${pieceId}/goals`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim() }),
      });

      setGoals((previous) => [goal, ...previous]);
      setSelectedId(goal.id);
      setTitle("");
      setFormOpen(false);
      setNotice("Goal created.");
    } catch (error) {
      setError(error.message || "Could not create the goal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="practice-goals"
      aria-labelledby={`${inputId}-heading`}
    >
      <header className="goals-header">
        <h2 id={`${inputId}-heading`}>Practice goals</h2>

        <button
          type="button"
          onClick={() => {
            setFormOpen(true);
            setError("");
            setNotice("");
          }}
          disabled={loading || Boolean(loadError) || formOpen}
        >
          + New goal
        </button>
      </header>

      {formOpen && (
        <form className="goals-form" onSubmit={createGoal}>
          <label htmlFor={`${inputId}-title`}>What are you working on?</label>

          <input
            id={`${inputId}-title`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="For example, keep the second phrase steady"
            maxLength={120}
            disabled={saving}
            required
            autoFocus
          />

          <div className="goals-actions">
            <button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Saving…" : "Create goal"}
            </button>

            <button
              type="button"
              className="goals-secondary"
              disabled={saving}
              onClick={() => {
                setFormOpen(false);
                setTitle("");
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

      {loading ? (
        <p role="status">Loading goals…</p>
      ) : loadError ? (
        <div>
          <p role="alert">{loadError}</p>
          <button
            type="button"
            className="goals-secondary"
            onClick={() => setRevision((previous) => previous + 1)}
          >
            Try again
          </button>
        </div>
      ) : goals.length === 0 ? (
        <p className="goals-muted">
          Create a goal to keep related passages from different attempts together.
        </p>
      ) : (
        <>
          <div className="goals-field">
            <label htmlFor={`${inputId}-selected`}>Goal</label>
            <select
              id={`${inputId}-selected`}
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setNotice("");
              }}
              disabled={saving}
            >
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </div>

          {selectedGoal && (
            <GoalDetails
              key={selectedGoal.id}
              goal={selectedGoal}
              pieceId={pieceId}
            />
          )}
        </>
      )}
    </section>
  );
}

function GoalDetails({ goal, pieceId }) {
  const inputId = useId();

  const [links, setLinks] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [recordingId, setRecordingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetails() {
      setLoading(true);
      setLoadError("");

      try {
        const [linkResult, recordingResult] = await Promise.all([
          goalRequest(`/goals/${goal.id}/passages`, {
            signal: controller.signal,
          }),
          goalRequest(`/pieces/${pieceId}/recordings`, {
            signal: controller.signal,
          }),
        ]);

        if (
          !Array.isArray(linkResult.items) ||
          !Array.isArray(recordingResult.items)
        ) {
          throw new Error("Could not read the goal details.");
        }

        if (!controller.signal.aborted) {
          setLinks(linkResult.items);
          setRecordings(
            recordingResult.items.filter(
              (recording) => recording.upload_status === "ready"
            )
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadDetails();

    return () => controller.abort();
  }, [goal.id, pieceId, revision]);

  async function linkPassage(passageId) {
    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const link = await goalRequest(`/goals/${goal.id}/passages`, {
        method: "POST",
        body: JSON.stringify({ passage_id: passageId }),
      });

      setLinks((previous) => [
        ...previous.filter((item) => item.passage_id !== link.passage_id),
        link,
      ]);

      setLinkFormOpen(false);
      setRecordingId("");
      setNotice("Passage linked to this goal.");
    } catch (error) {
      setError(error.message || "Could not link the passage.");
    } finally {
      setBusy(false);
    }
  }

  async function unlinkPassage(passageId) {
    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await goalRequest(
        `/goals/${goal.id}/passages/${passageId}`,
        { method: "DELETE" }
      );

      setLinks((previous) =>
        previous.filter((item) => item.passage_id !== passageId)
      );

      setNotice("Link removed. The saved passage is unchanged.");
    } catch (error) {
      setError(error.message || "Could not remove the link.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status">Loading linked passages…</p>;

  if (loadError) {
    return (
      <div>
        <p role="alert">{loadError}</p>
        <button
          type="button"
          className="goals-secondary"
          onClick={() => setRevision((previous) => previous + 1)}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="goal-details">
      <header className="goals-header">
        <h3>{goal.title}</h3>

        <button
          type="button"
          className="goals-secondary"
          disabled={busy || linkFormOpen}
          onClick={() => {
            setLinkFormOpen(true);
            setError("");
            setNotice("");
          }}
        >
          + Link passage
        </button>
      </header>

      {linkFormOpen && (
        <div className="goals-link-panel">
          <div className="goals-field">
            <label htmlFor={`${inputId}-recording`}>Recording</label>
            <select
              id={`${inputId}-recording`}
              value={recordingId}
              onChange={(event) => {
                setRecordingId(event.target.value);
                setError("");
              }}
              disabled={busy}
            >
              <option value="">Choose a recording</option>
              {recordings.map((recording) => (
                <option key={recording.id} value={recording.id}>
                  {recording.title}
                </option>
              ))}
            </select>
          </div>

          {recordings.length === 0 && (
            <p className="goals-muted">
              Upload a recording and save a passage first.
            </p>
          )}

          {recordingId && (
            <PassagePicker
              key={recordingId}
              recordingId={recordingId}
              links={links}
              busy={busy}
              onLink={linkPassage}
            />
          )}

          <button
            type="button"
            className="goals-secondary"
            disabled={busy}
            onClick={() => {
              setLinkFormOpen(false);
              setRecordingId("");
              setError("");
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {links.length === 0 ? (
        <p className="goals-muted">
          No passages linked yet. Add a passage from an attempt to get started.
        </p>
      ) : (
        <ul className="goal-passages-list">
          {links.map((link) => (
            <li className="goal-passage-card" key={link.passage_id}>
              <div className="goal-passage-text">
                <h4>{link.recording_title}</h4>
                <p>{link.label}</p>
                <span className="goal-passage-range">
                  {formatTime(link.start_ms)}–{formatTime(link.end_ms)}
                </span>
              </div>

              <button
                type="button"
                className="goals-secondary"
                disabled={busy}
                aria-label={`Unlink ${link.label} from ${goal.title}`}
                onClick={() => unlinkPassage(link.passage_id)}
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PassagePicker({ recordingId, links, busy, onLink }) {
  const inputId = useId();
  const [passages, setPassages] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPassages() {
      setLoading(true);
      setError("");

      try {
        const result = await goalRequest(
          `/recordings/${recordingId}/passages`,
          { signal: controller.signal }
        );

        if (!Array.isArray(result.items)) {
          throw new Error("Could not read the passage list.");
        }

        if (!controller.signal.aborted) {
          setPassages(result.items);
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadPassages();

    return () => controller.abort();
  }, [recordingId, revision]);

  const available = passages.filter(
    (passage) => !links.some((link) => link.passage_id === passage.id)
  );

  if (loading) return <p role="status">Loading passages…</p>;

  if (error) {
    return (
      <div>
        <p role="alert">{error}</p>
        <button
          type="button"
          className="goals-secondary"
          onClick={() => setRevision((previous) => previous + 1)}
        >
          Try again
        </button>
      </div>
    );
  }

  if (available.length === 0) {
    return (
      <p className="goals-muted">
        {passages.length
          ? "All passages from this recording are already linked."
          : "This recording has no saved passages. Open it and save one first."}
      </p>
    );
  }

  return (
    <form
      className="goals-form"
      onSubmit={(event) => {
        event.preventDefault();

        if (
          !busy &&
          available.some((passage) => passage.id === selectedId)
        ) {
          onLink(selectedId);
        }
      }}
    >
      <label htmlFor={`${inputId}-passage`}>Saved passage</label>

      <select
        id={`${inputId}-passage`}
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        disabled={busy}
        required
      >
        <option value="">Choose a passage</option>
        {available.map((passage) => (
          <option key={passage.id} value={passage.id}>
            {passage.label} · {formatTime(passage.start_ms)}–
            {formatTime(passage.end_ms)}
          </option>
        ))}
      </select>

      <button type="submit" disabled={busy || !selectedId}>
        {busy ? "Linking…" : "Link to goal"}
      </button>
    </form>
  );
}