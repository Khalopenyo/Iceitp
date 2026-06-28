import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../lib/api.js";
import { setUser } from "../lib/auth.js";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card, Field, Input, Select, Textarea, Button } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import { getConferenceTitle, formatConferenceDateRange } from "../lib/conference.js";
import "./register.css";

function normalizeRussianPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  let normalized = digits;
  if (normalized.length === 10) {
    normalized = `7${normalized}`;
  } else if (normalized.length === 11 && normalized.startsWith("8")) {
    normalized = `7${normalized.slice(1)}`;
  }
  if (normalized.length !== 11 || !normalized.startsWith("7") || normalized[1] !== "9") {
    return "";
  }
  return `+${normalized}`;
}

function formatRussianPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  let normalized = digits;
  if (normalized.startsWith("8")) normalized = `7${normalized.slice(1)}`;
  if (!normalized.startsWith("7")) normalized = `7${normalized}`;
  normalized = normalized.slice(0, 11);
  let result = `+${normalized.slice(0, 1)}`;
  if (normalized.slice(1, 4)) result += ` ${normalized.slice(1, 4)}`;
  if (normalized.slice(4, 7)) result += ` ${normalized.slice(4, 7)}`;
  if (normalized.slice(7, 9)) result += `-${normalized.slice(7, 9)}`;
  if (normalized.slice(9, 11)) result += `-${normalized.slice(9, 11)}`;
  return result;
}

const degreeGroups = [
  { label: "Основное", options: ["Преподаватель"] },
  { label: "Учащийся", options: ["Студент", "Магистрант", "Аспирант"] },
  {
    label: "Ученая степень/звание",
    options: ["Кандидат наук, доцент", "Доктор наук, доцент", "Доктор наук, профессор"],
  },
];

const STEPS = ["Тип участия", "Профиль", "Доклад", "Телефон", "Согласия"];

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sections, setSections] = useState([]);
  const [conference, setConference] = useState(null);
  const [loading, setLoading] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState("form"); // form | code | done
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  // Демо-режим без СМС: бэкенд возвращает фиксированный код (FIXED_AUTH_CODE),
  // мы его подставляем и показываем подсказку вместо «проверьте Telegram».
  const [demoCode, setDemoCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [form, setForm] = useState({
    email: "",
    password: "",
    user_type: "offline",
    role: "author",
    full_name: "",
    organization: "",
    position: "",
    city: "",
    degree: "",
    section_id: "",
    talk_title: "",
    coauthors: "",
    abstract: "",
    phone: "",
    consent_personal_data: false,
    consent_publication: false,
    consent_version: "registration-consent-v1",
  });

  useEffect(() => {
    apiGet("/sections").then(setSections).catch(() => setSections([]));
    apiGet("/conference").then(setConference).catch(() => setConference(null));
  }, []);

  useEffect(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    if (mode === "online" || mode === "offline") {
      setForm((prev) => ({ ...prev, user_type: mode }));
    }
  }, [location.search]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => setCooldown((p) => (p > 1 ? p - 1 : 0)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const update = (field, value) => {
    setErrorMessage("");
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isListener = form.role === "listener";
  const selectedSection = useMemo(
    () => sections.find((s) => String(s.id) === String(form.section_id)),
    [sections, form.section_id]
  );
  const normalizedPhone = useMemo(() => normalizeRussianPhone(form.phone), [form.phone]);

  const payload = useMemo(
    () => ({
      ...form,
      phone: normalizedPhone || form.phone,
      section_id: isListener || !form.section_id ? null : Number(form.section_id),
    }),
    [form, normalizedPhone, isListener]
  );

  // Переход между шагами учитывает роль: слушатель пропускает шаг 3 «Доклад».
  const nextStep = () => {
    setErrorMessage("");
    if (step === 2 && isListener) {
      setStep(4);
      return;
    }
    setStep(step + 1);
  };
  const prevStep = () => {
    setErrorMessage("");
    setStatusMessage("");
    if (step === 4 && isListener) {
      setStep(2);
      return;
    }
    setStep(step - 1);
  };

  const requestCode = async (e) => {
    if (e) e.preventDefault();
    if (!form.consent_personal_data || !form.consent_publication) {
      setErrorMessage("Подтвердите обязательные согласия.");
      return;
    }
    if (!normalizedPhone) {
      setErrorMessage("Введите российский мобильный номер в формате +7 999 123-45-67.");
      return;
    }
    if (!isListener && !form.section_id) {
      setErrorMessage("Выберите секцию конференции.");
      return;
    }
    setRequestingCode(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const data = await apiPost("/auth/register/request-code", payload);
      setVerificationToken(data.verification_token);
      setCooldown(Number(data.cooldown_seconds) || 60);
      if (data.demo_code) {
        // Демо-режим: код заранее известен — подставляем и поясняем.
        setDemoCode(String(data.demo_code));
        setVerificationCode(String(data.demo_code));
        setStatusMessage(`Демо-режим: код подтверждения — ${data.demo_code}. Он уже подставлен, нажмите «Завершить регистрацию».`);
      } else {
        setDemoCode("");
        setVerificationCode("");
        setStatusMessage(data.message || "Код отправлен в Telegram");
      }
      setPhase("code");
    } catch (err) {
      setErrorMessage(err.message || "Не удалось отправить код подтверждения.");
    } finally {
      setRequestingCode(false);
    }
  };

  const verifyCode = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await apiPost("/auth/register/verify", {
        verification_token: verificationToken,
        code: verificationCode,
      });
      if (data.user) setUser(data.user);
      setPhase("done");
    } catch (err) {
      setErrorMessage(err.message || "Не удалось подтвердить код.");
    } finally {
      setLoading(false);
    }
  };

  const dateLabel = formatConferenceDateRange(conference?.starts_at, conference?.ends_at);

  // ===== Экран «готово» =====
  if (phase === "done") {
    return (
      <Card className="reg-card reg-done">
        <div className="reg-done-ic" aria-hidden="true">
          ✓
        </div>
        <h1>Вы зарегистрированы!</h1>
        <p className="reg-done-sub">Заявка участника принята. Личный кабинет уже доступен.</p>
        <div className="reg-summary">
          <div className="reg-summary-row">
            <strong>{form.full_name || "Участник"}</strong>
            <span>
              {isListener ? "Слушатель" : "Автор"} ·{" "}
              {form.user_type === "online" ? "онлайн" : "офлайн"}
            </span>
          </div>
          {!isListener && selectedSection ? (
            <div className="reg-summary-row">
              <strong>{selectedSection.title}</strong>
              {form.talk_title ? <span>«{form.talk_title}»</span> : null}
            </div>
          ) : null}
          {dateLabel ? (
            <div className="reg-summary-row">
              <strong>{dateLabel}</strong>
              <span>{getConferenceTitle(conference)}</span>
            </div>
          ) : null}
        </div>
        <div className="reg-actions">
          <button type="button" className={buttonClassName("primary")} onClick={() => navigate("/dashboard")}>
            Перейти в личный кабинет
          </button>
          <Link className={buttonClassName("ghost")} to="/">
            На сайт конференции
          </Link>
        </div>
      </Card>
    );
  }

  // ===== Экран ввода кода =====
  if (phase === "code") {
    return (
      <Card className="reg-card">
        <h1>Подтверждение регистрации</h1>
        {demoCode ? (
          <p className="reg-note">
            Подтверждение по СМС временно отключено. Введите код <strong>{demoCode}</strong> —
            он уже подставлен ниже, просто нажмите «Завершить регистрацию».
          </p>
        ) : (
          <p className="reg-note">
            Мы отправили код подтверждения для номера <strong>{normalizedPhone || form.phone}</strong>.
            Проверьте Telegram, привязанный к этому номеру.
          </p>
        )}
        {errorMessage ? (
          <div className="auth-status auth-status-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
        {statusMessage ? (
          <div className="auth-status auth-status-success" role="status">
            {statusMessage}
          </div>
        ) : null}
        <form onSubmit={verifyCode}>
          <Field label="Код подтверждения" htmlFor="reg-code">
            <Input
              id="reg-code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="4 цифры"
              required
            />
          </Field>
          {demoCode ? null : (
            <div className="reg-resend">
              <button
                type="button"
                className={buttonClassName("ghost")}
                onClick={requestCode}
                disabled={requestingCode || cooldown > 0}
              >
                {requestingCode
                  ? "Отправка…"
                  : cooldown > 0
                    ? `Повтор через ${cooldown}с`
                    : "Отправить код заново"}
              </button>
            </div>
          )}
          <div className="reg-actions">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setPhase("form");
                setErrorMessage("");
              }}
            >
              Изменить данные
            </Button>
            <Button type="submit" disabled={loading || !verificationCode.trim() || !verificationToken}>
              {loading ? "Проверка…" : "Завершить регистрацию"}
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  // ===== Мастер регистрации =====
  return (
    <Card className="reg-card">
      <h1>Регистрация на конференцию</h1>
      {conference ? (
        <p className="reg-subtitle">
          {getConferenceTitle(conference)}
          {dateLabel ? ` · ${dateLabel}` : ""}
        </p>
      ) : null}

      <div className="reg-stepper" aria-label={`Шаг ${step} из ${STEPS.length}`}>
        {STEPS.map((label, idx) => (
          <div
            key={label}
            className={`reg-step ${step === idx + 1 ? "active" : ""} ${
              isListener && idx === 2 ? "skipped" : ""
            }`}
            aria-current={step === idx + 1 ? "step" : undefined}
          >
            {idx + 1}. {label}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => e.preventDefault()}>
        {errorMessage ? (
          <div className="auth-status auth-status-error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {step === 1 && (
          <>
            <div className="reg-group-label">Формат участия</div>
            <div className="reg-choice-grid">
              {[
                { v: "offline", t: "Офлайн", d: "на площадке вуза" },
                { v: "online", t: "Онлайн", d: "трансляция и Q&A" },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.v}
                  className={`reg-choice ${form.user_type === opt.v ? "active" : ""}`}
                  aria-pressed={form.user_type === opt.v}
                  onClick={() => update("user_type", opt.v)}
                >
                  <strong>{opt.t}</strong>
                  <span>{opt.d}</span>
                </button>
              ))}
            </div>

            <div className="reg-group-label">Роль</div>
            <div className="reg-choice-grid">
              {[
                { v: "author", t: "Автор / докладчик", d: "с докладом и секцией" },
                { v: "listener", t: "Слушатель", d: "без доклада" },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.v}
                  className={`reg-choice ${form.role === opt.v ? "active" : ""}`}
                  aria-pressed={form.role === opt.v}
                  onClick={() => update("role", opt.v)}
                >
                  <strong>{opt.t}</strong>
                  <span>{opt.d}</span>
                </button>
              ))}
            </div>

            <div className="reg-group-label">Способ входа</div>
            <div className="reg-choice-grid">
              <div className="reg-choice active" aria-disabled="true">
                <strong>По e-mail / телефону</strong>
                <span>заполните профиль на следующем шаге</span>
              </div>
              <div className="reg-choice reg-choice-soon" aria-disabled="true">
                <strong>Войти через Госуслуги</strong>
                <span>ЕСИА — скоро</span>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="ФИО" htmlFor="reg-full-name">
              <Input
                id="reg-full-name"
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                required
              />
            </Field>
            <Field label="Ученая степень/звание" htmlFor="reg-degree">
              <Select id="reg-degree" value={form.degree} onChange={(e) => update("degree", e.target.value)}>
                <option value="">Выберите степень/звание</option>
                {degreeGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((degree) => (
                      <option key={degree} value={degree}>
                        {degree}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="Должность" htmlFor="reg-position">
              <Input id="reg-position" value={form.position} onChange={(e) => update("position", e.target.value)} />
            </Field>
            <Field label="Место работы" htmlFor="reg-organization">
              <Input
                id="reg-organization"
                value={form.organization}
                onChange={(e) => update("organization", e.target.value)}
              />
            </Field>
            <Field label="Город" htmlFor="reg-city">
              <Input id="reg-city" value={form.city} onChange={(e) => update("city", e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="reg-email">
              <Input
                id="reg-email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Пароль" htmlFor="reg-password">
              <Input
                id="reg-password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
          </>
        )}

        {step === 3 && !isListener && (
          <>
            <Field label="Секция (тема конференции)" htmlFor="reg-section">
              <Select
                id="reg-section"
                value={form.section_id}
                onChange={(e) => update("section_id", e.target.value)}
                required
              >
                <option value="">Выберите секцию</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                    {s.room ? ` — ${s.room}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Тема доклада" htmlFor="reg-talk">
              <Input
                id="reg-talk"
                value={form.talk_title}
                onChange={(e) => update("talk_title", e.target.value)}
                required
              />
            </Field>
            <Field label="Соавторы (через запятую)" htmlFor="reg-coauthors">
              <Input
                id="reg-coauthors"
                value={form.coauthors}
                onChange={(e) => update("coauthors", e.target.value)}
                placeholder="Петрова А. С., ИЦЭиТП"
              />
            </Field>
            <Field label="Аннотация / тезисы" htmlFor="reg-abstract">
              <Textarea
                id="reg-abstract"
                value={form.abstract}
                onChange={(e) => update("abstract", e.target.value)}
                rows={4}
                placeholder="Краткое описание доклада"
              />
            </Field>
            <p className="reg-hint">
              Файл тезисов можно загрузить в личном кабинете после регистрации.
            </p>
          </>
        )}

        {step === 4 && (
          <>
            <Field label="Телефон" htmlFor="reg-phone">
              <Input
                id="reg-phone"
                type="tel"
                inputMode="tel"
                placeholder="+7 999 123-45-67"
                value={form.phone}
                onChange={(e) => update("phone", formatRussianPhone(e.target.value))}
                required
              />
              <p className="reg-hint">
                Код подтверждения придёт в Telegram на этот номер. Укажите актуальный номер,
                привязанный к Telegram.
              </p>
            </Field>
          </>
        )}

        {step === 5 && (
          <>
            <label className="reg-consent">
              <input
                type="checkbox"
                checked={form.consent_personal_data}
                onChange={(e) => update("consent_personal_data", e.target.checked)}
              />
              <span>
                Я даю согласие на обработку персональных данных в соответствии с{" "}
                <Link to="/personal-data">Политикой обработки ПДн (152-ФЗ)</Link>.{" "}
                <em>Обязательно</em>
              </span>
            </label>
            <label className="reg-consent">
              <input
                type="checkbox"
                checked={form.consent_publication}
                onChange={(e) => update("consent_publication", e.target.checked)}
              />
              <span>
                Я принимаю{" "}
                <Link to="/consent-authors">согласие на публикацию материалов и сведений об авторе</Link>.{" "}
                <em>Обязательно</em>
              </span>
            </label>
            <div className="reg-banner">
              Оператор ПДн — организатор конференции. Вы можете отозвать согласие в личном кабинете.
            </div>
          </>
        )}

        <div className="reg-actions">
          {step > 1 ? (
            <Button variant="ghost" type="button" onClick={prevStep}>
              Назад
            </Button>
          ) : null}
          {step < 5 ? (
            <Button
              type="button"
              onClick={nextStep}
              disabled={
                (step === 2 && (!form.full_name.trim() || !form.email.trim() || !form.password)) ||
                (step === 3 && !isListener && (!form.section_id || !form.talk_title.trim())) ||
                (step === 4 && !normalizedPhone)
              }
            >
              Далее
            </Button>
          ) : (
            <Button
              type="button"
              onClick={requestCode}
              disabled={requestingCode || !form.consent_personal_data || !form.consent_publication}
            >
              {requestingCode ? "Отправка…" : "Завершить регистрацию"}
            </Button>
          )}
        </div>
      </form>

      <p className="auth-links">
        Уже зарегистрированы? <Link to="/login">Войти</Link>
      </p>
    </Card>
  );
}
