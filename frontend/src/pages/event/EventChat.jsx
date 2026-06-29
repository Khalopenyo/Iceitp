import { initials as initialsOf } from "../../lib/format.js";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from "../../lib/api.js";
import { getUser } from "../../lib/auth.js";
import { triggerBlobDownload } from "../../lib/download.js";
import "./event.css";

const SCOPE_CONFERENCE = "conference";
const SCOPE_SECTION = "section";
const POLL_MS = 8000;
const DRAFT_PREFIX = "conf_chat_draft_";
const SEEN_PREFIX = "conf_chat_seen_";
const LAST_SCOPE_KEY = "conf_chat_last_scope";
const ACCEPT = ".csv,.doc,.docx,.jpeg,.jpg,.pdf,.png,.ppt,.pptx,.txt,.xls,.xlsx";
const rawApiBaseUrl = typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

function readStorage(key, fallback = "") {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* non-critical */ }
}
const getDraft = (scope) => readStorage(`${DRAFT_PREFIX}${scope}`, "");
const setDraft = (scope, value) => writeStorage(`${DRAFT_PREFIX}${scope}`, value);
function markSeen(scope, lastAt) {
  if (lastAt) writeStorage(`${SEEN_PREFIX}${scope}`, lastAt);
}
function getInitialScope(user) {
  const saved = readStorage(LAST_SCOPE_KEY, SCOPE_CONFERENCE);
  if (saved === SCOPE_SECTION && user?.profile?.section_id) return SCOPE_SECTION;
  return SCOPE_CONFERENCE;
}

const formatTime = (v) => new Date(v).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const formatDate = (v) => new Date(v).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

function filterMessages(messages, query) {
  const q = query.trim().toLowerCase();
  if (!q) return messages;
  return messages.filter((m) => {
    const names = (m.attachments || []).map((a) => a.file_name || "").join(" ");
    return [m.user_name, m.user_meta, m.content, names].join(" ").toLowerCase().includes(q);
  });
}
function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) return "Файл";
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}
const buildAttachmentUrl = (u) => (!u ? "" : apiBaseUrl ? `${apiBaseUrl}${u}` : u);
const initials = (name) => initialsOf(name, "—");

// EventChat — чат участника в зоне EventShell (по прототипу: вкладки Общий/Моя секция,
// лента, композер). Логика сохранена из старого Chat: поллинг, черновики, вложения,
// правка/удаление, поиск.
export default function EventChat() {
  useOutletContext();
  const user = getUser();
  const initialScope = getInitialScope(user);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  const [activeScope, setActiveScope] = useState(initialScope);
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState(() => getDraft(initialScope));
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingContent, setEditingContent] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let disposed = false;
    const load = async (silent = false) => {
      try {
        const data = await apiGet(`/chat?scope=${activeScope}`);
        if (disposed) return;
        setChannels(data.channels || []);
        setCurrentChannel(data.current_channel || null);
        setMessages(data.messages || []);
        setError("");
        markSeen(data.current_scope, data.current_channel?.last_message_at);
      } catch (err) {
        if (disposed) return;
        setError(err.message || "Не удалось загрузить чат");
        if (!silent) { setChannels([]); setCurrentChannel(null); setMessages([]); }
      } finally {
        if (!disposed) { setLoading(false); setSyncing(false); }
      }
    };
    load();
    const id = window.setInterval(() => load(true), POLL_MS);
    return () => { disposed = true; window.clearInterval(id); };
  }, [activeScope, refreshVersion]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  const filteredMessages = useMemo(() => filterMessages(messages, search), [messages, search]);

  const switchScope = (scope) => {
    if (scope === activeScope) return;
    setDraft(activeScope, content);
    writeStorage(LAST_SCOPE_KEY, scope);
    setActiveScope(scope);
    setContent(getDraft(scope));
    setSearch(""); setShowSearch(false); setError("");
    setLoading(true); setSyncing(false);
    setEditingId(null); setEditingContent("");
    setMessages([]); setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleComposerChange = (e) => { setContent(e.target.value); setDraft(activeScope, e.target.value); };

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = content.trim();
    if ((!trimmed && selectedFiles.length === 0) || !currentChannel?.available) return;
    setSending(true); setError("");
    try {
      if (selectedFiles.length > 0) {
        const fd = new FormData();
        fd.append("scope", activeScope);
        fd.append("content", trimmed);
        selectedFiles.forEach((f) => fd.append("files", f));
        await apiPostForm("/chat", fd);
      } else {
        await apiPost("/chat", { scope: activeScope, content: trimmed });
      }
      setContent(""); setDraft(activeScope, ""); setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSyncing(true); setRefreshVersion((v) => v + 1);
    } catch (err) {
      setError(err.message || "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = (e) => setSelectedFiles(Array.from(e.target.files || []));
  const removeSelectedFile = (idx) => {
    const remaining = selectedFiles.filter((_, i) => i !== idx);
    setSelectedFiles(remaining);
    if (fileInputRef.current) {
      const transfer = new DataTransfer();
      remaining.forEach((f) => transfer.items.add(f));
      fileInputRef.current.files = transfer.files;
    }
  };

  const startEditing = (m) => { setEditingId(m.id); setEditingContent(m.content); };
  const cancelEditing = () => { setEditingId(null); setEditingContent(""); };
  const handleSaveEdit = async (id) => {
    const trimmed = editingContent.trim();
    if (!trimmed) return;
    setSyncing(true); setError("");
    try {
      await apiPatch(`/chat/${id}`, { content: trimmed });
      cancelEditing();
      setRefreshVersion((v) => v + 1);
    } catch (err) { setError(err.message || "Не удалось сохранить изменения"); setSyncing(false); }
  };
  const handleDelete = async (m) => {
    if (!window.confirm("Удалить это сообщение?")) return;
    setSyncing(true); setError("");
    try {
      await apiDelete(`/chat/${m.id}`);
      if (editingId === m.id) cancelEditing();
      setRefreshVersion((v) => v + 1);
    } catch (err) { setError(err.message || "Не удалось удалить сообщение"); setSyncing(false); }
  };

  const handleComposerKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  };

  const handleDownloadAttachment = async (a) => {
    if (!getUser()) { window.location.href = "/login"; return; }
    try {
      const res = await fetch(buildAttachmentUrl(a.download_url), { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) throw new Error("Не удалось скачать вложение");
      const blob = await res.blob();
      triggerBlobDownload(blob, a.file_name || "attachment");
    } catch (err) { setError(err.message || "Не удалось скачать вложение"); }
  };

  const canCompose = Boolean(currentChannel?.available) && !sending;
  const sectionChannel = channels.find((c) => c.scope === SCOPE_SECTION);

  return (
    <div className="ev-chat" data-screen-label="Чат">
      <div className="ev-chat-head">
        <div className="ev-page-eyebrow">Чат участников</div>
        <div className="ev-chat-head-row">
          <div className="ev-tabs" role="tablist" aria-label="Каналы чата" style={{ marginBottom: 0 }}>
            <button type="button" role="tab" aria-selected={activeScope === SCOPE_CONFERENCE}
              className={`ev-tab ${activeScope === SCOPE_CONFERENCE ? "active" : ""}`} onClick={() => switchScope(SCOPE_CONFERENCE)}>
              Общий чат
            </button>
            <button type="button" role="tab" aria-selected={activeScope === SCOPE_SECTION}
              className={`ev-tab ${activeScope === SCOPE_SECTION ? "active" : ""}`}
              onClick={() => switchScope(SCOPE_SECTION)} disabled={sectionChannel ? !sectionChannel.available : false}
              title={sectionChannel && !sectionChannel.available ? "Откроется после выбора секции в профиле" : undefined}>
              Моя секция
            </button>
          </div>
          <button type="button" className="ev-chat-icon" onClick={() => setShowSearch((v) => !v)} aria-label="Поиск по сообщениям" aria-pressed={showSearch}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          </button>
        </div>
        {showSearch ? (
          <input className="ev-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по имени или тексту" aria-label="Поиск по сообщениям" style={{ width: "100%", marginTop: 12 }} />
        ) : null}
        <div className="ev-chat-sub" role={syncing ? "status" : undefined}>
          {syncing ? "Синхронизация…" : `${currentChannel?.member_count || 0} участников${activeScope === SCOPE_CONFERENCE ? " · модерируемый" : ""}`}
        </div>
      </div>

      {error ? <div className="ev-chat-error" role="alert">{error}</div> : null}

      <div className="ev-chat-stream" ref={listRef}>
        {loading ? (
          <div className="ev-chat-empty">Загружаем историю сообщений…</div>
        ) : filteredMessages.length === 0 ? (
          <div className="ev-chat-empty">
            {search.trim()
              ? "По вашему запросу сообщений не найдено."
              : currentChannel?.available
                ? "Пока здесь тихо. Начните обсуждение первым сообщением."
                : "Чат секции станет доступен после выбора секции в профиле."}
          </div>
        ) : (
          filteredMessages.map((m, index) => {
            const prev = filteredMessages[index - 1];
            const showDate = formatDate(m.created_at) !== (prev ? formatDate(prev.created_at) : null);
            const isEditing = editingId === m.id;
            return (
              <Fragment key={m.id}>
                {showDate ? <div className="ev-chat-date">{formatDate(m.created_at)}</div> : null}
                <div className={`ev-msg-row ${m.is_own ? "me" : ""}`}>
                  {!m.is_own ? <div className="ev-msg-av" aria-hidden="true">{initials(m.user_name)}</div> : null}
                  <div className="ev-msg-col">
                    {!m.is_own ? (
                      <div className="ev-msg-who">
                        {m.user_name}{m.user_meta ? ` · ${m.user_meta}` : ""} · {formatTime(m.created_at)}
                      </div>
                    ) : null}
                    {isEditing ? (
                      <div className="ev-msg-editor">
                        <textarea value={editingContent} onChange={(e) => setEditingContent(e.target.value)} rows={3} maxLength={2000} />
                        <div className="ev-msg-editor-foot">
                          <span>{editingContent.trim().length}/2000</span>
                          <button type="button" className="ev-btn-sm ghost" onClick={cancelEditing}>Отмена</button>
                          <button type="button" className="ev-btn-sm primary" onClick={() => handleSaveEdit(m.id)}>Сохранить</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={`ev-bubble ${m.is_own ? "me" : ""}`}>
                          {m.content ? <div className="ev-msg-text">{m.content}</div> : null}
                          {m.attachments?.length
                            ? m.attachments.map((a) => (
                                <button key={a.id} type="button" className="ev-msg-file" onClick={() => handleDownloadAttachment(a)}>
                                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>
                                  <span><b>{a.file_name}</b><em>{formatFileSize(a.file_size)}</em></span>
                                </button>
                              ))
                            : null}
                        </div>
                        <div className="ev-msg-foot">
                          {m.is_own ? <span>{formatTime(m.created_at)}</span> : null}
                          {m.edited_at ? <span>изменено</span> : null}
                          {m.can_edit ? <button type="button" className="ev-msg-act" onClick={() => startEditing(m)}>Изменить</button> : null}
                          {m.can_delete ? <button type="button" className="ev-msg-act danger" onClick={() => handleDelete(m)}>Удалить</button> : null}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })
        )}
      </div>

      <form className="ev-chat-composer" onSubmit={handleSend}>
        {selectedFiles.length ? (
          <div className="ev-chat-files">
            {selectedFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="ev-chat-file-chip">
                <span>{file.name}</span>
                <button type="button" onClick={() => removeSelectedFile(index)} aria-label="Убрать файл">✕</button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="ev-chat-composer-row">
          <input ref={fileInputRef} type="file" multiple accept={ACCEPT} onChange={handleFileChange} disabled={!canCompose} style={{ display: "none" }} id="ev-chat-file" />
          <button type="button" className="ev-chat-icon" onClick={() => fileInputRef.current?.click()} disabled={!canCompose} aria-label="Прикрепить файл">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5l-8.5 8.5a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.6 1.6 0 01-2.3-2.3l7.8-7.8" /></svg>
          </button>
          <textarea className="ev-chat-input" value={content} onChange={handleComposerChange} onKeyDown={handleComposerKeyDown}
            placeholder={currentChannel?.available ? "Сообщение…" : "Чат секции недоступен"} rows={1} maxLength={2000} disabled={!canCompose} />
          <button type="submit" className="ev-chat-send" disabled={!canCompose || (!content.trim() && selectedFiles.length === 0)} aria-label="Отправить">
            Отправить
          </button>
        </div>
      </form>
    </div>
  );
}
