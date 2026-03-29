import { apiGet } from "../lib/api.js";

async function download(path, filename) {
  const res = await apiGet(path);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export default function Documents() {
  const downloadProceedings = async () => {
    try {
      const data = await apiGet("/documents/proceedings");
      if (!data?.url) {
        alert("Сборник пока недоступен");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err.message || "Сборник пока недоступен");
    }
  };

  return (
    <section className="panel">
      <h2>Документы конференции</h2>
      <div className="doc-grid">
        <div className="doc-card">
          <h3>Программа</h3>
          <p>Персональная или полная программа конференции.</p>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={() => download("/documents/program?type=personal", "program-personal.pdf")}
            >
              Моя программа
            </button>
            <button className="btn btn-ghost" onClick={() => download("/documents/program?type=full", "program-full.pdf")}>
              Полная программа
            </button>
          </div>
        </div>
        <div className="doc-card">
          <h3>Бейдж с QR</h3>
          <p>Для быстрой регистрации на площадке (QR для check-in).</p>
          <button className="btn btn-primary" onClick={() => download("/documents/badge", "badge.pdf")}>
            Скачать PDF
          </button>
        </div>
        <div className="doc-card">
          <h3>Сертификат участника</h3>
          <p>Подтверждение участия после check-in на площадке.</p>
          <button className="btn btn-primary" onClick={() => download("/documents/certificate", "certificate.pdf")}>
            Скачать PDF
          </button>
        </div>
        <div className="doc-card">
          <h3>Сборник трудов</h3>
          <p>Доступен после завершения конференции.</p>
          <button className="btn btn-ghost" onClick={downloadProceedings}>
            Открыть сборник
          </button>
        </div>
      </div>
    </section>
  );
}
