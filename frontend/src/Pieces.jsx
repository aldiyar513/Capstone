import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Recordings from "./Recordings";

async function piecesRequest(method = "GET", body) {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;
  if (!data.session) throw new Error("Please log in first.");

  const response = await fetch("/api/v1/pieces", {
    method,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Could not complete the request.");
  }

  return result;
}

export default function Pieces() {
  const [pieces, setPieces] = useState([]);
  const [title, setTitle] = useState("");
  const [instrument, setInstrument] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPieces() {
      try {
        const result = await piecesRequest();

        if (active) {
          setPieces(result.items);
        }
      } catch (error) {
        if (active) {
          setError(error.message || "Could not load pieces.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPieces();

    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const piece = await piecesRequest("POST", {
        title,
        instrument,
      });

      setPieces((previous) => [piece, ...previous]);
      setTitle("");
      setInstrument("");
      setNotice("Piece saved.");
    } catch (error) {
      setError(error.message || "Could not save the piece.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2>Your pieces</h2>

      {loading ? (
        <p>Loading pieces…</p>
      ) : (
        <>
          <form onSubmit={handleCreate}>
            <label htmlFor="piece-title">Title</label>
            <input
              id="piece-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
              required
            />

            <label htmlFor="piece-instrument">Instrument</label>
            <input
              id="piece-instrument"
              value={instrument}
              onChange={(event) => setInstrument(event.target.value)}
              disabled={saving}
              required
            />

            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create piece"}
            </button>
          </form>

          {pieces.length > 0 ? (
            <ul>
              {pieces.map((piece) => (
               <li key={piece.id}>
                <strong>{piece.title}</strong>
                {" · "}
                {piece.instrument}

                <details>
                  <summary>Recordings</summary>
                  <Recordings pieceId={piece.id} />
                </details>
              </li>
              ))}
            </ul>
          ) : (
            !error && <p>No pieces yet. Create your first one.</p>
          )}
        </>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}