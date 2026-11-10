import { useEffect, useRef, useState } from "react";

export default function WorkspaceShell({
  accountName,
  email,
  busy,
  onHome,
  onLogout,
  children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    function handlePointerDown(event) {
      // Desktop navigation stays open while working in the page.
      if (!window.matchMedia("(max-width: 760px)").matches) return;

      if (
        drawerRef.current?.contains(event.target) ||
        menuButtonRef.current?.contains(event.target)
      ) {
        return;
      }

      setMenuOpen(false);
    }

    function handleFocusIn(event) {
      if (!window.matchMedia("(max-width: 760px)").matches) return;

      if (
        !drawerRef.current?.contains(event.target) &&
        !menuButtonRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [menuOpen]);

  function openHome() {
    onHome();

    if (window.matchMedia("(max-width: 760px)").matches) {
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
  }

  return (
    <div className={`app-shell${menuOpen ? " menu-is-open" : ""}`}>
      <header className="app-header">
        <div className="header-navigation">
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="workspace-navigation"
            onClick={() => setMenuOpen((previous) => !previous)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path d="M6 6L18 18M18 6L6 18" />
              ) : (
                <path d="M4 6H20M4 12H20M4 18H20" />
              )}
            </svg>
            <span>Menu</span>
          </button>

          <button
            type="button"
            className="workspace-home"
            onClick={openHome}
          >
            My practice
          </button>
        </div>

        <div className="account-summary" title={email}>
          <span className="account-avatar" aria-hidden="true">
            {accountName.charAt(0).toUpperCase()}
          </span>
          <span className="account-name">{accountName}</span>
        </div>
      </header>

      <div className="workspace-body">
        <aside
          ref={drawerRef}
          id="workspace-navigation"
          className="navigation-drawer"
          aria-label="Workspace navigation"
          aria-hidden={!menuOpen}
          inert={!menuOpen ? true : undefined}
        >
          <div className="drawer-heading">My practice</div>

          <nav aria-label="Main navigation">
            <button
              type="button"
              className="drawer-link"
              onClick={openHome}
            >
              My pieces
            </button>
          </nav>

          <div className="drawer-footer">
            <p>{email}</p>

            <button
              type="button"
              className="drawer-logout"
              onClick={onLogout}
              disabled={busy}
            >
              {busy ? "Logging out…" : "Log out"}
            </button>
          </div>
        </aside>

        <main className="workspace-panel">{children}</main>
      </div>
    </div>
  );
}