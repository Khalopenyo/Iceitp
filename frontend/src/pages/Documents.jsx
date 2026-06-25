import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, buildApiUrl } from "../lib/api.js";
import { openUrlInNewTab, triggerBlobDownload } from "../lib/download.js";
import "./lk.css";

const DOC_LIST = [
  { key: "full_program", title: "Полная программа конференции", path: "/documents/program?type=full", filename: "program-full.pdf", mode: "download" },
  { key: "certificate", title: "Сертификат участника", path: "/documents/certificate", filename: "certificate.pdf", mode: "download" },
  { key: "proceedings", title: "Сборник трудов", path: "/documents/proceedings", mode: "external" },
];

const I = {
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>,
  id: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 9h4M14 13h4M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2"/></svg>,
  eye: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12c1.5-3.5 5-7 9-7s7.5 3.5 9 7c-1.5 3.5-5 7-9 7s-7.5-3.5-9-7Z"/><circle cx="12" cy="12" r="2.6"/></svg>,
  file: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>,
  cert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="9" r="5"/><path d="m8.5 13-1.5 8 5-3 5 3-1.5-8"/></svg>,
  folder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/></svg>,
  cloud: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18H7Z"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>,
};

const listIcon = { full_program: "file", certificate: "cert", proceedings: "folder" };

async function downloadPdf(path, filename) {
  const res = await apiGet(path);
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
}

export default function Documents() {
  const [materials, setMaterials] = useState(null);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    apiGet("/documents/status").then(setMaterials).catch((e) => setError(e.message || "Не удалось загрузить документы."));
    apiGet("/me").then(setMe).catch(() => {});
  }, []);

  const profile = me?.profile || {};
  const isOnline = me?.user_type === "online";
  const isAuthor = Boolean(profile.talk_title);
  const badgeAvailable = Boolean(materials?.badge?.available);
  const badgeSub = [isOnline ? "Онлайн" : "Офлайн", isAuthor ? "Автор" : "Слушатель", profile.section_title ? `Секция «${profile.section_title}»` : null]
    .filter(Boolean)
    .join(" · ");

  const handle = async (item) => {
    const m = materials?.[item.key];
    if (!m?.available) return;
    setBusy(item.key);
    setError("");
    try {
      if (item.mode === "external") {
        const url = m.url || (await apiGet(item.path))?.url;
        if (!url) throw new Error("Документ пока недоступен.");
        openUrlInNewTab(url);
      } else {
        await downloadPdf(item.path, item.filename);
      }
    } catch (e) {
      setError(e.message || "Не удалось открыть документ.");
    } finally {
      setBusy("");
    }
  };

  const downloadBadge = async () => {
    setBusy("badge");
    setError("");
    try {
      await downloadPdf("/documents/badge", "badge.pdf");
    } catch (e) {
      setError(e.message || "Не удалось скачать бейдж.");
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <div className="lk-topbar">
        <div className="lk-topbar-title">Документы</div>
        <div className="lk-spacer" />
        <span className="lk-chip">{I.cloud} Офлайн-доступ</span>
      </div>

      <div className="lk-main">
        {error ? <div className="ui-status ui-status-error" role="alert" style={{ marginBottom: "10px" }}>{error}</div> : null}

        {/* Крупный QR-бейдж */}
        <div className="lk-card" style={{ textAlign: "center" }}>
          <div className="lk-chips" style={{ justifyContent: "center", marginBottom: "10px" }}>
            <span className="lk-chip lk-chip-solid">{I.id} Бейдж участника</span>
          </div>
          {badgeAvailable ? (
            <>
              <button type="button" className="lk-qr" onClick={() => setFullscreen(true)} aria-label="Открыть QR на весь экран">
                <img src={buildApiUrl("/documents/badge/qr")} alt="QR-код бейджа участника" />
              </button>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>{profile.full_name || "Участник"}</div>
              {badgeSub ? <div className="lk-topbar-sub" style={{ marginTop: "2px" }}>{badgeSub}</div> : null}
              <div className="lk-chips" style={{ justifyContent: "center", marginTop: "10px" }}>
                <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setFullscreen(true)}>{I.eye} На весь экран</button>
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={downloadBadge} disabled={busy === "badge"}>
                  {I.download} {busy === "badge" ? "…" : "Скачать PDF"}
                </button>
              </div>
              <div className="lk-note" style={{ justifyContent: "center", marginTop: "8px" }}>{I.cloud} Доступен офлайн через PWA-кэш</div>
            </>
          ) : (
            <p className="lk-note" style={{ justifyContent: "center", margin: "6px 0 0" }}>
              {materials?.badge?.message || "QR-бейдж нужен только офлайн-участникам для регистрации на площадке."}
            </p>
          )}
        </div>

        {/* Мои документы */}
        <div className="lk-h3">Мои документы</div>
        <div className="lk-list">
          {DOC_LIST.map((item) => {
            const m = materials?.[item.key];
            const available = Boolean(m?.available);
            const notApplicable = m?.status === "not_applicable";
            return (
              <div key={item.key} className="lk-li" style={{ cursor: "default" }}>
                <span className="lk-li-ic">{I[listIcon[item.key]]}</span>
                <span className="lk-li-tx">
                  <b>{item.title}</b>
                  {available ? (
                    <span className="lk-chip lk-chip-ok" style={{ display: "inline-flex", marginTop: "3px" }}>Готов</span>
                  ) : (
                    <span>{notApplicable ? "Не требуется для вашего формата" : m?.message || "Откроется позже"}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="lk-iconbtn"
                  onClick={() => handle(item)}
                  disabled={!available || busy === item.key}
                  aria-label={`Открыть: ${item.title}`}
                >
                  {I.download}
                </button>
              </div>
            );
          })}
        </div>

        {/* Проверка подлинности */}
        <div className="lk-card-flat" style={{ marginTop: "14px" }}>
          <div className="lk-meta">{I.shield} Проверка подлинности сертификата</div>
          <Link to="/verify" className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-block" style={{ marginTop: "8px" }}>
            Открыть публичную верификацию
          </Link>
        </div>
      </div>

      {fullscreen && badgeAvailable ? (
        <div className="lk-qr-overlay" role="dialog" aria-modal="true" aria-label="QR-код бейджа" onClick={() => setFullscreen(false)}>
          <button type="button" className="lk-qr-close" aria-label="Закрыть">{I.close}</button>
          <img src={buildApiUrl("/documents/badge/qr")} alt="QR-код бейджа участника" onClick={(e) => e.stopPropagation()} />
          <div className="lk-qr-overlay-name">{profile.full_name || "Участник"}</div>
          {badgeSub ? <div className="lk-qr-overlay-sub">{badgeSub}</div> : null}
        </div>
      ) : null}
    </>
  );
}
