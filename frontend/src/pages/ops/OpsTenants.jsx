import Toast from "../../components/Toast.jsx";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet, apiPut } from "../../lib/api.js";
import "../console/console.css";
import "./ops.css";

const PLAN_LABEL = { free: "Бесплатный", kafedra: "Кафедра", institut: "Институт", universitet: "Университет" };
const STATUS_LABEL = { active: "Активен", suspended: "Приостановлен", archived: "В архиве" };
const STATUS_FILTERS = [
  { v: "all", label: "Все" },
  { v: "active", label: "Активные" },
  { v: "suspended", label: "Приостановленные" },
  { v: "archived", label: "В архиве" },
];
const PLANS = ["free", "kafedra", "institut", "universitet"];

export default function OpsTenants() {
  const [params] = useSearchParams();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(params.get("status") || "all");
  const [planFilter, setPlanFilter] = useState(params.get("plan") || "");
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(0);
  const [confirm, setConfirm] = useState(null); // { tenant, status, title, danger }
  const [reason, setReason] = useState("");

  const load = () => {
    setLoading(true);
    apiGet("/ops/tenants")
      .then((d) => setTenants(d?.tenants || []))
      .catch(() => setToast({ kind: "err", text: "Не удалось загрузить список тенантов." }))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Esc закрывает модал подтверждения (стандарт для aria-modal).
  useEffect(() => {
    if (!confirm) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setConfirm(null);
        setReason("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (planFilter && t.plan !== planFilter) return false;
      if (q && !(`${t.display_name} ${t.slug}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tenants, query, statusFilter, planFilter]);

  const applyStatus = async (tenant, status, why) => {
    setBusy(tenant.id);
    setToast(null);
    try {
      await apiPut(`/ops/tenants/${tenant.id}/status`, { status, reason: why || "" });
      setToast({ kind: "ok", text: `${tenant.display_name}: статус → ${STATUS_LABEL[status]}.` });
      load();
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось изменить статус." });
    } finally {
      setBusy(0);
      setConfirm(null);
      setReason("");
    }
  };

  const changePlan = async (tenant, plan) => {
    if (plan === tenant.plan) return;
    setBusy(tenant.id);
    setToast(null);
    try {
      await apiPut(`/ops/tenants/${tenant.id}/plan`, { plan });
      setToast({ kind: "ok", text: `${tenant.display_name}: тариф → ${PLAN_LABEL[plan]}.` });
      load();
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось сменить тариф." });
    } finally {
      setBusy(0);
    }
  };

  // Опасные действия (приостановка/архивация) — через подтверждение с причиной.
  const askConfirm = (tenant, status) =>
    setConfirm({
      tenant,
      status,
      title: status === "suspended" ? "Приостановить тенанта" : "Архивировать тенанта",
      body:
        status === "suspended"
          ? "Публичный сайт и консоль вуза будут заблокированы до возобновления."
          : "Вуз уйдёт в архив: сайт отключается, доступ ограничен.",
      danger: true,
    });

  return (
    <div className="con-screen">
      <Toast toast={toast} />

      <div className="con-eyebrow">Оператор · тенанты</div>
      <h2 className="con-h2" style={{ marginBottom: 18 }}>Вузы на платформе</h2>

      <div className="ops-filters">
        <input
          className="con-input-static ops-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию или поддомену"
          aria-label="Поиск тенанта"
        />
        <div className="ops-chips" role="group" aria-label="Фильтр по статусу">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.v}
              type="button"
              className={`ops-chip${statusFilter === f.v ? " active" : ""}`}
              aria-pressed={statusFilter === f.v}
              onClick={() => setStatusFilter(f.v)}
            >
              {f.label}
            </button>
          ))}
          {planFilter ? (
            <button type="button" className="ops-chip active" onClick={() => setPlanFilter("")}>
              Тариф: {PLAN_LABEL[planFilter] || planFilter} ✕
            </button>
          ) : null}
        </div>
      </div>

      <div className="con-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="ops-row ops-head" role="row">
          <span role="columnheader">Вуз</span>
          <span role="columnheader">Тариф</span>
          <span role="columnheader">Статус</span>
          <span role="columnheader">Конф.</span>
          <span role="columnheader">Участн.</span>
          <span role="columnheader">Создан</span>
          <span role="columnheader">Действия</span>
        </div>

        {loading ? (
          <div className="con-sub" style={{ padding: 20 }}>Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div className="con-sub" style={{ padding: 20 }}>
            {tenants.length === 0 ? "Пока нет ни одного вуза." : "По заданным фильтрам ничего не найдено."}
          </div>
        ) : (
          filtered.map((t) => (
            <div className="ops-row" role="row" key={t.id}>
              <span className="ops-tenant">
                <b>{t.display_name}</b>
                <span>{t.slug}.kvorum.ru</span>
              </span>
              <select
                className="ops-plan-select"
                value={t.plan}
                disabled={busy === t.id || t.status === "archived"}
                onChange={(e) => changePlan(t, e.target.value)}
                aria-label={`Тариф ${t.display_name}`}
              >
                {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
              </select>
              <span className={`ops-status ops-status-${t.status}`}>{STATUS_LABEL[t.status] || t.status}</span>
              <span className="ops-num">{t.conferences}</span>
              <span className="ops-num">{t.participants}</span>
              <span className="ops-date">{t.created_at}</span>
              <span className="ops-actions">
                {t.status === "active" ? (
                  <button type="button" className="ops-act ops-act-danger" disabled={busy === t.id} onClick={() => askConfirm(t, "suspended")}>Приостановить</button>
                ) : null}
                {t.status === "suspended" ? (
                  <button type="button" className="ops-act ops-act-ok" disabled={busy === t.id} onClick={() => applyStatus(t, "active")}>Возобновить</button>
                ) : null}
                {t.status === "archived" ? (
                  <button type="button" className="ops-act ops-act-ok" disabled={busy === t.id} onClick={() => applyStatus(t, "active")}>Восстановить</button>
                ) : (
                  <button type="button" className="ops-act" disabled={busy === t.id} onClick={() => askConfirm(t, "archived")}>В архив</button>
                )}
              </span>
            </div>
          ))
        )}
      </div>
      <p className="con-sub" style={{ marginTop: 12 }}>{filtered.length} из {tenants.length} вузов</p>

      {confirm ? (
        <div className="ops-modal-scrim" role="dialog" aria-modal="true" aria-label={confirm.title} onClick={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="ops-modal">
            <h3>{confirm.title}</h3>
            <p className="con-sub" style={{ margin: "0 0 14px" }}><b>{confirm.tenant.display_name}</b>. {confirm.body}</p>
            <label className="con-field">
              <span>Причина (зафиксируется в аудите)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: неоплата подписки" autoFocus />
            </label>
            <div className="ops-modal-actions">
              <button type="button" className="con-btn con-btn-ghost" onClick={() => { setConfirm(null); setReason(""); }}>Отмена</button>
              <button type="button" className="con-btn ops-btn-danger" disabled={busy === confirm.tenant.id} onClick={() => applyStatus(confirm.tenant, confirm.status, reason)}>
                {confirm.status === "suspended" ? "Приостановить" : "Архивировать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
