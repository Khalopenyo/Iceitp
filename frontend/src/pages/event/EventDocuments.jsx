import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { apiGet, buildApiUrl } from "../../lib/api.js";
import { openUrlInNewTab, triggerBlobDownload } from "../../lib/download.js";
import "./event.css";

const DOC_LIST = [
  { key: "personal_program", title: "Персональная программа", desc: "Ваше расписание докладов и секций", path: "/documents/program", filename: "program-personal.pdf", mode: "download" },
  { key: "full_program", title: "Полная программа конференции", desc: "Все секции и доклады", path: "/documents/program?type=full", filename: "program-full.pdf", mode: "download" },
  { key: "certificate", title: "Сертификат участника", desc: "Подтверждение участия", path: "/documents/certificate", filename: "certificate.pdf", mode: "download" },
  { key: "proceedings", title: "Сборник трудов", desc: "Электронный сборник конференции", path: "/documents/proceedings", mode: "external" },
];

async function downloadPdf(path, filename) {
  const res = await apiGet(path);
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
}

// EventDocuments — раздел «Документы» участника в зоне EventShell (по прототипу:
// список слева + предпросмотр справа). Сохраняет всю логику бейджа/QR/скачивания.
export default function EventDocuments() {
  const { user } = useOutletContext();
  const [materials, setMaterials] = useState(null);
  const [me, setMe] = useState(null);
  const [sections, setSections] = useState([]);
  const [selected, setSelected] = useState("badge");
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

  const profile = me?.profile || user?.profile || {};
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

  const selectedDoc = DOC_LIST.find((d) => d.key === selected);
  const selMat = selected !== "badge" ? materials?.[selected] : null;
  const selAvailable = Boolean(selMat?.available);

  return (
    <div className="ev-page" data-screen-label="Документы">
      <div className="ev-page-eyebrow">Документы · PDF</div>
      <h1 className="ev-page-h tight">Ваши материалы</h1>

      {error ? <p className="ev-empty" role="alert" style={{ color: "#b42318" }}>{error}</p> : null}

      <div className="ev-docs-grid">
        {/* Список документов */}
        <div className="ev-doc-list">
          <button type="button" className={`ev-doc-row${selected === "badge" ? " active" : ""}`} onClick={() => setSelected("badge")}>
            <span className="ev-doc-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M7 18a5 5 0 0 1 10 0" /></svg>
            </span>
            <span className="ev-doc-tx">
              <b>Бейдж участника (QR)</b>
              <span className={`ev-doc-status${badgeAvailable ? " ok" : ""}`}>{badgeAvailable ? "Готов" : (materials?.badge?.message || "Для офлайн-участников")}</span>
            </span>
          </button>

          {DOC_LIST.map((item) => {
            const m = materials?.[item.key];
            const available = Boolean(m?.available);
            const notApplicable = m?.status === "not_applicable";
            return (
              <button key={item.key} type="button" className={`ev-doc-row${selected === item.key ? " active" : ""}`} onClick={() => setSelected(item.key)}>
                <span className="ev-doc-ic" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>
                </span>
                <span className="ev-doc-tx">
                  <b>{item.title}</b>
                  <span className={`ev-doc-status${available ? " ok" : ""}`}>
                    {available ? "Готов" : notApplicable ? "Не требуется для вашего формата" : m?.message || "Откроется позже"}
                  </span>
                </span>
              </button>
            );
          })}

          <Link to="/verify" className="ev-doc-row" style={{ textDecoration: "none" }}>
            <span className="ev-doc-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 4v5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V7z" /><path d="M9 12l2 2 4-4" /></svg>
            </span>
            <span className="ev-doc-tx">
              <b>Проверка подлинности</b>
              <span className="ev-doc-status">Публичная верификация сертификата →</span>
            </span>
          </Link>
        </div>

        {/* Предпросмотр */}
        <div className="ev-doc-preview">
          <div className="ev-dash-card-lab">Предпросмотр</div>

          {selected === "badge" ? (
            badgeAvailable ? (
              <div style={{ textAlign: "center" }}>
                <button type="button" className="ev-qr" onClick={() => setFullscreen(true)} aria-label="Открыть QR на весь экран">
                  <img src={buildApiUrl("/documents/badge/qr")} alt="QR-код бейджа участника" />
                </button>
                <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ev-ink)", marginTop: 12 }}>{profile.full_name || "Участник"}</div>
                {badgeSub ? <div style={{ fontSize: 12.5, color: "var(--ev-muted)", marginTop: 2 }}>{badgeSub}</div> : null}
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                  <button type="button" className="ev-btn-sm primary" onClick={() => setFullscreen(true)}>На весь экран</button>
                  <button type="button" className="ev-btn-sm ghost" onClick={downloadBadge} disabled={busy === "badge"}>{busy === "badge" ? "…" : "Скачать PDF"}</button>
                </div>
                <div style={{ fontSize: 12, color: "var(--ev-faint)", marginTop: 10 }}>Доступен офлайн через PWA-кэш</div>
              </div>
            ) : (
              <div className="ev-doc-empty">
                {materials?.badge?.message || "QR-бейдж нужен только офлайн-участникам для регистрации на площадке."}
              </div>
            )
          ) : (
            <div style={{ textAlign: "center" }}>
              <div className="ev-doc-mock" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--ev-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ev-ink)" }}>{selectedDoc?.title}</div>
              <p className="ev-doc-empty" style={{ marginTop: 6 }}>
                {selAvailable ? selectedDoc?.desc : (selMat?.status === "not_applicable" ? "Не требуется для вашего формата участия." : selMat?.message || "Документ откроется позже.")}
              </p>
              <button
                type="button"
                className="ev-btn-sm primary"
                style={{ marginTop: 8 }}
                disabled={!selAvailable || busy === selected}
                onClick={() => selectedDoc && handle(selectedDoc)}
              >
                {busy === selected ? "…" : selectedDoc?.mode === "external" ? "Открыть" : "Скачать PDF"}
              </button>
            </div>
          )}
        </div>
      </div>

      {fullscreen && badgeAvailable ? (
        <div className="ev-qr-overlay" role="dialog" aria-modal="true" aria-label="QR-код бейджа" onClick={() => setFullscreen(false)}>
          <button ref={closeRef} type="button" className="ev-qr-close" aria-label="Закрыть" onClick={(e) => { e.stopPropagation(); setFullscreen(false); }}>✕</button>
          <img src={buildApiUrl("/documents/badge/qr")} alt="QR-код бейджа участника" onClick={(e) => e.stopPropagation()} />
          <div className="ev-qr-overlay-name">{profile.full_name || "Участник"}</div>
          {badgeSub ? <div className="ev-qr-overlay-sub">{badgeSub}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
