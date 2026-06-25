import "./console.css";

// Заглушка раздела консоли, который ещё не построен (фазы D онбординга).
export default function ConsoleSoon({ eyebrow, title }) {
  return (
    <div className="con-screen">
      <div className="con-eyebrow">{eyebrow || "Раздел"}</div>
      <h2 className="con-h2" style={{ marginBottom: 22 }}>{title}</h2>
      <div className="con-soon">Раздел появится на следующем шаге сборки консоли.</div>
    </div>
  );
}
