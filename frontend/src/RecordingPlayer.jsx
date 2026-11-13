import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Comments from "./Comments";
import Passages from "./Passages";

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";

  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function RecordingPlayer({ recordingId }) {
  const audioRef = useRef(null);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [revision, setRevision] = useState(0);

  // Load the audio automatically when the recording is opened.
  useEffect(() => {
    const controller = new AbortController();

    async function loadPlayer() {
      setLoading(true);
      setError("");
      setUrl("");
      setCurrentTime(0);
      setDuration(0);

      try {
        const { data, error } = await supabase.auth.getSession();

        if (controller.signal.aborted) return;
        if (error) throw error;
        if (!data.session) throw new Error("Please log in first.");

        const response = await fetch(
          `/api/v1/recordings/${recordingId}/playback-url`,
          {
            headers: {
              Authorization: `Bearer ${data.session.access_token}`,
            },
            signal: controller.signal,
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not load recording.");
        }

        if (typeof result.url !== "string" || !result.url.trim()) {
          throw new Error("No audio link was returned. Please try again.");
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

  function captureTimestamp() {
    const audio = audioRef.current;

    if (!audio || audio.readyState < 1) return null;

    audio.pause();

    return Math.floor(audio.currentTime * 1000);
  }

  function seekToComment(timestampMs) {
    const audio = audioRef.current;

    if (
      !audio ||
      audio.readyState < 1 ||
      !Number.isFinite(timestampMs)
    ) {
      return;
    }

    const targetTime = Math.max(0, timestampMs / 1000);

    audio.currentTime = Number.isFinite(audio.duration)
      ? Math.min(targetTime, audio.duration)
      : targetTime;

    setCurrentTime(audio.currentTime);
  }

  return (
    <div>
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
          <audio
            ref={audioRef}
            key={`${recordingId}-${revision}`}
            controls
            preload="metadata"
            src={url}
            onLoadedMetadata={(event) =>
              setDuration(event.currentTarget.duration)
            }
            onDurationChange={(event) =>
              setDuration(event.currentTarget.duration)
            }
            onTimeUpdate={(event) =>
              setCurrentTime(event.currentTarget.currentTime)
            }
            onError={() =>
              setError(
                "Audio could not load. Try reloading it. " +
                  "If it still fails, the format may be unsupported."
              )
            }
          >
            Your browser does not support audio playback.
          </audio>

          <p>
            {formatTime(currentTime)} / {formatTime(duration)}
          </p>
          <Passages
            key={recordingId}
            recordingId={recordingId}
            audioRef={audioRef}
            onSeek={(milliseconds) => {
              const audio = audioRef.current;

              if (!audio || audio.readyState < 1) return;

              const seconds = milliseconds / 1000;

              audio.currentTime = Number.isFinite(audio.duration)
                ? Math.min(Math.max(0, seconds), audio.duration)
                : Math.max(0, seconds);
            }}
          />
          <Comments
            recordingId={recordingId}
            captureTimestamp={captureTimestamp}
            onSeek={seekToComment}
          />
        </>
      )}
    </div>
  );
}