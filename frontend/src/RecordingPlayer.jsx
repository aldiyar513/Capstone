import { useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Comments from "./Comments";
function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";

  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function RecordingPlayer({ recordingId }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  async function loadPlayer() {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;
      if (!data.session) throw new Error("Please log in first.");

      const response = await fetch(
        `/api/v1/recordings/${recordingId}/playback-url`,
        {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not open recording.");
      }

      setCurrentTime(0);
      setDuration(0);
      setUrl(result.url);
    } catch (error) {
      setError(error.message || "Could not open recording.");
    } finally {
      setLoading(false);
    }
  }
  function captureTimestamp() {
    const audio = audioRef.current;

    if (!audio || audio.readyState < 1) return null;

    audio.pause();

    return Math.floor(audio.currentTime * 1000);
  }

  function seekToComment(timestampMs) {
    const audio = audioRef.current;

    if (!audio || audio.readyState < 1) return;

    audio.currentTime = timestampMs / 1000;
    setCurrentTime(audio.currentTime);
  }

  return (
    <div>
      <button onClick={loadPlayer} disabled={loading}>
        {loading
          ? "Opening…"
          : url
            ? "Reload audio"
            : "Open recording"}
      </button>

      {url && (
        <>
          <audio
            ref={audioRef}
            key={url}
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
                "Audio could not load. Try Reload audio. " +
                "If it still fails, the format may be unsupported."
              )
            }
          >
            Your browser does not support audio playback.
          </audio>

          <p>
            {formatTime(currentTime)} / {formatTime(duration)}
          </p>

          <Comments
            recordingId={recordingId}
            captureTimestamp={captureTimestamp}
            onSeek={seekToComment}
          />

        </>
      )}

      {error && <p role="alert">{error}</p>}
    </div>
  );
}