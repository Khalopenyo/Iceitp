function formatSubmitted(entry) {
  const section = entry.submitted.section_title || "Секция не выбрана";
  const talkTitle = entry.submitted.talk_title || "Без названия";
  return `${entry.submitted.user_type} · ${section} · ${talkTitle}`;
}

function formatApproved(entry) {
  if (!entry.assignment) return "Официальная программа еще не утверждена";

  const parts = [
    entry.assignment.user_type,
    entry.assignment.section_title || "Без секции",
    entry.assignment.talk_title || "Без названия",
  ];

  if (entry.assignment.room_name) {
    parts.push(entry.assignment.room_name);
  }
  if (entry.assignment.starts_at && entry.assignment.ends_at) {
    const startsAt = new Date(entry.assignment.starts_at).toLocaleString();
    const endsAt = new Date(entry.assignment.ends_at).toLocaleTimeString();
    parts.push(`${startsAt} - ${endsAt}`);
  }
  if (entry.assignment.join_url) {
    parts.push(entry.assignment.join_url);
  }

  return parts.join(" · ");
}

export default function AdminProgramList({ entries, selectedUserId, onSelect }) {
  if (!entries.length) {
    return <p className="muted">Участники для утверждения программы пока не найдены.</p>;
  }

  return (
    <div className="table compact">
      {entries.map((entry) => {
        const isSelected = selectedUserId === entry.user_id;
        return (
          <div key={entry.user_id} className="row">
            <div>
              <strong>{entry.full_name || entry.email}</strong>
              <div className="muted">{entry.email}</div>
              <div className="muted">Подано: {formatSubmitted(entry)}</div>
              <div className="muted">Утверждено: {formatApproved(entry)}</div>
            </div>
            <div className="row-actions">
              <span className="pill">{entry.assignment ? "Утверждено" : "Черновик"}</span>
              <button className="btn btn-primary" onClick={() => onSelect(entry.user_id)}>
                {isSelected ? "Редактируется" : entry.assignment ? "Редактировать" : "Назначить"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
