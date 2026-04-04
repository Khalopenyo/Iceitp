import { useEffect, useState } from "react";
import { apiGet } from "../lib/api.js";

const materialCards = [
  {
    key: "personal_program",
    title: "Моя программа",
    description: "Персональная PDF-программа на основе утвержденного места в сетке конференции.",
    actionLabel: "Скачать PDF",
    filename: "program-personal.pdf",
    path: "/documents/program?type=personal",
    mode: "download",
  },
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
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function Documents() {
  const [materials, setMaterials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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

  const handleAction = async (card) => {
    const material = materials?.[card.key];
    if (!material?.available) return;

    setBusyKey(card.key);
    setStatusMessage("");
    setErrorMessage("");
    try {
      if (card.mode === "external") {
        const targetUrl = material.url || (await apiGet(card.path))?.url;
        if (!targetUrl) {
          throw new Error("Сборник пока недоступен.");
        }
        window.open(targetUrl, "_blank", "noopener,noreferrer");
        setStatusMessage("Сборник открыт в новой вкладке.");
      } else {
        await downloadPdf(card.path, card.filename);
        setStatusMessage(`Документ "${card.title}" подготовлен для скачивания.`);
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

      <div className="doc-grid">
        {materialCards.map((card) => {
          const material = materials?.[card.key];
          const isAvailable = Boolean(material?.available);
          const isBusy = busyKey === card.key;
          const buttonLabel = isBusy ? "Подготовка..." : card.actionLabel;

          return (
            <div key={card.key} className="doc-card">
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <p className="muted">{material?.message || "Статус документа будет доступен после загрузки страницы."}</p>
              <div className="form-actions">
                <button
                  className={isAvailable ? "btn btn-primary" : "btn btn-ghost"}
                  onClick={() => handleAction(card)}
                  disabled={loading || !isAvailable || isBusy}
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
