import Toast from "../../components/Toast.jsx";
import { initials as initialsOf } from "../../lib/format.js";
import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../../lib/api.js";
import { getUser } from "../../lib/auth.js";
import "./console.css";

const ROLE_LABEL = { curator: "Куратор", moderator: "Модератор", editor: "Редактор", booth: "Стендист" };
const ROLE_STYLE = {
  curator: { background: "var(--accent-wash)", color: "var(--accent)" },
  moderator: { background: "#e8f1fb", color: "#1e3a8a" },
  editor: { background: "var(--warn-wash)", color: "var(--warn)" },
  booth: { background: "var(--ok-wash)", color: "var(--ok)" },
};
// Порядок как в макете «Кворум».
const ROLE_OPTIONS = [["moderator", "Модератор"], ["editor", "Редактор"], ["booth", "Стендист"], ["curator", "Куратор"]];

const initials = (text) => initialsOf(text, "—", /[\s@.]+/);

function badge(style, children, key) {
  return (
    <span key={key} style={{ ...style, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export default function ConsoleTeam() {
  const isOwner = ["org", "admin"].includes(getUser()?.role);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("moderator");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () => {
    apiGet("/admin/team")
      .then((r) => setMembers(Array.isArray(r?.members) ? r.members : []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const invite = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setToast({ kind: "err", text: "Укажите e-mail коллеги." });
      return;
    }
    setInviting(true);
    setToast(null);
    setInviteLink("");
    try {
      const r = await apiPost("/admin/team", { email: email.trim(), name: "", role });
      setInviteLink(r?.invite_url || "");
      setCopied(false);
      setEmail("");
      setToast({ kind: "ok", text: "Приглашение создано — отправьте коллеге ссылку ниже." });
      load();
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось пригласить." });
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (id, nextRole) => {
    try {
      await apiPut(`/admin/team/${id}`, { role: nextRole });
      setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, role: nextRole } : m)));
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось изменить роль." });
    }
  };

  const remove = async (id, name) => {
    if (!window.confirm(`Убрать ${name} из команды?`)) return;
    try {
      await apiDelete(`/admin/team/${id}`);
      setMembers((ms) => ms.filter((m) => m.id !== id));
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось убрать участника." });
    }
  };

  const copyLink = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      // Toast (role=status) also announces success to screen readers.
      setToast({ kind: "ok", text: "Ссылка скопирована." });
    } catch {
      setCopied(false);
      setToast({ kind: "err", text: "Не удалось скопировать — выделите ссылку вручную." });
    }
  };

  return (
    <div className="con-screen">
      <Toast toast={toast} />

      <div className="con-eyebrow">Команда · оргкомитет</div>
      <h2 className="con-h2" style={{ marginBottom: 6 }}>Кто работает над конференцией</h2>
      <p className="con-sub" style={{ maxWidth: 600, marginBottom: 22 }}>
        Пригласите коллег и распределите роли: модераторы разбирают вопросы, редакторы ведут
        программу, стендисты отмечают гостей на входе.
      </p>

      {isOwner ? (
        <form onSubmit={invite} style={{ display: "flex", gap: 10, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: inviteLink ? 12 : 18 }}>
          <input
            type="email"
            className="con-team-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e-mail коллеги"
            autoComplete="off"
            aria-label="E-mail коллеги"
            style={{ flex: 1, height: 44, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 9, fontSize: 14, color: "var(--ink)", background: "var(--surface)", fontFamily: "var(--con-font)" }}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Роль" style={{ height: 44, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 9, fontSize: 14, color: "var(--ink)", background: "var(--surface)", fontFamily: "var(--con-font)" }}>
            {ROLE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <button type="submit" className="con-btn" style={{ height: 44, justifyContent: "center" }} disabled={inviting}>
            {inviting ? "Приглашаем…" : "Пригласить"}
          </button>
        </form>
      ) : null}

      {inviteLink ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--accent-wash)", border: "1px solid var(--accent)", borderRadius: 10, padding: "12px 14px", marginBottom: 18 }}>
          <span style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap" }}>Ссылка-приглашение:</span>
          <code style={{ flex: 1, minWidth: 0, fontFamily: "var(--con-mono)", fontSize: 12, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inviteLink}</code>
          <button type="button" className="con-btn con-btn-ghost" style={{ height: 36 }} onClick={copyLink}>
            {copied ? "Скопировано ✓" : "Скопировать"}
          </button>
        </div>
      ) : null}

      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div className="con-sub" style={{ padding: 20, margin: 0 }}>Загрузка команды…</div>
        ) : members.length === 0 ? (
          // Бэкенд всегда добавляет строку владельца, поэтому пустой список = сбой загрузки.
          <div className="con-sub" style={{ padding: 20, margin: 0 }}>Не удалось загрузить команду. Обновите страницу.</div>
        ) : (
          members.map((m, i) => {
            const showName = m.name && m.name !== m.email;
            return (
              <div key={`${m.owner ? "owner" : m.id}-${m.email}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 20px", borderBottom: i < members.length - 1 ? "1px solid var(--line)" : "none" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--accent-wash)", color: "var(--accent)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, flex: "none" }}>
                  {initials(showName ? m.name : m.email)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis" }}>{showName ? m.name : m.email}</div>
                  {showName ? <div style={{ fontSize: 12, color: "var(--muted)" }}>{m.email}</div> : null}
                </div>
                {m.owner ? badge({ background: "var(--ink)", color: "var(--surface)" }, "Владелец") : null}
                {isOwner && !m.owner ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                      aria-label={`Роль: ${m.email}`}
                      style={{ height: 32, padding: "0 8px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5, color: "var(--ink)", background: "var(--surface)", fontFamily: "var(--con-font)" }}
                    >
                      {ROLE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                    <button type="button" className="con-icon-btn" onClick={() => remove(m.id, m.name || m.email)} aria-label={`Убрать ${m.email}`} title="Убрать из команды">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </>
                ) : (
                  badge(ROLE_STYLE[m.role] || {}, ROLE_LABEL[m.role] || m.role)
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
