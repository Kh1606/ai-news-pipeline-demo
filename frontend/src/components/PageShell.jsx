export default function PageShell({ children }) {
  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">AI News Pipeline</div>
          <div className="topbar-note">Global AI News Intelligence — Demo</div>
        </div>
      </header>

      <main className="main">
        <div className="frame">
          {children}
        </div>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          © 2026 Azimjon Khusanboev — AI News Pipeline Demo
        </div>
      </footer>
    </div>
  );
}
