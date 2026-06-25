import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api.js";
import { Container } from "../components/ui/index.jsx";
import "./speakers.css";

const GROUPS = [
  { role: "speaker", label: "Спикеры" },
  { role: "orgcommittee", label: "Оргкомитет" },
  { role: "programcommittee", label: "Программный комитет" },
];

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) {
    return "—";
  }
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

export default function Speakers() {
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState("speaker");

  useEffect(() => {
    apiGet("/speakers")
      .then((data) => setPersons(Array.isArray(data) ? data : []))
      .catch(() => setPersons([]))
      .finally(() => setLoading(false));
  }, []);

  const presentGroups = useMemo(
    () => GROUPS.filter((group) => persons.some((person) => person.role === group.role)),
    [persons]
  );

  const current = presentGroups.some((g) => g.role === activeRole)
    ? activeRole
    : presentGroups[0]?.role || "speaker";

  const visible = persons.filter((person) => person.role === current);

  return (
    <section className="speakers-page">
      <Container>
        <div className="speakers-head">
          <h1>Спикеры и оргкомитет</h1>
          <p>
            Приглашённые докладчики, члены оргкомитета и программного комитета конференции.
          </p>
        </div>

        {presentGroups.length > 1 ? (
          <div className="speakers-tabs" role="tablist" aria-label="Группы участников">
            {presentGroups.map((group) => (
              <button
                key={group.role}
                type="button"
                className={`speakers-tab ${current === group.role ? "active" : ""}`}
                aria-pressed={current === group.role}
                onClick={() => setActiveRole(group.role)}
              >
                {group.label}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <p className="speakers-empty">Загружаю участников…</p>
        ) : persons.length === 0 ? (
          <p className="speakers-empty">
            Спикеры и оргкомитет публикуются организатором по мере подготовки программы.
          </p>
        ) : (
          <div className="speakers-grid">
            {visible.map((person) => (
              <article key={person.id} className="speaker-card">
                <div className="speaker-avatar" aria-hidden="true">
                  {getInitials(person.full_name)}
                </div>
                <strong>{person.full_name}</strong>
                {person.degree ? <div className="speaker-meta">{person.degree}</div> : null}
                {person.organization || person.position ? (
                  <div className="speaker-meta">
                    {[person.organization, person.position].filter(Boolean).join(", ")}
                  </div>
                ) : null}
                {person.bio ? <p className="speaker-bio">{person.bio}</p> : null}
              </article>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
