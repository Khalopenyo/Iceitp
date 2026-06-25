import { apiGet } from "./api.js";

// fetchLanding loads the public landing showcase payload (SCR-PUB-01): the
// resolved conference, aggregate stats, section cards and a program preview.
// Returns null on failure so the landing degrades to conference-only content.
export async function fetchLanding() {
  try {
    return await apiGet("/landing", { suppressAuthRedirect: true });
  } catch {
    return null;
  }
}
