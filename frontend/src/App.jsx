import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import "./App.css";

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCheckingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const credentials = { email: email.trim(), password };

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp(credentials);

        if (error) throw error;

        setMessage(
          data.session
            ? "You are signed in."
            : "Check your email for a confirmation link, then log in."
        );
      } else {
        const { error } =
          await supabase.auth.signInWithPassword(credentials);

        if (error) throw error;
      }

      setPassword("");
    } catch (error) {
      setMessage(error.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setMessage(error.message || "Could not log out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    setMessage("");
    setPassword("");
  }

  if (checkingSession) {
    return <main className="auth-card">Loading…</main>;
  }

  if (session) {
    return (
      <main className="auth-card">
        <h1>You’re signed in</h1>
        <p>{session.user.email}</p>

        <button onClick={handleLogout} disabled={busy}>
          {busy ? "Logging out…" : "Log out"}
        </button>

        {message && <p role="status">{message}</p>}
      </main>
    );
  }

  return (
    <main className="auth-card">
      <h1>{mode === "login" ? "Log in" : "Create an account"}</h1>

      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete={
            mode === "login" ? "current-password" : "new-password"
          }
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
          required
        />

        <button type="submit" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Log in"
              : "Sign up"}
        </button>
      </form>

      {message && <p role="status">{message}</p>}

      <button
        className="secondary"
        type="button"
        onClick={switchMode}
        disabled={busy}
      >
        {mode === "login"
          ? "Need an account? Sign up"
          : "Already have an account? Log in"}
      </button>
    </main>
  );
}