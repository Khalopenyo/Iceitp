import { useEffect, useState } from "react";
import { apiGet, buildApiUrl } from "../lib/api.js";
import { openUrlInNewTab, triggerBlobDownload } from "../lib/download.js";

const materialCards = [
  {
    key: "full_program",
    title: "Полная программа",
    description: "Общая PDF-программа конференции с утвержденными секциями и докладами.",
    actionLabel: "Скачать PDF",
    filename: "program-full.pdf",
    path: "/documents/program?type=full",
    mode: "download",
  },
  {
    key: "badge",
    title: "Бейдж с QR",
    description: "Используется для быстрой регистрации на площадке и check-in.",
    actionLabel: "Скачать PDF",
    filename: "badge.pdf",
    path: "/documents/badge",
    mode: "download",
  },
  {
    key: "certificate",
    title: "Сертификат участника",
    description: "Подтверждение участия после выполнения условий допуска к выдаче сертификата.",
    actionLabel: "Скачать PDF",
    filename: "certificate.pdf",
    path: "/documents/certificate",
    mode: "download",
  },
  {
    key: "proceedings",
    title: "Сборник трудов",
    description: "Публикуется после завершения конференции и открытия доступа оргкомитетом.",
    actionLabel: "Открыть сборник",
    filename: "",
    path: "/documents/proceedings",
    mode: "external",
  },
];

async function downloadPdf(path, filename) {
  const res = await apiGet(path);
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
}

const documentStatusMeta = (material) => {
  if (material?.available) {
    return { label: "Доступно", tone: "success" };
  }
  if (material?.status === "not_applicable") {
    return { label: "Не требуется", tone: "neutral" };
  }
  return { label: "Ожидает открытия", tone: "warning" };
};

export default function Documents() {
  const [materials, setMaterials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const availableCount = materialCards.filter((card) => materials?.[card.key]?.available).length;
  const waitingCount = materialCards.filter(
    (card) => materials?.[card.key] && !materials?.[card.key]?.available && materials?.[card.key]?.status !== "not_applicable"
  ).length;

  useEffect(() => {
    let active = true;

    const loadMaterials = async () => {
      setLoading(true);
      setPageError("");
      try {
        const response = await apiGet("/documents/status");
        if (!active) return;
        setMaterials(response);
      } catch (err) {
        if (!active) return;
        setPageError(err.message || "Не удалось загрузить статусы документов.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadMaterials();
    return () => {
      active = false;
    };
  }, []);

  const openPdfDocument = (path) => {
    openUrlInNewTab(buildApiUrl(path));
  };

  const handleAction = async (card, action = "download") => {
    const material = materials?.[card.key];
    if (!material?.available) return;

    const nextBusyKey = `${card.key}:${action}`;

    setBusyKey(nextBusyKey);
    setStatusMessage("");
    setErrorMessage("");
    try {
      if (card.mode === "external") {
        const targetUrl = material.url || (await apiGet(card.path))?.url;
        if (!targetUrl) {
          throw new Error("Сборник пока недоступен.");
        }
        openUrlInNewTab(targetUrl);
        setStatusMessage("Сборник открыт в новой вкладке.");
      } else {
        if (action === "preview") {
          openPdfDocument(card.path);
          setStatusMessage(`Документ "${card.title}" открыт в новой вкладке.`);
        } else {
          await downloadPdf(card.path, card.filename);
          setStatusMessage(`Документ "${card.title}" подготовлен для скачивания.`);
        }
      }
    } catch (err) {
      setErrorMessage(err.message || "Не удалось выполнить действие с документом.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <section className="panel">
      <h2>Документы конференции</h2>
      <p className="muted">
        Здесь отображаются только актуальные материалы по вашему статусу участия и состоянию конференции.
      </p>

      {loading ? <p className="form-status info">Загрузка статусов документов...</p> : null}
      {pageError ? <p className="form-status error">{pageError}</p> : null}
      {statusMessage ? <p className="form-status success">{statusMessage}</p> : null}
      {errorMessage ? <p className="form-status error">{errorMessage}</p> : null}

      {!loading && materials ? (
        <div className="documents-summary">
          <article className="documents-summary-card">
            <span className="dashboard-summary-label">Уже доступно</span>
            <strong>{availableCount}</strong>
            <p className="muted">Документы можно открыть или скачать сразу.</p>
          </article>
          <article className="documents-summary-card">
            <span className="dashboard-summary-label">Ожидают публикации</span>
            <strong>{waitingCount}</strong>
            <p className="muted">Откроются автоматически после выполнения условий конференции.</p>
          </article>
        </div>
      ) : null}

      <div className="doc-grid">
        {materialCards.map((card) => {
          const material = materials?.[card.key];
          const isAvailable = Boolean(material?.available);
          const downloadBusy = busyKey === `${card.key}:download`;
          const previewBusy = busyKey === `${card.key}:preview`;
          const buttonLabel = downloadBusy ? "Подготовка..." : card.actionLabel;
          const statusMeta = documentStatusMeta(material);
          const canPreviewPdf = card.mode === "download";

          return (
            <div key={card.key} className={`doc-card doc-card-${statusMeta.tone}`}>
              <div className="doc-card-head">
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </div>
                <span className={`status-chip status-chip-${statusMeta.tone}`}>{statusMeta.label}</span>
              </div>
              <p className="doc-card-message">
                {material?.message || "Статус документа будет доступен после загрузки страницы."}
              </p>
              <div className="form-actions">
                {canPreviewPdf ? (
                  <button
                    className="btn btn-ghost"
                    onClick={() => handleAction(card, "preview")}
                    disabled={loading || !isAvailable || previewBusy || downloadBusy}
                  >
                    {previewBusy ? "Открытие..." : "Открыть"}
                  </button>
                ) : null}
                <button
                  className={isAvailable ? "btn btn-primary" : "btn btn-ghost"}
                  onClick={() => handleAction(card, "download")}
                  disabled={loading || !isAvailable || downloadBusy || previewBusy}
                >
                  {buttonLabel}
                </button>
              </div>
              {material?.status === "not_applicable" ? (
                <p className="muted">Материал не применяется к вашему формату участия.</p>
              ) : null}
              {material && !material.available && material.status !== "not_applicable" ? (
                <p className="muted">Документ станет доступен автоматически, когда будут выполнены условия публикации.</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
