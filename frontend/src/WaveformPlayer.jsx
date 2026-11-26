import { useEffect, useId, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { supabase } from "./lib/supabaseClient";
import "./WaveformPlayer.css";

function timeLabel(seconds) {
  const value = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds))
    : 0;

  return `${Math.floor(value / 60)}:${String(value % 60).padStart(
    2,
    "0"
  )}`;
}

export default function WaveformPlayer({
  audioRef,
  recordingId,
  url,
  ready,
  currentTime,
  duration,
  selectedPassage,
  onSeek,
}) {
  const waveRef = useRef(null);
  const helpId = useId();

  const [playing, setPlaying] = useState(false);
  const [building, setBuilding] = useState(true);
  const [waveError, setWaveError] = useState("");
  const [playError, setPlayError] = useState("");
  const [volume, setVolume] = useState(1);
  const [retry, setRetry] = useState(0);

  const length =
    Number.isFinite(duration) && duration > 0 ? duration : 0;

  const position = Math.min(
    Math.max(0, currentTime || 0),
    length
  );

  const canSeek = ready && length > 0;

  const start = selectedPassage
    ? selectedPassage.start_ms / 1000
    : 0;

  const end = selectedPassage
    ? selectedPassage.end_ms / 1000
    : 0;

  const showSelection =
    selectedPassage &&
    length > 0 &&
    start >= 0 &&
    end > start &&
    end <= length + 0.001;

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !waveRef.current || !url) return;

    let active = true;
    let wave;
    const controller = new AbortController();

    setBuilding(true);
    setWaveError("");
    setPlayError("");

    function syncPlayback() {
      setPlaying(!audio.paused && !audio.ended);
    }

    function syncVolume() {
      setVolume(audio.muted ? 0 : audio.volume);
    }

    syncPlayback();
    syncVolume();

    audio.addEventListener("play", syncPlayback);
    audio.addEventListener("pause", syncPlayback);
    audio.addEventListener("ended", syncPlayback);
    audio.addEventListener("volumechange", syncVolume);

    async function loadWaveform() {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error || !data.session) throw new Error("Please log in again.");

      wave = WaveSurfer.create({
        container: waveRef.current,
        media: audio,
        url: `/api/v1/recordings/${recordingId}/waveform-audio`,
        fetchParams: {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          signal: controller.signal,
        },
        height: 160,
        waveColor: "#79a7ac",
        progressColor: "#176171",
        cursorColor: "#203b43",
        cursorWidth: 2,
        barWidth: 3,
        barGap: 3,
        barRadius: 3,
        normalize: true,
        interact: false,
        hideScrollbar: true,
        mediaControls: false,
      });

      wave.on("ready", () => {
        if (active) setBuilding(false);
      });

      wave.on("error", () => {
        if (!active) return;

        setBuilding(false);
        setWaveError(
          "The waveform could not load. You can still try playing the audio."
        );
      });

    }

    loadWaveform().catch(() => {
      if (!active) return;
      setBuilding(false);
      setWaveError("The waveform could not load. Try again or reload the audio.");
    });

    return () => {
      active = false;
      controller.abort();
      wave?.destroy();

      audio.removeEventListener("play", syncPlayback);
      audio.removeEventListener("pause", syncPlayback);
      audio.removeEventListener("ended", syncPlayback);
      audio.removeEventListener("volumechange", syncVolume);
    };
  }, [audioRef, recordingId, url, retry]);

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio || !ready) return;

    setPlayError("");

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
    } catch (error) {
      if (error.name !== "AbortError") {
        setPlayError(
          "Playback could not start. Try again or reload the audio."
        );
      }
    }
  }

  function seek(seconds) {
    if (!canSeek) return;

    const target = Math.min(length, Math.max(0, seconds));

    onSeek(target * 1000);
  }

  function handleWaveClick(event) {
    const bounds = event.currentTarget.getBoundingClientRect();

    if (bounds.width <= 0) return;

    const fraction =
      (event.clientX - bounds.left) / bounds.width;

    seek(fraction * length);
  }

  function handleWaveKey(event) {
    const targets = {
      ArrowLeft: position - 5,
      ArrowDown: position - 5,
      ArrowRight: position + 5,
      ArrowUp: position + 5,
      Home: 0,
      End: length,
    };

    if (Object.hasOwn(targets, event.key)) {
      event.preventDefault();
      seek(targets[event.key]);
    }
  }

  return (
    <section className="wave-player" aria-label="Audio player">
      <div
        className="wave-player-track"
        role="slider"
        tabIndex={canSeek ? 0 : -1}
        aria-label="Playback position"
        aria-describedby={helpId}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={length || 1}
        aria-valuenow={position}
        aria-valuetext={`${timeLabel(position)} of ${timeLabel(
          length
        )}`}
        aria-disabled={!canSeek}
        onClick={handleWaveClick}
        onKeyDown={handleWaveKey}
      >
        <div
          ref={waveRef}
          className="wave-player-drawing"
          aria-hidden="true"
        />

        {showSelection && (
          <div
            className="wave-player-selection"
            aria-hidden="true"
            style={{
              left: `${(start / length) * 100}%`,
              width: `${
                ((Math.min(end, length) - start) / length) * 100
              }%`,
            }}
          />
        )}
      </div>

      <p id={helpId} className="wave-player-hint">
        Click the waveform to seek. Use arrow keys to move five
        seconds.
      </p>

      {building && <p role="status">Drawing waveform…</p>}

      {waveError && (
        <div className="wave-player-error">
          <p role="alert">{waveError}</p>

          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry waveform
          </button>
        </div>
      )}

      <div className="wave-player-toolbar">
        <button
          className="wave-player-play"
          type="button"
          onClick={togglePlayback}
          disabled={!ready}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            {playing ? (
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            ) : (
              <path d="M7 4v16l13-8z" />
            )}
          </svg>

          {playing ? "Pause" : "Play"}
        </button>

        <span className="wave-player-time">
          {timeLabel(position)} / {timeLabel(length)}
        </span>

        <label className="wave-player-volume">
          Volume

          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(event) => {
              const audio = audioRef.current;

              if (!audio) return;

              audio.muted = false;
              audio.volume = Number(event.target.value);
              setVolume(audio.volume);
            }}
          />
        </label>

        {showSelection && (
          <div
            className="wave-player-boundaries"
            aria-label={`Selected passage: ${selectedPassage.label}`}
          >
            <span>
              Start <output>{timeLabel(start)}</output>
            </span>

            <span>
              End <output>{timeLabel(end)}</output>
            </span>
          </div>
        )}
      </div>

      {showSelection && (
        <p className="wave-player-caption">
          Selected: {selectedPassage.label}
        </p>
      )}

      {playError && <p role="alert">{playError}</p>}
    </section>
  );
}