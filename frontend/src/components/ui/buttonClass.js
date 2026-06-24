// buttonClassName lets a link (router <Link>/<a>) be styled as a button without
// the polymorphic-component pattern:
//   <Link className={buttonClassName("primary")} to="/register">…</Link>
// Kept in its own module so the component file (index.jsx) only exports
// components (react-refresh constraint).
export function buttonClassName(variant = "primary", block = false, extra = "") {
  return `ui-btn ui-btn-${variant}${block ? " ui-btn-block" : ""} ${extra}`.trim();
}
