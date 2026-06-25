import { useEffect, useState } from "react";
import { apiGet, buildApiUrl } from "../lib/api.js";
import { openUrlInNewTab, triggerBlobDownload } from "../lib/download.js";
import { Button, Badge } from "../components/ui/index.jsx";
import "./documents.css";

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
    return { label: "Доступно", tone: "success", badge: "success" };
  }
  if (material?.status === "not_applicable") {
    return { label: "Не требуется", tone: "neutral", badge: "neutral" };
  }
  return { label: "Ожидает открытия", tone: "warning", badge: "warn" };
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
    (card) =>
      materials?.[card.key] &&
      !materials?.[card.key]?.available &&
      materials?.[card.key]?.status !== "not_applicable"
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
    const separator = path.includes("?") ? "&" : "?";
    openUrlInNewTab(buildApiUrl(`${path}${separator}disposition=inline`));
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
    <section className="docs">
      <div className="docs-head">
        <h1>Документы конференции</h1>
        <p>
          Здесь отображаются только актуальные материалы по вашему статусу участия и состоянию
          конференции.
        </p>
      </div>

      {loading ? (
        <div className="docs-status docs-status-info" role="status">
          Загрузка статусов документов…
        </div>
      ) : null}
      {pageError ? (
        <div className="docs-status docs-status-error" role="alert">
          {pageError}
        </div>
      ) : null}
      {statusMessage ? (
        <div className="docs-status docs-status-success" role="status">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="docs-status docs-status-error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {!loading && materials ? (
        <div className="docs-summary">
          <article className="docs-summary-card">
            <span className="docs-summary-label">Уже доступно</span>
            <strong>{availableCount}</strong>
            <p>Документы можно открыть или скачать сразу.</p>
          </article>
          <article className="docs-summary-card">
            <span className="docs-summary-label">Ожидают публикации</span>
            <strong>{waitingCount}</strong>
            <p>Откроются автоматически после выполнения условий конференции.</p>
          </article>
        </div>
      ) : null}

      <div className="docs-grid">
        {materialCards.map((card) => {
          const material = materials?.[card.key];
          const isAvailable = Boolean(material?.available);
          const downloadBusy = busyKey === `${card.key}:download`;
          const previewBusy = busyKey === `${card.key}:preview`;
          const buttonLabel = downloadBusy ? "Подготовка…" : card.actionLabel;
          const statusMeta = documentStatusMeta(material);
          const canPreviewPdf = card.mode === "download";

          return (
            <div key={card.key} className={`doc-card doc-card-${statusMeta.tone}`}>
              <div className="doc-card-head">
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </div>
                <Badge variant={statusMeta.badge}>{statusMeta.label}</Badge>
              </div>
              <p className="doc-card-message">
                {material?.message || "Статус документа будет доступен после загрузки страницы."}
              </p>
              <div className="doc-card-actions">
                {canPreviewPdf ? (
                  <Button
                    variant="ghost"
                    onClick={() => handleAction(card, "preview")}
                    disabled={loading || !isAvailable || previewBusy || downloadBusy}
                  >
                    {previewBusy ? "Открытие…" : "Открыть"}
                  </Button>
                ) : null}
                <Button
                  variant={isAvailable ? "primary" : "ghost"}
                  onClick={() => handleAction(card, "download")}
                  disabled={loading || !isAvailable || downloadBusy || previewBusy}
                >
                  {buttonLabel}
                </Button>
              </div>
              {material?.status === "not_applicable" ? (
                <p className="doc-card-note">Материал не применяется к вашему формату участия.</p>
              ) : null}
              {material && !material.available && material.status !== "not_applicable" ? (
                <p className="doc-card-note">
                  Документ станет доступен автоматически, когда будут выполнены условия публикации.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
