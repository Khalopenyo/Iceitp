import { apiGet } from "./api.js";

// fetchContentBlocks loads the resolved conference's visible CMS content blocks
// (per-tenant landing content edited by the org admin). Returns [] on failure.
export async function fetchContentBlocks() {
  try {
    const blocks = await apiGet("/content", { suppressAuthRedirect: true });
    return Array.isArray(blocks) ? blocks : [];
  } catch {
    return [];
  }
}
