import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from "../lib/api.js";
import { getUser } from "../lib/auth.js";
import { triggerBlobDownload } from "../lib/download.js";
import { icons as I } from "../components/lkIcons.jsx";
import "./lk.css";

const CHAT_SCOPE_CONFERENCE = "conference";
const CHAT_SCOPE_SECTION = "section";
const CHAT_POLL_INTERVAL_MS = 8000;
const CHAT_DRAFT_PREFIX = "conf_chat_draft_";
const CHAT_SEEN_PREFIX = "conf_chat_seen_";
const CHAT_LAST_SCOPE_KEY = "conf_chat_last_scope";
const CHAT_ATTACHMENT_ACCEPT = ".csv,.doc,.docx,.jpeg,.jpg,.pdf,.png,.ppt,.pptx,.txt,.xls,.xlsx";
const rawApiBaseUrl = typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

const getDraftKey = (scope) => `${CHAT_DRAFT_PREFIX}${scope}`;
const getSeenKey = (scope) => `${CHAT_SEEN_PREFIX}${scope}`;

function readStorage(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors for a non-critical chat convenience feature.
  }
}

function getInitialScope(user) {
  const savedScope = readStorage(CHAT_LAST_SCOPE_KEY, CHAT_SCOPE_CONFERENCE);
  if (savedScope === CHAT_SCOPE_SECTION && user?.profile?.section_id) return CHAT_SCOPE_SECTION;
  return CHAT_SCOPE_CONFERENCE;
}
const getDraft = (scope) => readStorage(getDraftKey(scope), "");
const setDraft = (scope, value) => writeStorage(getDraftKey(scope), value);

function markChannelSeen(scope, lastMessageAt) {
  if (!lastMessageAt) return;
  writeStorage(getSeenKey(scope), lastMessageAt);
}
function hasUnreadMessages(channel) {
  if (!channel?.last_message_at) return false;
  const seenAt = readStorage(getSeenKey(channel.scope), "");
  if (!seenAt) return true;
  return new Date(channel.last_message_at).getTime() > new Date(seenAt).getTime();
}

const formatMessageTime = (v) => new Date(v).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const formatMessageDate = (v) => new Date(v).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const formatMessageDateTime = (v) =>
  new Date(v).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function formatRelativeActivity(value) {
  if (!value) return "Пока без сообщений";
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 1) return "только что";
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  return formatMessageDateTime(value);
}

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
const buildAttachmentUrl = (downloadUrl) => (!downloadUrl ? "" : apiBaseUrl ? `${apiBaseUrl}${downloadUrl}` : downloadUrl);

const channelIcon = (scope) => (scope === CHAT_SCOPE_SECTION ? I.users : scope === CHAT_SCOPE_CONFERENCE ? I.broadcast : I.help);

export default function Chat() {
  const user = getUser();
  const initialScope = getInitialScope(user);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  const [view, setView] = useState("list"); // list | thread
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
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingContent, setEditingContent] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let disposed = false;
    const loadChat = async (silent = false) => {
      try {
        const data = await apiGet(`/chat?scope=${activeScope}`);
        if (disposed) return;
        setChannels(data.channels || []);
        setCurrentChannel(data.current_channel || null);
        setMessages(data.messages || []);
        setError("");
        markChannelSeen(data.current_scope, data.current_channel?.last_message_at);
      } catch (err) {
        if (disposed) return;
        setError(err.message || "Не удалось загрузить чат");
        if (!silent) {
          setChannels([]);
          setCurrentChannel(null);
          setMessages([]);
        }
      } finally {
        if (!disposed) {
          setLoading(false);
          setSyncing(false);
        }
      }
    };
    loadChat();
    const intervalId = window.setInterval(() => loadChat(true), CHAT_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [activeScope, refreshVersion]);

  useEffect(() => {
    if (view !== "thread") return;
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, view]);

  const filteredMessages = useMemo(() => filterMessages(messages, search), [messages, search]);

  const openChannel = (channel) => {
    if (!channel?.available) return;
    if (channel.scope !== activeScope) {
      setDraft(activeScope, content);
      writeStorage(CHAT_LAST_SCOPE_KEY, channel.scope);
      setActiveScope(channel.scope);
      setContent(getDraft(channel.scope));
      setSearch("");
      setShowSearch(false);
      setError("");
      setLoading(true);
      setSyncing(false);
      setEditingMessageId(null);
      setEditingContent("");
      setCurrentChannel(channel);
      setMessages([]);
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    setView("thread");
  };

  const handleComposerChange = (e) => {
    setContent(e.target.value);
    setDraft(activeScope, e.target.value);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = content.trim();
    if ((!trimmed && selectedFiles.length === 0) || !currentChannel?.available) return;
    setSending(true);
    setError("");
    try {
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        formData.append("scope", activeScope);
        formData.append("content", trimmed);
        selectedFiles.forEach((file) => formData.append("files", file));
        await apiPostForm("/chat", formData);
      } else {
        await apiPost("/chat", { scope: activeScope, content: trimmed });
      }
      setContent("");
      setDraft(activeScope, "");
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSyncing(true);
      setRefreshVersion((v) => v + 1);
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
      remaining.forEach((file) => transfer.items.add(file));
      fileInputRef.current.files = transfer.files;
    }
  };

  const startEditing = (m) => {
    setEditingMessageId(m.id);
    setEditingContent(m.content);
  };
  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingContent("");
  };
  const handleSaveEdit = async (messageId) => {
    const trimmed = editingContent.trim();
    if (!trimmed) return;
    setSyncing(true);
    setError("");
    try {
      await apiPatch(`/chat/${messageId}`, { content: trimmed });
      cancelEditing();
      setRefreshVersion((v) => v + 1);
    } catch (err) {
      setError(err.message || "Не удалось сохранить изменения");
      setSyncing(false);
    }
  };
  const handleDelete = async (m) => {
    if (!window.confirm("Удалить это сообщение?")) return;
    setSyncing(true);
    setError("");
    try {
      await apiDelete(`/chat/${m.id}`);
      if (editingMessageId === m.id) cancelEditing();
      setRefreshVersion((v) => v + 1);
    } catch (err) {
      setError(err.message || "Не удалось удалить сообщение");
      setSyncing(false);
    }
  };

  const handleComposerKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  };

  const handleDownloadAttachment = async (attachment) => {
    if (!getUser()) {
      window.location.href = "/login";
      return;
    }
    try {
      const res = await fetch(buildAttachmentUrl(attachment.download_url), { credentials: "include" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error("Не удалось скачать вложение");
      const blob = await res.blob();
      triggerBlobDownload(blob, attachment.file_name || "attachment");
    } catch (err) {
      setError(err.message || "Не удалось скачать вложение");
    }
  };

  const canCompose = Boolean(currentChannel?.available) && !sending;

  // ===== Лента канала (SCR-LK-05b) =====
  if (view === "thread") {
    return (
      <>
        <div className="lk-topbar">
          <button type="button" className="lk-iconbtn" onClick={() => setView("list")} aria-label="К списку чатов">
            {I.back}
          </button>
          <div className="lk-topbar-id">
            <div className="lk-topbar-name">{currentChannel?.title || "Чат"}</div>
            <div className="lk-topbar-sub" role={syncing ? "status" : undefined}>
              {syncing
                ? "Синхронизация…"
                : `${currentChannel?.member_count || 0} участников${activeScope === CHAT_SCOPE_CONFERENCE ? " · модерируемый" : ""}`}
            </div>
          </div>
          <div className="lk-spacer" />
          <button
            type="button"
            className="lk-iconbtn"
            onClick={() => setShowSearch((v) => !v)}
            aria-label="Поиск по сообщениям"
            aria-pressed={showSearch}
          >
            {I.search}
          </button>
        </div>

        {showSearch ? (
          <div className="lk-chat-searchbar">
            <span className="lk-chat-search">
              {I.search}
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по имени или тексту"
                aria-label="Поиск по сообщениям"
              />
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="ui-status ui-status-error" role="alert" style={{ margin: "10px 14px 0" }}>
            {error}
          </div>
        ) : null}

        <div className="lk-chat-stream" ref={listRef}>
          {loading ? (
            <div className="lk-chat-empty">Загружаем историю сообщений…</div>
          ) : filteredMessages.length === 0 ? (
            <div className="lk-chat-empty">
              {search.trim()
                ? "По вашему запросу сообщений не найдено."
                : currentChannel?.available
                  ? "Пока здесь тихо. Начните обсуждение первым сообщением."
                  : "Чат секции станет доступен после выбора секции в профиле."}
            </div>
          ) : (
            filteredMessages.map((m, index) => {
              const prev = filteredMessages[index - 1];
              const showDate = formatMessageDate(m.created_at) !== (prev ? formatMessageDate(prev.created_at) : null);
              const isEditing = editingMessageId === m.id;
              return (
                <Fragment key={m.id}>
                  {showDate ? <div className="lk-chat-date">{formatMessageDate(m.created_at)}</div> : null}
                  <div className={`lk-msg ${m.is_own ? "me" : ""}`}>
                    {!m.is_own ? (
                      <div className="lk-msg-who">
                        {m.user_name}
                        {m.user_meta ? ` · ${m.user_meta}` : ""} · {formatMessageTime(m.created_at)}
                      </div>
                    ) : null}
                    {isEditing ? (
                      <div className="lk-chat-editor">
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          rows={3}
                          maxLength={2000}
                        />
                        <div className="lk-chat-editor-foot">
                          <span>{editingContent.trim().length}/2000</span>
                          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={cancelEditing}>Отмена</button>
                          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => handleSaveEdit(m.id)}>Сохранить</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.content ? <div className="lk-msg-text">{m.content}</div> : null}
                        {m.attachments?.length
                          ? m.attachments.map((a) => (
                              <button key={a.id} type="button" className="lk-msg-file" onClick={() => handleDownloadAttachment(a)}>
                                {I.file}
                                <span>
                                  <b>{a.file_name}</b>
                                  <em>{formatFileSize(a.file_size)}</em>
                                </span>
                                {I.download}
                              </button>
                            ))
                          : null}
                        <div className="lk-msg-foot">
                          {m.is_own ? <span className="lk-msg-time">{formatMessageTime(m.created_at)}</span> : null}
                          {m.edited_at ? <span className="lk-msg-edited">изменено</span> : null}
                          {m.can_edit ? (
                            <button type="button" className="lk-msg-act" onClick={() => startEditing(m)}>Изменить</button>
                          ) : null}
                          {m.can_delete ? (
                            <button type="button" className="lk-msg-act danger" onClick={() => handleDelete(m)}>Удалить</button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </Fragment>
              );
            })
          )}
        </div>

        <form className="lk-chat-composer" onSubmit={handleSend}>
          {selectedFiles.length ? (
            <div className="lk-chat-files">
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="lk-chat-file-chip">
                  {I.file}
                  <span>{file.name}</span>
                  <button type="button" onClick={() => removeSelectedFile(index)} aria-label="Убрать файл">{I.close}</button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="lk-chat-composer-row">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={CHAT_ATTACHMENT_ACCEPT}
              onChange={handleFileChange}
              disabled={!canCompose}
              style={{ display: "none" }}
              id="lk-chat-file"
            />
            <button
              type="button"
              className="lk-iconbtn"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canCompose}
              aria-label="Прикрепить файл"
            >
              {I.paperclip}
            </button>
            <textarea
              className="lk-chat-input"
              value={content}
              onChange={handleComposerChange}
              onKeyDown={handleComposerKeyDown}
              placeholder={currentChannel?.available ? "Сообщение…" : "Чат секции недоступен"}
              rows={1}
              maxLength={2000}
              disabled={!canCompose}
            />
            <button
              type="submit"
              className="lk-chat-send"
              disabled={!canCompose || (!content.trim() && selectedFiles.length === 0)}
              aria-label="Отправить"
            >
              {I.send}
            </button>
          </div>
        </form>
      </>
    );
  }

  // ===== Список каналов (SCR-LK-05) =====
  return (
    <>
      <div className="lk-topbar">
        <div className="lk-topbar-title">Чат</div>
      </div>
      <div className="lk-main">
        {error ? <div className="ui-status ui-status-error" role="alert" style={{ marginBottom: "10px" }}>{error}</div> : null}
        {loading && channels.length === 0 ? (
          <div className="lk-card-flat">Загружаем каналы…</div>
        ) : (
          <div className="lk-list">
            {channels.map((channel) => {
              const unread = channel.available && hasUnreadMessages(channel);
              return (
                <button
                  key={channel.scope}
                  type="button"
                  className={`lk-li ${channel.available ? "" : "disabled"}`}
                  onClick={() => openChannel(channel)}
                  disabled={!channel.available}
                >
                  <span className="lk-li-ic">{channelIcon(channel.scope)}</span>
                  <span className="lk-li-tx">
                    <b>{channel.title}</b>
                    <span>
                      {channel.available
                        ? channel.description || formatRelativeActivity(channel.last_message_at)
                        : "Откроется после выбора секции"}
                    </span>
                  </span>
                  {unread ? (
                    <span className="lk-chip lk-chip-count">{channel.message_count || "•"}</span>
                  ) : channel.available ? (
                    <span className="lk-li-chevron">{I.chevron}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
