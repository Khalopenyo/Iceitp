import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, buildApiUrl } from "../lib/api.js";
import { openUrlInNewTab, triggerBlobDownload } from "../lib/download.js";
import { icons as I } from "../components/lkIcons.jsx";
import "./lk.css";

const DOC_LIST = [
  { key: "personal_program", title: "Персональная программа", path: "/documents/program", filename: "program-personal.pdf", mode: "download", icon: "file" },
  { key: "full_program", title: "Полная программа конференции", path: "/documents/program?type=full", filename: "program-full.pdf", mode: "download", icon: "file" },
  { key: "certificate", title: "Сертификат участника", path: "/documents/certificate", filename: "certificate.pdf", mode: "download", icon: "cert" },
  { key: "proceedings", title: "Сборник трудов", path: "/documents/proceedings", mode: "external", icon: "folder" },
];

async function downloadPdf(path, filename) {
  const res = await apiGet(path);
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
}

export default function Documents() {
  const [materials, setMaterials] = useState(null);
  const [me, setMe] = useState(null);
  const [sections, setSections] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    apiGet("/documents/status").then(setMaterials).catch((e) => setError(e.message || "Не удалось загрузить документы."));
    apiGet("/me").then(setMe).catch(() => {});
    apiGet("/sections").then((r) => setSections(Array.isArray(r) ? r : [])).catch(() => setSections([]));
  }, []);

  // Модальный QR-оверлей: фокус-трап, Esc, блокировка прокрутки, возврат фокуса.
  useEffect(() => {
    if (!fullscreen) return undefined;
    const prev = document.activeElement;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
      if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [fullscreen]);

  const profile = me?.profile || {};
  const isOnline = me?.user_type === "online";
  const isAuthor = Boolean(profile.talk_title);
  const badgeAvailable = Boolean(materials?.badge?.available);
  const sectionTitle = useMemo(
    () => sections.find((s) => String(s.id) === String(profile.section_id))?.title || "",
    [sections, profile.section_id]
  );
  const badgeSub = [isOnline ? "Онлайн" : "Офлайн", isAuthor ? "Автор" : "Слушатель", sectionTitle ? `Секция «${sectionTitle}»` : null]
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
                <span className="lk-li-ic">{I[item.icon]}</span>
                <span className="lk-li-tx">
                  <b>{item.title}</b>
                  {available ? (
                    <span className="lk-chip lk-chip-ok" style={{ marginTop: "3px" }}>Готов</span>
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
          <button ref={closeRef} type="button" className="lk-qr-close" aria-label="Закрыть" onClick={(e) => { e.stopPropagation(); setFullscreen(false); }}>{I.close}</button>
          <img src={buildApiUrl("/documents/badge/qr")} alt="QR-код бейджа участника" onClick={(e) => e.stopPropagation()} />
          <div className="lk-qr-overlay-name">{profile.full_name || "Участник"}</div>
          {badgeSub ? <div className="lk-qr-overlay-sub">{badgeSub}</div> : null}
        </div>
      ) : null}
    </>
  );
}
