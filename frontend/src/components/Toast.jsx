// Shared inline status banner used across the console/ops screens. Renders exactly
// the markup that was inlined in ~14 pages: nothing when toast is falsy, otherwise a
// con-toast div with role=alert for errors (kind "err") and role=status otherwise.
export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>
      {toast.text}
    </div>
  );
}
