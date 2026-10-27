import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import RecordingPlayer from "./RecordingPlayer";

async function getToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;
  if (!data.session) throw new Error("Please log in first.");

  return data.session.access_token;
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
      reject(new Error(
        "Connection lost. Refresh to check whether the recording saved."
      ));
    };

    xhr.ontimeout = () => {
      reject(new Error(
        "Request timed out. Refresh to check whether the recording saved."
      ));
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

  const [recordings, setRecordings] = useState([]);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  const url = `/api/v1/pieces/${pieceId}/recordings`;

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecordings() {
      setLoading(true);

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
          setRecordings(result.items);
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

  async function handleUpload(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!file) {
      setError("Choose an audio file.");
      return;
    }

    if (!/\.(mp3|wav|m4a)$/i.test(file.name)) {
      setError("Choose an MP3, WAV, or M4A file.");
      return;
    }

    if (file.size === 0 || file.size > 25 * 1024 * 1024) {
      setError("Choose a nonempty file no larger than 25 MiB.");
      return;
    }

    if (!title.trim()) {
      setError("Enter a recording title.");
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

      setTitle("");
      setFile(null);
      fileInput.current.value = "";
      setNotice("Recording saved.");
      setRevision((previous) => previous + 1);
    } catch (error) {
      setError(error.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section>
      <h3>Recordings</h3>

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

        <button type="submit" disabled={uploading}>
          {uploading ? "Uploading…" : "Upload recording"}
        </button>
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

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {loading ? (
        <p>Loading recordings…</p>
      ) : recordings.length > 0 ? (
        <ul>
          {recordings.map((recording) => (
            <li key={recording.id}>
                <strong>{recording.title}</strong>
                {" · "}
                {new Date(recording.created_at).toLocaleString()}

                <RecordingPlayer recordingId={recording.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p>No recordings loaded.</p>
      )}
    </section>
  );
}