import { Fragment, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from "../lib/api.js";
import { getToken, getUser } from "../lib/auth.js";
import { triggerBlobDownload } from "../lib/download.js";

const CHAT_SCOPE_CONFERENCE = "conference";
const CHAT_SCOPE_SECTION = "section";
const CHAT_POLL_INTERVAL_MS = 8000;
const CHAT_DRAFT_PREFIX = "conf_chat_draft_";
const CHAT_SEEN_PREFIX = "conf_chat_seen_";
const CHAT_LAST_SCOPE_KEY = "conf_chat_last_scope";
const CHAT_ATTACHMENT_ACCEPT = ".csv,.doc,.docx,.jpeg,.jpg,.pdf,.png,.ppt,.pptx,.txt,.xls,.xlsx";
const rawApiBaseUrl = typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

function getDraftKey(scope) {
  return `${CHAT_DRAFT_PREFIX}${scope}`;
}

function getSeenKey(scope) {
  return `${CHAT_SEEN_PREFIX}${scope}`;
}

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
  if (savedScope === CHAT_SCOPE_SECTION && user?.profile?.section_id) {
    return CHAT_SCOPE_SECTION;
  }
  return CHAT_SCOPE_CONFERENCE;
}

function getDraft(scope) {
  return readStorage(getDraftKey(scope), "");
}

function setDraft(scope, value) {
  writeStorage(getDraftKey(scope), value);
}

function markChannelSeen(scope, lastMessageAt) {
  if (!lastMessageAt) return;
  writeStorage(getSeenKey(scope), lastMessageAt);
}

function hasUnreadMessages(channel, activeScope) {
  if (!channel?.last_message_at || channel.scope === activeScope) return false;
  const seenAt = readStorage(getSeenKey(channel.scope), "");
  if (!seenAt) return true;
  return new Date(channel.last_message_at).getTime() > new Date(seenAt).getTime();
}

function getInitials(name) {
  const parts = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "Ч";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function formatMessageTime(value) {
  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMessageDate(value) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

function formatMessageDateTime(value) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeActivity(value) {
  if (!value) return "Пока без сообщений";
  const timestamp = new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));

  if (diffMinutes < 1) return "только что";
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;

  return formatMessageDateTime(value);
}

function filterMessages(messages, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return messages;

  return messages.filter((message) => {
    const attachmentNames = (message.attachments || []).map((attachment) => attachment.file_name || "").join(" ");
    const haystack = [message.user_name, message.user_meta, message.content, attachmentNames].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function getChannelInputPlaceholder(channel) {
  if (!channel?.available) return "Чат секции станет доступен после выбора секции";
  if (channel.scope === CHAT_SCOPE_SECTION) return "Напишите в чат вашей секции";
  return "Напишите сообщение в общий чат конференции";
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) return "Файл";
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

function buildAttachmentUrl(downloadUrl) {
  if (!downloadUrl) return "";
  return apiBaseUrl ? `${apiBaseUrl}${downloadUrl}` : downloadUrl;
}

export default function Chat() {
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
    const intervalId = window.setInterval(() => {
      loadChat(true);
    }, CHAT_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [activeScope, refreshVersion]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, activeScope]);

  const filteredMessages = filterMessages(messages, search);

  const switchChannel = (scope) => {
    const nextChannel = channels.find((channel) => channel.scope === scope);
    if (!nextChannel?.available || scope === activeScope) return;

    setDraft(activeScope, content);
    writeStorage(CHAT_LAST_SCOPE_KEY, scope);
    setActiveScope(scope);
    setContent(getDraft(scope));
    setSearch("");
    setError("");
    setLoading(true);
    setSyncing(false);
    setEditingMessageId(null);
    setEditingContent("");
    setCurrentChannel(nextChannel);
    setMessages([]);
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleComposerChange = (event) => {
    const nextValue = event.target.value;
    setContent(nextValue);
    setDraft(activeScope, nextValue);
  };

  const handleSend = async (event) => {
    event.preventDefault();
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
        await apiPost("/chat", {
          scope: activeScope,
          content: trimmed,
        });
      }

      setContent("");
      setDraft(activeScope, "");
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSyncing(true);
      setRefreshVersion((value) => value + 1);
    } catch (err) {
      setError(err.message || "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = (event) => {
    const nextFiles = Array.from(event.target.files || []);
    setSelectedFiles(nextFiles);
  };

  const removeSelectedFile = (indexToRemove) => {
    setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
    const remainingFiles = selectedFiles.filter((_, index) => index !== indexToRemove);
    if (fileInputRef.current) {
      const transfer = new DataTransfer();
      remainingFiles.forEach((file) => transfer.items.add(file));
      fileInputRef.current.files = transfer.files;
    }
  };

  const startEditing = (message) => {
    setEditingMessageId(message.id);
    setEditingContent(message.content);
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
      setRefreshVersion((value) => value + 1);
    } catch (err) {
      setError(err.message || "Не удалось сохранить изменения");
      setSyncing(false);
    }
  };

  const handleDelete = async (message) => {
    const confirmed = window.confirm("Удалить это сообщение?");
    if (!confirmed) return;

    setSyncing(true);
    setError("");
    try {
      await apiDelete(`/chat/${message.id}`);
      if (editingMessageId === message.id) {
        cancelEditing();
      }
      setRefreshVersion((value) => value + 1);
    } catch (err) {
      setError(err.message || "Не удалось удалить сообщение");
      setSyncing(false);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const handleDownloadAttachment = async (attachment) => {
    const token = getToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }

    try {
      const res = await fetch(buildAttachmentUrl(attachment.download_url), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        throw new Error("Не удалось скачать вложение");
      }
      const blob = await res.blob();
      triggerBlobDownload(blob, attachment.file_name || "attachment");
    } catch (err) {
      setError(err.message || "Не удалось скачать вложение");
    }
  };

  const canCompose = Boolean(currentChannel?.available) && !sending;

  return (
    <section className="panel chat-page">
      <div className="chat-shell">
        <aside className="chat-sidebar">
          <div className="chat-sidebar-head">
            <span className="badge">Conference Chat</span>
            <h2>Чаты конференции</h2>
            <p className="muted">
              Главный канал для всех участников и отдельный чат вашей секции с автоматическим обновлением.
            </p>
          </div>

          <div className="chat-channel-list" role="tablist" aria-label="Список каналов чата">
            {channels.map((channel) => {
              const isActive = channel.scope === activeScope;
              const showUnread = hasUnreadMessages(channel, activeScope);

              return (
                <button
                  key={channel.scope}
                  type="button"
                  className={`chat-channel-card${isActive ? " active" : ""}`}
                  onClick={() => switchChannel(channel.scope)}
                  disabled={!channel.available}
                  aria-pressed={isActive}
                >
                  <div className="chat-channel-card-head">
                    <div>
                      <strong>{channel.title}</strong>
                      <p>{channel.description}</p>
                    </div>
                    {showUnread ? <span className="chat-unread-dot" aria-hidden="true" /> : null}
                  </div>
                  <div className="chat-channel-card-meta">
                    <span>{channel.member_count} участников</span>
                    <span>{channel.message_count} сообщений</span>
                  </div>
                  <div className="chat-channel-card-foot">
                    <span>{formatRelativeActivity(channel.last_message_at)}</span>
                    {!channel.available ? <span className="chat-disabled-pill">недоступно</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="chat-main">
          <header className="chat-main-head">
            <div>
              <div className="chat-heading-row">
                <h3>{currentChannel?.title || "Загрузка чата..."}</h3>
                <span className={`chat-status-pill${syncing ? " syncing" : ""}`}>
                  {syncing ? "Синхронизация..." : "Онлайн"}
                </span>
              </div>
              <p>{currentChannel?.description || "Подготавливаем историю сообщений и участников."}</p>
            </div>

            <div className="chat-head-tools">
              <label className="chat-search">
                <span className="sr-only">Поиск по сообщениям</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск по имени или тексту"
                />
              </label>
              <div className="chat-head-stats">
                <span>{currentChannel?.member_count || 0} участников</span>
                <span>{currentChannel?.message_count || 0} сообщений</span>
              </div>
            </div>
          </header>

          {error ? <div className="chat-alert chat-alert-error">{error}</div> : null}

          <div className="chat-message-stream" ref={listRef}>
            {loading ? (
              <div className="chat-alert">Загружаем историю сообщений…</div>
            ) : filteredMessages.length === 0 ? (
              <div className="chat-empty-state">
                <strong>
                  {search.trim()
                    ? "По вашему запросу сообщений не найдено."
                    : currentChannel?.available
                      ? "Пока здесь тихо."
                      : "Чат секции пока недоступен."}
                </strong>
                <p>
                  {search.trim()
                    ? "Попробуйте изменить запрос или очистить строку поиска."
                    : currentChannel?.available
                      ? "Начните обсуждение первым сообщением."
                      : "Выберите секцию в профиле, чтобы открыть закрытый канал участников."}
                </p>
              </div>
            ) : (
              filteredMessages.map((message, index) => {
                const previousMessage = filteredMessages[index - 1];
                const currentDate = formatMessageDate(message.created_at);
                const previousDate = previousMessage ? formatMessageDate(previousMessage.created_at) : null;
                const showDateDivider = currentDate !== previousDate;
                const isEditing = editingMessageId === message.id;

                return (
                  <Fragment key={message.id}>
                    {showDateDivider ? <div className="chat-date-divider">{currentDate}</div> : null}
                    <article className={`chat-bubble${message.is_own ? " own" : ""}`}>
                      <div className="chat-avatar" aria-hidden="true">
                        {getInitials(message.user_name)}
                      </div>
                      <div className="chat-bubble-body">
                        <div className="chat-bubble-meta">
                          <div>
                            <strong>{message.user_name}</strong>
                            {message.user_meta ? <span>{message.user_meta}</span> : null}
                          </div>
                          <div className="chat-bubble-actions">
                            <time title={formatMessageDateTime(message.created_at)}>
                              {formatMessageTime(message.created_at)}
                            </time>
                            {message.edited_at ? <span className="chat-edited-tag">изменено</span> : null}
                            {message.can_edit ? (
                              <button type="button" className="chat-action-link" onClick={() => startEditing(message)}>
                                Изменить
                              </button>
                            ) : null}
                            {message.can_delete ? (
                              <button type="button" className="chat-action-link danger" onClick={() => handleDelete(message)}>
                                Удалить
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="chat-editor">
                            <textarea
                              value={editingContent}
                              onChange={(event) => setEditingContent(event.target.value)}
                              rows={3}
                              maxLength={2000}
                            />
                            <div className="chat-editor-actions">
                              <span>{editingContent.trim().length}/2000</span>
                              <button type="button" className="btn btn-ghost" onClick={cancelEditing}>
                                Отмена
                              </button>
                              <button type="button" className="btn btn-primary" onClick={() => handleSaveEdit(message.id)}>
                                Сохранить
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {message.content ? <p className="chat-bubble-text">{message.content}</p> : null}
                            {message.attachments?.length ? (
                              <div className="chat-attachment-list">
                                {message.attachments.map((attachment) => (
                                  <div key={attachment.id} className="chat-attachment-item">
                                    <div className="chat-attachment-meta">
                                      <strong>{attachment.file_name}</strong>
                                      <div className="muted">{formatFileSize(attachment.file_size)}</div>
                                    </div>
                                    <button
                                      type="button"
                                      className="chat-action-link"
                                      onClick={() => handleDownloadAttachment(attachment)}
                                    >
                                      Скачать
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </article>
                  </Fragment>
                );
              })
            )}
          </div>

          <form className="chat-composer" onSubmit={handleSend}>
            <div className="chat-composer-head">
              <strong>{currentChannel?.title || "Сообщение"}</strong>
              <span>Enter отправляет, Shift+Enter переносит строку</span>
            </div>
            <label className="chat-file-input muted">
              <span>Вложения</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={CHAT_ATTACHMENT_ACCEPT}
                onChange={handleFileChange}
                disabled={!canCompose}
              />
            </label>
            {selectedFiles.length ? (
              <div className="chat-selected-files">
                {selectedFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="chat-attachment-item">
                    <div className="chat-attachment-meta">
                      <strong>{file.name}</strong>
                      <div className="muted">{formatFileSize(file.size)}</div>
                    </div>
                    <button
                      type="button"
                      className="chat-action-link danger"
                      onClick={() => removeSelectedFile(index)}
                    >
                      Убрать
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              value={content}
              onChange={handleComposerChange}
              onKeyDown={handleComposerKeyDown}
              placeholder={getChannelInputPlaceholder(currentChannel)}
              rows={3}
              maxLength={2000}
              disabled={!canCompose}
            />
            <div className="chat-composer-foot">
              <span>
                {content.trim().length}/2000
                {selectedFiles.length ? ` · файлов: ${selectedFiles.length}` : ""}
              </span>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!canCompose || (!content.trim() && selectedFiles.length === 0)}
              >
                {sending ? "Отправка..." : "Отправить"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
