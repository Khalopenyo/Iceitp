import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../lib/api.js";
import "../console/console.css";
import "./ops.css";

export default function OpsDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiGet("/ops/stats").then(setStats).catch(() => setError(true));
  }, []);

  const t = stats?.tenants || {};
  const plans = stats?.plans || {};

  const kpis = [
    { label: "Тенанты", val: t.total ?? 0, note: `${t.active ?? 0} активных · ${t.suspended ?? 0} приостановлено · ${t.archived ?? 0} в архиве` },
    { label: "Платные подписки", val: plans.paid ?? 0, note: `${plans.free ?? 0} на бесплатном тарифе` },
    { label: "Конференции", val: stats?.conferences ?? 0, note: "всего на платформе" },
    { label: "Участники", val: stats?.participants ?? 0, note: "по всем вузам" },
  ];

  return (
    <div className="con-screen">
      <div className="con-eyebrow">Оператор · платформа</div>
      <h2 className="con-h2" style={{ marginBottom: 22 }}>Обзор платформы</h2>

      {error ? (
        <div className="con-toast err" role="alert" style={{ marginBottom: 18 }}>
          Не удалось загрузить показатели платформы. Обновите страницу.
        </div>
      ) : null}

      <div className="con-stats">
        {kpis.map((k) => (
          <div className="con-stat" key={k.label}>
            <div className="con-stat-label">{k.label}</div>
            <div className="con-stat-val">{k.val}</div>
            <div className="con-stat-note">{k.note}</div>
          </div>
        ))}
      </div>

      <div className="con-grid-2" style={{ marginTop: 22 }}>
        <div className="con-card">
          <div className="con-card-title">Требуют внимания</div>
          <button type="button" className="ops-attn" onClick={() => navigate("/ops/tenants?status=suspended")}>
            <span className="ops-attn-ic ops-attn-danger" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
            </span>
            <span className="ops-attn-tx"><b>Приостановленные тенанты</b><span>Сайты заблокированы — требуется решение</span></span>
            <span className="ops-attn-val">{t.suspended ?? 0}</span>
          </button>
          <button type="button" className="ops-attn" onClick={() => navigate("/ops/tenants?plan=free")}>
            <span className="ops-attn-ic ops-attn-warn" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18v12H3zM3 11h18" /></svg>
            </span>
            <span className="ops-attn-tx"><b>На бесплатном тарифе</b><span>Не оплатили публикацию сайта</span></span>
            <span className="ops-attn-val">{plans.free ?? 0}</span>
          </button>
        </div>

        <div className="con-card">
          <div className="con-card-title">Распределение тенантов</div>
          <OpsBar label="Активные" value={t.active ?? 0} total={t.total ?? 0} tone="ok" />
          <OpsBar label="Приостановлены" value={t.suspended ?? 0} total={t.total ?? 0} tone="danger" />
          <OpsBar label="В архиве" value={t.archived ?? 0} total={t.total ?? 0} tone="muted" />
        </div>
      </div>
    </div>
  );
}

function OpsBar({ label, value, total, tone }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: "var(--ink)", fontWeight: 500 }}>{label}</span>
        <span style={{ color: "var(--muted)", fontFamily: "var(--con-mono)", fontSize: 12 }}>{value} · {pct}%</span>
      </div>
      <div className="ops-bar"><span className={`ops-bar-fill ops-bar-${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
