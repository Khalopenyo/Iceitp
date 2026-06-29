import Toast from "../../components/Toast.jsx";
import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { apiGet, apiPut } from "../../lib/api.js";
import "./console.css";

const PLANS = [
  { id: "kafedra", name: "Кафедра", price: "19 900 ₽/год", line: "1 конференция · до 150 участников", feats: ["Регистрация и программа", "Базовые PDF-документы"], participants: 150, conferences: 1 },
  { id: "institut", name: "Институт", price: "49 900 ₽/год", line: "до 3 конференций · до 500 участников", feats: ["White-label бренд", "Чат и модерация", "Все документы"], participants: 500, conferences: 3 },
  { id: "universitet", name: "Университет", price: "129 900 ₽/год", line: "безлимит · до 3000 участников", feats: ["Поддомены и SSO", "API и интеграции", "Приоритетная поддержка"], participants: 3000, conferences: null },
];

export default function ConsoleBilling() {
  const { org, setOrg } = useOutletContext();
  const [params] = useSearchParams();
  const [stats, setStats] = useState({});
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    apiGet("/admin/landing").then((d) => setStats(d?.stats || {})).catch(() => setStats({}));
  }, []);

  const plan = org?.plan || "free";
  const current = PLANS.find((p) => p.id === plan) || null;
  const gated = params.get("gate") === "1"; // пришли по гейту публикации

  const select = async (id) => {
    setBusy(id);
    setToast(null);
    try {
      const updated = await apiPut("/admin/billing", { plan: id });
      setOrg(updated);
      setToast({ kind: "ok", text: "Тариф подключён — теперь можно опубликовать сайт." });
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось сменить тариф." });
    } finally {
      setBusy("");
    }
  };

  const limit = current || PLANS[1];
  const usage = [
    { label: "Участники", val: `${stats.participants ?? 0} / ${limit.participants}`, pct: Math.min(100, Math.round(((stats.participants ?? 0) / limit.participants) * 100)) },
    { label: "Конференции", val: `1 / ${limit.conferences ?? "∞"}`, pct: limit.conferences ? Math.round((1 / limit.conferences) * 100) : 5 },
    { label: "Хранилище", val: "2,4 / 20 ГБ", pct: 12 },
  ];

  return (
    <div className="con-screen">
      <Toast toast={toast} />

      <div className="con-eyebrow">Подписка</div>
      <h2 className="con-h2" style={{ marginBottom: 22 }}>Тариф и использование</h2>

      {gated && !current ? (
        <div className="con-toast err" role="alert" style={{ marginBottom: 18 }}>
          Чтобы опубликовать сайт и открыть регистрацию участников, выберите тариф.
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
        <div style={{ background: "var(--accent)", borderRadius: 12, padding: 24, color: "#fff" }}>
          <div style={{ fontFamily: "var(--con-mono)", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>Текущий тариф</div>
          <div style={{ fontFamily: "var(--con-head)", fontWeight: 600, fontSize: 30, margin: "10px 0 4px" }}>{current ? current.name : "Не выбран"}</div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.85)", marginBottom: 18 }}>
            {current ? `${current.price} · автопродление` : "Тариф не подключён — публикация сайта закрыта"}
          </div>
          <span style={{ display: "inline-block", background: "#fff", color: "var(--accent)", padding: "10px 18px", borderRadius: 8, fontWeight: 600, fontSize: 13.5, opacity: 0.7 }}>
            {current ? "Управлять оплатой — скоро" : "Выберите тариф ниже"}
          </span>
        </div>
        <div className="con-card">
          <div style={{ fontFamily: "var(--con-mono)", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 16 }}>Использование</div>
          {usage.map((u) => (
            <div key={u.label} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: "var(--ink)", fontWeight: 500 }}>{u.label}</span>
                <span style={{ color: "var(--muted)", fontFamily: "var(--con-mono)", fontSize: 12 }}>{u.val}</span>
              </div>
              <div style={{ height: 6, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${u.pct}%`, background: "var(--accent)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontFamily: "var(--con-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 14 }}>
        {current ? "Сменить тариф" : "Выберите тариф"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {PLANS.map((p) => {
          const cur = p.id === plan;
          return (
            <div key={p.id} style={{ background: "var(--surface)", border: `1.5px solid ${cur ? "var(--accent)" : "var(--line)"}`, borderRadius: 12, padding: 22, display: "flex", flexDirection: "column", gap: 4, boxShadow: cur ? "0 0 0 3px var(--accent-wash)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--con-head)", fontWeight: 600, fontSize: 19, color: "var(--ink)" }}>{p.name}</span>
                {cur ? <span style={{ fontFamily: "var(--con-mono)", fontSize: 10, letterSpacing: "0.08em", padding: "3px 8px", borderRadius: 999, background: "var(--accent)", color: "#fff" }}>Текущий</span> : null}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{p.line}</div>
              <div style={{ fontFamily: "var(--con-head)", fontWeight: 600, fontSize: 22, color: "var(--ink)", marginBottom: 12 }}>{p.price}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {p.feats.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--ink)" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: 2 }} aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className={`con-btn ${cur ? "con-btn-ghost" : ""}`}
                style={{ marginTop: 12, justifyContent: "center", ...(cur ? { color: "var(--faint)", cursor: "default" } : {}) }}
                onClick={() => (cur ? null : select(p.id))}
                disabled={cur || busy === p.id}
              >
                {cur ? "Текущий тариф" : busy === p.id ? "Подключаем…" : "Перейти"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
