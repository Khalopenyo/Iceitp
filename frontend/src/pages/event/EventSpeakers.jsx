import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/api.js";
import "./event.css";

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
  if (parts.length === 0) return "—";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

// EventSpeakers — экран «Спикеры» в зоне EventShell: вкладки по ролям + сетка карточек.
export default function EventSpeakers() {
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
    <div className="ev-page" data-screen-label="Спикеры">
      <div className="ev-page-eyebrow">Спикеры и оргкомитет</div>
      <h1 className="ev-page-h">Кто делает конференцию</h1>
      <p className="ev-page-sub">
        Приглашённые докладчики, члены оргкомитета и программного комитета конференции.
      </p>

      {presentGroups.length > 1 ? (
        <div className="ev-tabs" role="tablist" aria-label="Группы участников">
          {presentGroups.map((group) => (
            <button
              key={group.role}
              type="button"
              className={`ev-tab ${current === group.role ? "active" : ""}`}
              aria-pressed={current === group.role}
              onClick={() => setActiveRole(group.role)}
            >
              {group.label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="ev-empty">Загружаю участников…</p>
      ) : persons.length === 0 ? (
        <p className="ev-empty">
          Спикеры и оргкомитет публикуются организатором по мере подготовки программы.
        </p>
      ) : (
        <div className="ev-cards">
          {visible.map((person) => (
            <article key={person.id} className="ev-person">
              {person.photo_url ? (
                <img className="ev-person-photo" src={person.photo_url} alt={person.full_name} loading="lazy" />
              ) : (
                <div className="ev-person-av" aria-hidden="true">
                  {getInitials(person.full_name)}
                </div>
              )}
              <div className="ev-person-name">{person.full_name}</div>
              {person.degree ? <div className="ev-person-meta">{person.degree}</div> : null}
              {person.organization || person.position ? (
                <div className="ev-person-meta">
                  {[person.organization, person.position].filter(Boolean).join(", ")}
                </div>
              ) : null}
              {person.bio ? <p className="ev-person-bio">{person.bio}</p> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
