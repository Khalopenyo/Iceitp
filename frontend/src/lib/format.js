// Shared display-format helpers.

// initials returns up to two uppercased leading letters of a name, or `fallback`
// when there is nothing usable. The default whitespace splitter reproduces the
// avatar-initials logic that was copy-pasted across ~10 components; pass a custom
// `splitter` (e.g. /[\s@.]+/) for the email-aware variant.
export function initials(value, fallback = "—", splitter = /\s+/) {
  const parts = String(value || "")
    .trim()
    .split(splitter)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || fallback;
}
