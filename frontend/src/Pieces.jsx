import { useEffect, useRef, useState } from "react";
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
  const [query, setQuery] = useState("");
  const [view, setView] = useState("list");
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const headingRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function loadPieces() {
      try {
        const result = await piecesRequest();

        if (active) setPieces(result.items);
      } catch (error) {
        if (active) {
          setError(error.message || "Could not load pieces.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPieces();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [view]);

  function openCreate() {
    setError("");
    setNotice("");
    setShowDetails(false);
    setView("create");
  }

  function openPiece(piece) {
    setSelectedPiece(piece);
    setError("");
    setNotice("");
    setShowDetails(false);
    setView("piece");
  }

  function returnToList() {
    setView("list");
    setSelectedPiece(null);
    setShowDetails(false);
    setError("");
  }

  async function handleCreate(event) {
    event.preventDefault();

    if (saving) return;

    const cleanTitle = title.trim();
    const cleanInstrument = instrument.trim();

    if (!cleanTitle || !cleanInstrument) {
      setError("Enter a title and instrument.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const piece = await piecesRequest("POST", {
        title: cleanTitle,
        instrument: cleanInstrument,
      });

      setPieces((previous) => [piece, ...previous]);
      setTitle("");
      setInstrument("");
      setQuery("");
      setNotice("Piece saved.");
      setView("list");
    } catch (error) {
      setError(error.message || "Could not save the piece.");
    } finally {
      setSaving(false);
    }
  }

  const search = query.trim().toLowerCase();

  const filteredPieces = pieces.filter((piece) =>
    `${piece.title} ${piece.instrument}`.toLowerCase().includes(search)
  );

  if (view === "create") {
    return (
      <section>
        <button
          type="button"
          className="back-button"
          onClick={returnToList}
          disabled={saving}
        >
          ← My pieces
        </button>

        <div className="page-heading">
          <h1 ref={headingRef} tabIndex={-1}>
            New piece
          </h1>
        </div>

        <form className="piece-form surface-card" onSubmit={handleCreate}>
          <label htmlFor="piece-title">Title</label>
          <input
            id="piece-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="For example, Fur Elise"
            disabled={saving}
            required
          />

          <label htmlFor="piece-instrument">Instrument</label>
          <input
            id="piece-instrument"
            value={instrument}
            onChange={(event) => setInstrument(event.target.value)}
            placeholder="For example, Piano"
            disabled={saving}
            required
          />

          {error && <p className="error-message" role="alert">{error}</p>}

          <div className="form-actions">
            <button
              type="submit"
              disabled={saving || !title.trim() || !instrument.trim()}
            >
              {saving ? "Saving…" : "Create piece"}
            </button>

            <button
              type="button"
              className="secondary"
              onClick={returnToList}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  }

  if (view === "piece" && selectedPiece) {
    return (
      <section className="piece-workspace">
        <div className="piece-context-bar">
          <button
            type="button"
            className="context-back"
            onClick={returnToList}
          >
            ← My pieces
          </button>

          <div className="piece-context">
            <span className="piece-context-title">
              {selectedPiece.title}
            </span>

            <span className="piece-context-instrument">
              {selectedPiece.instrument}
            </span>
          </div>
        </div>

        <div className="recordings-content">
          <Recordings
            key={selectedPiece.id}
            pieceId={selectedPiece.id}
          />
        </div>
      </section>
    );
  }
  return (
    <section>
      <div className="page-heading">
        <h1 ref={headingRef} tabIndex={-1}>My pieces</h1>

        <button
          type="button"
          className="secondary"
          aria-expanded={showDetails}
          aria-controls="pieces-details"
          onClick={() => setShowDetails((previous) => !previous)}
        >
          Details
        </button>
      </div>

      {showDetails && (
        <div id="pieces-details" className="details-panel">
          <p>
            Keep recordings together under a piece or exercise.
            Open a piece to upload an attempt, listen to recordings
            and revisit your comments.
          </p>
        </div>
      )}

      <div className="pieces-toolbar">
        <label className="visually-hidden" htmlFor="pieces-search">
          Search pieces or instruments
        </label>

        <input
          id="pieces-search"
          type="search"
          placeholder="Search pieces or instruments"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <button type="button" onClick={openCreate} disabled={loading}>
          + New piece
        </button>
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}

      {loading ? (
        <p role="status">Loading pieces…</p>
      ) : filteredPieces.length > 0 ? (
        <ul className="pieces-list">
          {filteredPieces.map((piece) => (
            <li className="piece-card" key={piece.id}>
              <div className="piece-card-copy">
                <h2>{piece.title}</h2>
                <p>{piece.instrument}</p>
              </div>

              <button
                type="button"
                aria-label={`Open piece: ${piece.title}`}
                onClick={() => openPiece(piece)}
              >
                Open piece
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !error && (
          <div className="empty-state">
            <h2>{search ? "No matching pieces" : "Your practice starts here"}</h2>
            <p>
              {search
                ? "Try another title or instrument."
                : "Create a piece or exercise to organise your recordings."}
            </p>
          </div>
        )
      )}
    </section>
  );
}