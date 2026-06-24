import "./ui.css";
import { buttonClassName } from "./buttonClass.js";

// UI kit — reusable primitives for the multi-tenant rebuild, styled against the
// design-system tokens. Plain wrappers so screens compose them per the mockups.

export function Container({ className = "", ...rest }) {
  return <div className={`ui-container ${className}`.trim()} {...rest} />;
}

export function PageSection({ className = "", ...rest }) {
  return <section className={`ui-section ${className}`.trim()} {...rest} />;
}

export function Button({ variant = "primary", block = false, className = "", ...rest }) {
  return <button className={buttonClassName(variant, block, className)} {...rest} />;
}

export function Card({ className = "", ...rest }) {
  return <div className={`ui-card ${className}`.trim()} {...rest} />;
}

export function Field({ label, htmlFor, error, children, className = "" }) {
  return (
    <div className={`ui-field ${className}`.trim()}>
      {label ? <label htmlFor={htmlFor}>{label}</label> : null}
      {children}
      {error ? <div className="ui-field-error">{error}</div> : null}
    </div>
  );
}

export function Input({ className = "", ...rest }) {
  return <input className={`ui-input ${className}`.trim()} {...rest} />;
}

export function Select({ className = "", ...rest }) {
  return <select className={`ui-select ${className}`.trim()} {...rest} />;
}

export function Textarea({ className = "", ...rest }) {
  return <textarea className={`ui-textarea ${className}`.trim()} {...rest} />;
}

export function Badge({ variant = "neutral", className = "", ...rest }) {
  return <span className={`ui-badge ui-badge-${variant} ${className}`.trim()} {...rest} />;
}
