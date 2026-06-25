import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiGet } from "../../lib/api.js";
import { triggerBlobDownload } from "../../lib/download.js";
import "./console.css";

export default function ConsoleDocs() {
  const { conference } = useOutletContext();
  const [stats, setStats] = useState({});
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    apiGet("/landing").then((d) => setStats(d?.stats || {})).catch(() => setStats({}));
  }, []);

  const finished = conference?.status === "finished";

  const downloadProgram = async () => {
    setBusy("program");
    setToast(null);
    try {
      const res = await apiGet("/documents/program?type=full");
      const blob = await res.blob();
      triggerBlobDownload(blob, "program-konferencii.pdf");
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось скачать программу." });
    } finally {
      setBusy("");
    }
  };

  const cards = [
    {
      key: "badges",
      icon: "M3 5h18v14H3zM7 9h2M7 13h6",
      title: "Бейджи с QR",
      desc: `${stats.participants ?? 0} персональных бейджей для офлайн check-in`,
      meta: "PDF · A6",
      action: { label: "Массовая генерация — скоро", disabled: true },
    },
    {
      key: "certs",
      icon: "M12 14a5 5 0 100-10 5 5 0 000 10zM8.5 13l-1.5 8 5-3 5 3-1.5-8",
      title: "Сертификаты участника",
      desc: `Именные, по данным доклада · ${stats.talks ?? 0} докладчиков`,
      meta: "PDF · A4",
      action: { label: "Массовая генерация — скоро", disabled: true },
    },
    {
      key: "program",
      icon: "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6",
      title: "Программа конференции",
      desc: "Полная сетка секций, залов и докладов",
      meta: "PDF",
      action: { label: busy === "program" ? "Готовим…" : "Скачать PDF", onClick: downloadProgram, primary: true },
    },
    {
      key: "proceedings",
      icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
      title: "Сборник трудов",
      desc: finished ? "Доступен после завершения конференции" : "Откроется после завершения конференции",
      meta: finished ? "PDF" : "запланировано",
      action: { label: finished ? "Открыть" : "Запланировано", disabled: !finished },
    },
  ];

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role="status">{toast.text}</div> : null}

      <div className="con-eyebrow">Документы · автогенерация</div>
      <h2 className="con-h2" style={{ marginBottom: 22 }}>Генерация материалов</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {cards.map((d) => (
          <div key={d.key} className="con-card" style={{ display: "flex", gap: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: 10, background: "var(--accent-wash)", color: "var(--accent)", display: "grid", placeItems: "center", flex: "none" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d.icon} /></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{d.title}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "3px 0 14px", lineHeight: 1.45 }}>{d.desc}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button
                  className={`con-btn ${d.action.primary ? "" : "con-btn-ghost"}`}
                  style={{ padding: "9px 14px", fontSize: 13 }}
                  onClick={d.action.onClick}
                  disabled={d.action.disabled || (d.action.onClick && busy === d.key)}
                >
                  {d.action.label}
                </button>
                <span style={{ fontFamily: "var(--con-mono)", fontSize: 11.5, color: "var(--faint)" }}>{d.meta}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
