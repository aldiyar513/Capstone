import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Comments from "./Comments";
import Passages from "./Passages";
import WaveformPlayer from "./WaveformPlayer";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";

  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

async function authenticatedGet(url, signal) {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;
  if (!data.session) throw new Error("Please log in first.");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
    },
    signal,
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.error || "Could not complete the request."
    );
  }

  if (!result) {
    throw new Error("The server returned an unexpected response.");
  }

  return result;
}

export default function RecordingPlayer({ recordingId }) {
  return <Player key={recordingId} recordingId={recordingId} />;
}

function Player({ recordingId }) {
  const inputId = useId();
  const audioRef = useRef(null);
  const rangeClearedRef = useRef(false);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [playError, setPlayError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [revision, setRevision] = useState(0);

  const [speed, setSpeed] = useState(1);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [selectedPassageId, setSelectedPassageId] = useState("");

  const [passages, setPassages] = useState([]);
  const [passagesLoading, setPassagesLoading] = useState(true);
  const [passagesError, setPassagesError] = useState("");
  const [passagesRevision, setPassagesRevision] = useState(0);

  const selectedPassage =
    passages.find((passage) => passage.id === selectedPassageId) ||
    null;

  const startSeconds = selectedPassage
    ? selectedPassage.start_ms / 1000
    : 0;

  const endSeconds = selectedPassage
    ? selectedPassage.end_ms / 1000
    : 0;

  const validRange = Boolean(
    ready &&
      selectedPassage &&
      Number.isFinite(duration) &&
      startSeconds >= 0 &&
      endSeconds > startSeconds &&
      endSeconds <= duration + 0.001
  );

  const passageControlsDisabled =
    !validRange || passagesLoading || Boolean(passagesError);

  // Load the recording's signed playback URL.
  useEffect(() => {
    const controller = new AbortController();

    async function loadPlayer() {
      setLoading(true);
      setReady(false);
      setError("");
      setPlayError("");
      setUrl("");
      setCurrentTime(0);
      setDuration(0);
      setLoopEnabled(false);

      try {
        const result = await authenticatedGet(
          `/api/v1/recordings/${recordingId}/playback-url`,
          controller.signal
        );

        if (typeof result.url !== "string" || !result.url.trim()) {
          throw new Error(
            "No audio link was returned. Please try again."
          );
        }

        if (!controller.signal.aborted) {
          setUrl(result.url);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error.message || "Could not load recording.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadPlayer();

    return () => controller.abort();
  }, [recordingId, revision]);

  // Keep the selected passage and loop boundaries up to date.
  useEffect(() => {
    const controller = new AbortController();

    async function loadPassages() {
      setPassagesLoading(true);
      setPassagesError("");

      try {
        const result = await authenticatedGet(
          `/api/v1/recordings/${recordingId}/passages`,
          controller.signal
        );

        if (!Array.isArray(result.items)) {
          throw new Error("Could not read the passage list.");
        }

        if (!controller.signal.aborted) {
          setPassages(result.items);

          setSelectedPassageId((previous) =>
            result.items.some((passage) => passage.id === previous)
              ? previous
              : ""
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPassagesError(
            error.message || "Could not load passages."
          );
          setLoopEnabled(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setPassagesLoading(false);
        }
      }
    }

    loadPassages();

    return () => controller.abort();
  }, [recordingId, passagesRevision]);

  // Apply playback speed to the shared audio element.
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    audio.playbackRate = speed;
    audio.preservesPitch = true;
  }, [speed, url]);

  // Stop the shared media element when its recording is replaced or removed.
  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, [url]);

  // Enforce passage playback whether or not repetition is enabled.
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !validRange) return;

    let frameId = null;
    let disposed = false;

    function enforceRange() {
      if (rangeClearedRef.current || audio.seeking) return;
      if (audio.currentTime >= endSeconds) {
        if (loopEnabled) {
          audio.currentTime = startSeconds;
          setCurrentTime(startSeconds);
        } else {
          audio.pause();
          audio.currentTime = endSeconds;
          setCurrentTime(endSeconds);
        }
      }
    }

    function tick() {
      frameId = null;

      if (disposed || audio.paused || audio.ended) return;

      enforceRange();
      if (!audio.paused) frameId = requestAnimationFrame(tick);
    }

    function startWatching() {
      if (!rangeClearedRef.current &&
          (audio.currentTime < startSeconds || audio.currentTime >= endSeconds)) {
        audio.currentTime = startSeconds;
        setCurrentTime(startSeconds);
      }

      if (frameId === null) {
        frameId = requestAnimationFrame(tick);
      }
    }

    function stopWatching() {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    }

    function onTimeUpdate() {
      if (!audio.paused && !audio.ended) {
        enforceRange();
      }
    }

    async function restartAtEnd() {
      if (disposed || rangeClearedRef.current || !loopEnabled) return;

      audio.currentTime = startSeconds;
      setCurrentTime(startSeconds);

      try {
        await audio.play();
      } catch {
        if (!disposed) {
          setLoopEnabled(false);
          setPlayError(
            "Playback stopped. Press Play to continue."
          );
        }
      }
    }

    audio.addEventListener("play", startWatching);
    audio.addEventListener("pause", stopWatching);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", restartAtEnd);

    if (!audio.paused) {
      startWatching();
    }

    return () => {
      disposed = true;
      stopWatching();

      audio.removeEventListener("play", startWatching);
      audio.removeEventListener("pause", stopWatching);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", restartAtEnd);
    };
  }, [
    loopEnabled,
    validRange,
    startSeconds,
    endSeconds,
    url,
  ]);

  function captureTimestamp() {
    const audio = audioRef.current;

    if (
      !audio ||
      audio.readyState < 1 ||
      !Number.isFinite(audio.currentTime)
    ) {
      return null;
    }

    audio.pause();

    return Math.floor(audio.currentTime * 1000);
  }

  function seekToTime(timestampMs, selectingPassage = false) {
    const audio = audioRef.current;

    if (
      !audio ||
      audio.readyState < 1 ||
      !Number.isFinite(timestampMs)
    ) {
      return;
    }

    setPlayError("");

    const seconds = Math.max(0, timestampMs / 1000);

    const target = Number.isFinite(audio.duration)
      ? Math.min(seconds, audio.duration)
      : seconds;

    if (!selectingPassage && selectedPassage &&
        (target < startSeconds || target >= endSeconds)) {
      // Disable the old listener immediately, before React commits the update.
      rangeClearedRef.current = true;
      setSelectedPassageId("");
      setLoopEnabled(false);
    }
    audio.currentTime = target;

    setCurrentTime(audio.currentTime);
  }

  function selectPassage(passage) {
    rangeClearedRef.current = !passage;
    setSelectedPassageId(passage?.id || "");
    setLoopEnabled(false);
    setPlayError("");

    if (passage) {
      setPassages((previous) => [
        ...previous.filter((item) => item.id !== passage.id),
        passage,
      ]);

      seekToTime(passage.start_ms, true);
    }
  }

  function toggleLoop() {
    const audio = audioRef.current;

    if (!audio || passageControlsDisabled) return;

    setPlayError("");

    if (loopEnabled) {
      setLoopEnabled(false);
      return;
    }

    if (
      audio.currentTime < startSeconds ||
      audio.currentTime >= endSeconds
    ) {
      audio.currentTime = startSeconds;
      setCurrentTime(startSeconds);
    }

    setLoopEnabled(true);
  }

  function preparePlayback() {
    const audio = audioRef.current;
    if (audio && validRange && !rangeClearedRef.current &&
        (audio.currentTime < startSeconds || audio.currentTime >= endSeconds)) {
      audio.currentTime = startSeconds;
      setCurrentTime(startSeconds);
    }
  }

  async function playPassage() {
    const audio = audioRef.current;

    if (!audio || passageControlsDisabled) return;

    setPlayError("");

    audio.currentTime = startSeconds;
    setCurrentTime(startSeconds);

    try {
      await audio.play();
    } catch {
      setPlayError(
        "Could not start playback. Try the player's Play button."
      );
    }
  }

  function handleMetadata(event) {
    const audio = event.currentTarget;

    audio.playbackRate = speed;
    audio.preservesPitch = true;

    setDuration(audio.duration);
    setReady(true);
  }

  function handlePassagesChanged() {
    setLoopEnabled(false);
    setPassagesRevision((previous) => previous + 1);
  }

  return (
    <div className="recording-player">
      {loading && <p role="status">Loading audio…</p>}

      {error && (
        <div>
          <p role="alert">{error}</p>

          <button
            type="button"
            onClick={() => setRevision((previous) => previous + 1)}
            disabled={loading}
          >
            Reload audio
          </button>
        </div>
      )}

      {url && (
        <>
          {/* One shared audio element, controlled by the waveform. */}
          <audio
            ref={audioRef}
            key={`${recordingId}-${revision}`}
            hidden
            style={{ display: "none" }}
            preload="metadata"
            src={url}
            onLoadedMetadata={handleMetadata}
            onDurationChange={(event) =>
              setDuration(event.currentTarget.duration)
            }
            onTimeUpdate={(event) =>
              setCurrentTime(event.currentTarget.currentTime)
            }
            onRateChange={(event) =>
              setSpeed(event.currentTarget.playbackRate)
            }
            onError={() => {
              setReady(false);
              setLoopEnabled(false);
              setError(
                "Audio could not load. Try reloading it. " +
                  "If it still fails, the format may be unsupported."
              );
            }}
          />

          <WaveformPlayer
            recordingId={recordingId}
            key={`${recordingId}-${revision}`}
            audioRef={audioRef}
            url={url}
            ready={ready}
            currentTime={currentTime}
            duration={duration}
            selectedPassage={selectedPassage}
            onSeek={seekToTime}
            onBeforePlay={preparePlayback}
          />

          <Passages
            recordingId={recordingId}
            audioRef={audioRef}
            duration={duration}
            currentTime={currentTime}
            selectedId={selectedPassageId}
            onSelect={selectPassage}
            onChanged={handlePassagesChanged}
          />

          <div className="practice-controls">
            <div className="practice-control-field">
              <label htmlFor={`${inputId}-speed`}>
                Playback speed
              </label>

              <select
                id={`${inputId}-speed`}
                value={speed}
                onChange={(event) =>
                  setSpeed(Number(event.target.value))
                }
                disabled={!ready}
              >
                {PLAYBACK_SPEEDS.map((value) => (
                  <option key={value} value={value}>
                    {value}×{value === 1 ? " · Normal" : ""}
                  </option>
                ))}

                {!PLAYBACK_SPEEDS.includes(speed) && (
                  <option value={speed}>{speed}×</option>
                )}
              </select>
            </div>

            {selectedPassage && (
              <div className="practice-control-actions">
                <button
                  type="button"
                  className="practice-secondary"
                  onClick={playPassage}
                  disabled={passageControlsDisabled}
                >
                  Play from start
                </button>

                <button
                  type="button"
                  className="practice-loop"
                  aria-pressed={loopEnabled}
                  onClick={toggleLoop}
                  disabled={passageControlsDisabled}
                >
                  {loopEnabled ? "Loop on" : "Loop off"}
                </button>
              </div>
            )}
          </div>

          {loopEnabled && (
            <p className="practice-loop-status" role="status">
              Loop selected: {formatTime(startSeconds)}–
              {formatTime(endSeconds)}. Press Play if paused.
            </p>
          )}

          {selectedPassage && ready && !validRange && (
            <p role="alert">
              This passage falls outside the playable duration.
              Edit its boundaries before looping.
            </p>
          )}

          {playError && <p role="alert">{playError}</p>}

          {passagesError && (
            <div>
              <p role="alert">{passagesError}</p>

              <button
                type="button"
                onClick={handlePassagesChanged}
                disabled={passagesLoading}
              >
                Reload passages
              </button>
            </div>
          )}

          <Comments
            recordingId={recordingId}
            captureTimestamp={captureTimestamp}
            onSeek={seekToTime}
            passagesRevision={passagesRevision}
          />
        </>
      )}
    </div>
  );
}