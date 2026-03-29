const toTimestamp = (value) => {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
};

export const getSessionStatus = (section, nowTs = Date.now()) => {
  const start = toTimestamp(section?.start_at);
  const end = toTimestamp(section?.end_at);

  if (start === null || end === null) return "unknown";
  if (nowTs >= start && nowTs <= end) return "current";
  if (nowTs < start) return "upcoming";
  return "past";
};

export const isCurrentSession = (section, nowTs = Date.now()) =>
  getSessionStatus(section, nowTs) === "current";
