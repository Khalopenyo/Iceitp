const fallbackConferenceTitle = "Научная конференция";
const fallbackConferenceDescription =
  "Единая платформа для регистрации, программы, коммуникации и документов научной конференции.";
const fallbackConferenceSupportEmail = "madinaborz@mail.ru";

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getConferenceTitle(conference) {
  return conference?.title?.trim() || fallbackConferenceTitle;
}

export function getConferenceDescription(conference) {
  return conference?.description?.trim() || fallbackConferenceDescription;
}

export function getConferenceSupportEmail(conference) {
  return conference?.support_email?.trim() || fallbackConferenceSupportEmail;
}

export function getConferenceStatusLabel(status) {
  switch (status) {
    case "draft":
      return "Подготовка программы";
    case "live":
      return "Конференция идет";
    case "finished":
      return "Конференция завершена";
    default:
      return "";
  }
}

export function formatConferenceDateRange(startsAt, endsAt) {
  const start = parseDate(startsAt);
  const end = parseDate(endsAt);

  if (!start && !end) return "";
  if (start && !end) {
    return start.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (!start && end) {
    return end.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return `${start.getDate()}-${end.getDate()} ${start.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    })}`;
  }

  if (start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
    })} - ${end.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }

  return `${start.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })} - ${end.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;
}

export const CONFERENCE_UPDATED_EVENT = "conference-updated";

export function notifyConferenceUpdated() {
  window.dispatchEvent(new Event(CONFERENCE_UPDATED_EVENT));
}
