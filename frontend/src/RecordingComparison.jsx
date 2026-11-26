import { useEffect, useId, useRef } from "react";
import RecordingPlayer from "./RecordingPlayer";
import "./RecordingComparison.css";

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "";

  const seconds = Math.max(0, Math.floor(milliseconds / 1000));

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(
    2,
    "0"
  )}`;
}

export default function RecordingComparison({ recordings, onBack }) {
  const headingId = useId();
  const headingRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    // Media play events do not bubble, so listen in the capture phase.
    function handlePlay(event) {
      const activeAudio = event.target;

      if (!(activeAudio instanceof HTMLAudioElement)) return;

      container.querySelectorAll("audio").forEach((audio) => {
        if (audio !== activeAudio) {
          audio.pause();
        }
      });
    }

    container.addEventListener("play", handlePlay, true);

    return () => {
      container.removeEventListener("play", handlePlay, true);

      container.querySelectorAll("audio").forEach((audio) => {
        audio.pause();
      });
    };
  }, []);

  return (
    <section
      ref={containerRef}
      className="recording-comparison"
      aria-labelledby={headingId}
    >
      <header className="comparison-page-header">
        <div>
          <h1 id={headingId} ref={headingRef} tabIndex={-1}>
            Compare recordings
          </h1>

          <p>
            Select the same phrase in each attempt. Each recording
            keeps its own passage boundaries.
          </p>
        </div>

        <button
          type="button"
          className="review-back"
          onClick={onBack}
        >
          ← Recording history
        </button>
      </header>

      <div className="comparison-stack">
        {recordings.map((recording, index) => {
          const letter = index === 0 ? "A" : "B";
          const titleId = `${headingId}-${letter}`;

          return (
            <section
              key={recording.id}
              className="comparison-card"
              aria-labelledby={titleId}
            >
              <header className="comparison-card-header">
                <span
                  className={`comparison-badge comparison-badge-${letter.toLowerCase()}`}
                  aria-hidden="true"
                >
                  {letter}
                </span>

                <div>
                  <h2 id={titleId}>
                    <span className="comparison-sr-only">
                      Recording {letter}:{" "}
                    </span>
                    {recording.title}
                  </h2>

                  <p className="comparison-recording-meta">
                    {new Date(recording.created_at).toLocaleDateString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }
                    )}

                    {recording.duration_ms != null &&
                      ` · ${formatDuration(recording.duration_ms)}`}
                  </p>
                </div>
              </header>

              <RecordingPlayer recordingId={recording.id} />
            </section>
          );
        })}
      </div>
    </section>
  );
}