import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import RecordingPlayer from "./RecordingPlayer";
import "./Recordings.css";

async function getToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;
  if (!data.session) throw new Error("Please log in first.");

  return data.session.access_token;
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);

  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function uploadAudio(url, token, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let result;

      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("The server returned an unexpected response."));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(result);
      } else {
        reject(new Error(result.error || "Upload failed."));
      }
    };

    xhr.onerror = () => {
      reject(
        new Error(
          "Connection lost. Refresh to check whether the recording saved."
        )
      );
    };

    xhr.ontimeout = () => {
      reject(
        new Error(
          "Request timed out. Refresh to check whether the recording saved."
        )
      );
    };

    xhr.open("POST", url);
    xhr.timeout = 180000;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

export default function Recordings({ pieceId }) {
  const inputId = useId();
  const fileInput = useRef(null);
  const uploadDialog = useRef(null);

  const [recordings, setRecordings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  const url = `/api/v1/pieces/${pieceId}/recordings`;

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecordings() {
      setLoading(true);
      setError("");

      try {
        const token = await getToken();
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not load recordings.");
        }

        if (!controller.signal.aborted) {
          setRecordings(
            [...result.items].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            )
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error.message || "Could not load recordings.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadRecordings();

    return () => controller.abort();
  }, [url, revision]);

  function resetUpload() {
    setTitle("");
    setFile(null);
    setUploadError("");
    setProgress(0);

    if (fileInput.current) {
      fileInput.current.value = "";
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (uploading) return;
    setUploadError("");
    setNotice("");

    if (!file) {
      setUploadError("Choose an audio file.");
      return;
    }

    if (!/\.(mp3|wav|m4a)$/i.test(file.name)) {
      setUploadError("Choose an MP3, WAV, or M4A file.");
      return;
    }

    if (file.size === 0 || file.size > 25 * 1024 * 1024) {
      setUploadError("Choose a nonempty file no larger than 25 MiB.");
      return;
    }

    if (!title.trim()) {
      setUploadError("Enter a recording title.");
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const token = await getToken();
      const formData = new FormData();

      formData.append("title", title.trim());
      formData.append("file", file);

      await uploadAudio(url, token, formData, setProgress);

      uploadDialog.current?.close();

      setNotice("Recording saved.");
      setRevision((previous) => previous + 1);
    } catch (error) {
      setUploadError(error.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function openRecording(recordingId) {
    setNotice("");
    setSelectedId(recordingId);
  }

  const selectedRecording =
    recordings.find((recording) => recording.id === selectedId) || null;

  if (selectedRecording) {
    return (
      <section
        className="recording-review"
        aria-labelledby={`${inputId}-review-title`}
      >
        <header className="recording-review-header">
          <div>
            <h1 id={`${inputId}-review-title`}>
              {selectedRecording.title}
            </h1>

            <p className="recording-review-meta">
              {new Date(selectedRecording.created_at).toLocaleDateString(
                undefined,
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }
              )}

              {selectedRecording.duration_ms != null &&
                ` · ${formatDuration(selectedRecording.duration_ms)}`}
            </p>
          </div>

          <button
            type="button"
            className="review-back"
            onClick={() => setSelectedId(null)}
          >
            ← Recording history
          </button>
        </header>

        <RecordingPlayer
          key={selectedRecording.id}
          recordingId={selectedRecording.id}
        />
      </section>
    );
  }

  return (
    <section>
      <div className="recording-history-heading">
        <h3>Recording history</h3>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => uploadDialog.current?.showModal()}
        >
          + Upload recording
        </button>
      </div>

      <dialog
        ref={uploadDialog}
        className="recording-upload-dialog"
        aria-labelledby={`${inputId}-upload-heading`}
        onCancel={(event) => {
          if (uploading) event.preventDefault();
        }}
        onClose={resetUpload}
      >
        <h3 id={`${inputId}-upload-heading`}>Upload recording</h3>
        <p>Choose an MP3, WAV, or M4A file up to 25 MiB.</p>

        <form onSubmit={handleUpload}>
          <label htmlFor={`${inputId}-title`}>Recording title</label>
          <input
            id={`${inputId}-title`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={uploading}
            required
          />

          <label htmlFor={`${inputId}-file`}>Audio file</label>
          <input
            id={`${inputId}-file`}
            ref={fileInput}
            type="file"
            accept=".mp3,.wav,.m4a"
            onChange={(event) => setFile(event.target.files[0] || null)}
            disabled={uploading}
            required
          />

          {uploadError && <p role="alert">{uploadError}</p>}

          <div className="recording-upload-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => uploadDialog.current?.close()}
              disabled={uploading}
            >
              Cancel
            </button>
            <button type="submit" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload recording"}
            </button>
          </div>
        </form>

        {uploading && (
          <div role="status">
            <progress
              value={progress}
              max="100"
              aria-label="Transfer to backend"
            />
            <p>
              {progress < 100
                ? `Sending to backend: ${progress}%`
                : "Saving audio and recording details…"}
            </p>
          </div>
        )}
      </dialog>

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {loading ? (
        <p>Loading recordings…</p>
      ) : recordings.length > 0 ? (
        <ul className="recording-history-list">
          {recordings.map((recording) => (
            <li key={recording.id} className="recording-history-row">
              <div>
                <strong>{recording.title}</strong>
                <p>
                  Uploaded {new Date(recording.created_at).toLocaleString()}
                  {recording.duration_ms != null && (
                    <>{" · "}{formatDuration(recording.duration_ms)}</>
                  )}
                </p>
              </div>

              <button
                type="button"
                aria-label={`Open recording: ${recording.title}`}
                onClick={() => openRecording(recording.id)}
              >
                Open recording
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !error && <p>No recordings yet. Select “Upload recording” to add your first attempt.</p>
      )}
    </section>
  );
}
