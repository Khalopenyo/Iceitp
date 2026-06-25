// Единый набор контурных иконок зоны ЛК. Все декоративные (aria-hidden +
// focusable=false) — рядом всегда есть текст или aria-label на родителе.
const s = (paths) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
    {paths}
  </svg>
);

export const icons = {
  // таб-бар
  home: s(<path d="M5 12 12 5l7 7M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />),
  calendar: s(<><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>),
  badge: s(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z" /></>),
  chat: s(<path d="M4 5h16v11H9l-4 4V5z" />),
  more: s(<><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>),
  // dashboard / общие
  pin: s(<><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></>),
  mic: s(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
  check: s(<><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>),
  qr: s(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-7" /></>),
  cal: s(<><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>),
  building: s(<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M9 7h2M9 11h2M9 15h2M15 21V11h2a2 2 0 0 1 2 2v8" />),
  grid: s(<><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>),
  door: s(<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14 12h.01" />),
  clock: s(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  map: s(<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />),
  upload: s(<path d="M12 16V4m0 0 4 4m-4-4-4 4M5 20h14" />),
  shield: s(<path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />),
  id: s(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M14 9h4M14 13h4M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2" /></>),
  doc: s(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>),
  message: s(<path d="M4 5h16v11H9l-4 4V5z" />),
  star: s(<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z" />),
  chevron: s(<path d="m9 6 6 6-6 6" />),
  bell: s(<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10 20a2 2 0 0 0 4 0" />),
  // profile
  back: s(<path d="M15 6l-6 6 6 6" />),
  edit: s(<path d="M4 20h4l10-10-4-4L4 16v4ZM13.5 6.5l4 4" />),
  key: s(<><circle cx="8" cy="15" r="4" /><path d="m10.85 12.15 7.65-7.65M16 6l2 2M18 4l2 2" /></>),
  ok: s(<><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>),
  no: s(<><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>),
  download: s(<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />),
  trash: s(<path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />),
  ban: s(<><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>),
  // schedule
  filter: s(<path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />),
  list: s(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />),
  layout: s(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 10v10" /></>),
  // documents
  eye: s(<><path d="M3 12c1.5-3.5 5-7 9-7s7.5 3.5 9 7c-1.5 3.5-5 7-9 7s-7.5-3.5-9-7Z" /><circle cx="12" cy="12" r="2.6" /></>),
  file: s(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>),
  cert: s(<><circle cx="12" cy="9" r="5" /><path d="m8.5 13-1.5 8 5-3 5 3-1.5-8" /></>),
  folder: s(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  cloud: s(<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18H7Z" />),
  close: s(<path d="M6 6l12 12M18 6 6 18" />),
};
