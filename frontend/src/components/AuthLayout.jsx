import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { fetchBranding } from "../lib/org.js";
import "./auth-layout.css";

// AuthLayout — the isolated auth flow shell (SCR-PUB-07/08/09/10): a minimal
// header (org logo/name + "back to site"), centered content. No full public nav.
export default function AuthLayout() {
  const [branding, setBranding] = useState(null);

  useEffect(() => {
    fetchBranding().then((value) => {
      if (value) setBranding(value);
    });
  }, []);

  return (
    <div className="auth-shell">
      <header className="auth-shell-top">
        <Link to="/" className="auth-shell-brand">
          {branding?.logo_url ? <img src={branding.logo_url} alt="" /> : null}
          <span>{branding?.display_name || "КонференцХаб"}</span>
        </Link>
        <Link to="/" className="auth-shell-back">
          ← На сайт
        </Link>
      </header>
      <main className="auth-shell-main">
        <Outlet />
      </main>
    </div>
  );
}
