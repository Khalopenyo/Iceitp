import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../lib/api.js";
import { setUser } from "../lib/auth.js";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card, Field, Input, Select, Button } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./register.css";

function normalizeRussianPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }
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
  if (!digits) {
    return "";
  }
  let normalized = digits;
  if (normalized.startsWith("8")) {
    normalized = `7${normalized.slice(1)}`;
  }
  if (!normalized.startsWith("7")) {
    normalized = `7${normalized}`;
  }
  normalized = normalized.slice(0, 11);
  const country = normalized.slice(0, 1);
  const part1 = normalized.slice(1, 4);
  const part2 = normalized.slice(4, 7);
  const part3 = normalized.slice(7, 9);
  const part4 = normalized.slice(9, 11);
  let result = `+${country}`;
  if (part1) result += ` ${part1}`;
  if (part2) result += ` ${part2}`;
  if (part3) result += `-${part3}`;
  if (part4) result += `-${part4}`;
  return result;
}

const degreeGroups = [
  {
    label: "Основное",
    options: ["Преподаватель"],
  },
  {
    label: "Учащийся",
    options: ["Студент", "Магистрант", "Аспирант"],
  },
  {
    label: "Ученая степень/звание",
    options: ["Кандидат наук, доцент", "Доктор наук, доцент", "Доктор наук, профессор"],
  },
];

const cityOptions = [
  "Москва",
  "Санкт-Петербург",
  "Новосибирск",
  "Екатеринбург",
  "Казань",
  "Нижний Новгород",
  "Челябинск",
  "Самара",
  "Омск",
  "Ростов-на-Дону",
  "Уфа",
  "Красноярск",
  "Воронеж",
  "Пермь",
  "Волгоград",
  "Краснодар",
  "Саратов",
  "Тюмень",
  "Тольятти",
  "Ижевск",
  "Барнаул",
  "Иркутск",
  "Хабаровск",
  "Ярославль",
  "Владивосток",
  "Махачкала",
  "Томск",
  "Оренбург",
  "Кемерово",
  "Новокузнецк",
  "Рязань",
  "Астрахань",
  "Пенза",
  "Липецк",
  "Киров",
  "Чебоксары",
  "Тула",
  "Калининград",
  "Курск",
  "Ставрополь",
  "Улан-Удэ",
  "Тверь",
  "Магнитогорск",
  "Сочи",
  "Белгород",
  "Владимир",
  "Архангельск",
  "Чита",
  "Набережные Челны",
  "Севастополь",
  "Симферополь",
  "Калуга",
  "Смоленск",
  "Якутск",
  "Сургут",
  "Ханты-Мансийск",
  "Нижний Тагил",
  "Брянск",
  "Иваново",
  "Орёл",
  "Кострома",
  "Вологда",
  "Псков",
  "Саранск",
  "Ульяновск",
  "Петрозаводск",
  "Мурманск",
  "Тамбов",
  "Сыктывкар",
  "Нижневартовск",
  "Абакан",
  "Биробиджан",
  "Грозный",
  "Майкоп",
  "Назрань",
  "Элиста",
  "Петропавловск-Камчатский",
  "Южно-Сахалинск",
  "Кемь",
];

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [step, setStep] = useState(1);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [cityActiveIndex, setCityActiveIndex] = useState(-1);
  const [form, setForm] = useState({
    email: "",
    password: "",
    user_type: "online",
    full_name: "",
    organization: "",
    position: "",
    city: "",
    degree: "",
    section_id: "",
    talk_title: "",
    phone: "",
    consent_personal_data: false,
    consent_publication: false,
    consent_version: "registration-consent-v1",
  });

  useEffect(() => {
    apiGet("/sections")
      .then(setSections)
      .catch(() => setSections([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mode = params.get("mode");
    if (mode === "online" || mode === "offline") {
      setForm((prev) => ({ ...prev, user_type: mode }));
    }
  }, [location.search]);

  useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const update = (field, value) => {
    setErrorMessage("");
    setStatusMessage("");
    setVerificationToken("");
    setVerificationCode("");
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const selectedSection = useMemo(
    () => sections.find((s) => String(s.id) === String(form.section_id)),
    [sections, form.section_id]
  );

  const normalizedPhone = useMemo(() => normalizeRussianPhone(form.phone), [form.phone]);

  const cityMatches = useMemo(
    () =>
      cityOptions
        .filter((city) => city.toLowerCase().includes(form.city.toLowerCase()))
        .slice(0, 8),
    [form.city]
  );

  const payload = useMemo(
    () => ({
      ...form,
      phone: normalizedPhone || form.phone,
      section_id: form.section_id ? Number(form.section_id) : null,
    }),
    [form, normalizedPhone]
  );

  const requestCode = async (e) => {
    if (e) {
      e.preventDefault();
    }
    if (!form.section_id) {
      setErrorMessage("Выберите секцию конференции перед отправкой анкеты.");
      return;
    }
    if (!normalizedPhone) {
      setErrorMessage("Введите российский мобильный номер в формате +7 999 123-45-67.");
      return;
    }
    setRequestingCode(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const data = await apiPost("/auth/register/request-code", payload);
      setVerificationToken(data.verification_token);
      setVerificationCode("");
      setCooldown(Number(data.cooldown_seconds) || 60);
      setStatusMessage(data.message || "Код отправлен в Telegram");
      setStep(4);
    } catch (err) {
      setErrorMessage(err.message || "Не удалось отправить код подтверждения.");
    } finally {
      setRequestingCode(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await apiPost("/auth/register/verify", {
        verification_token: verificationToken,
        code: verificationCode,
      });
      if (data.user) {
        setUser(data.user);
      }
      navigate("/dashboard");
    } catch (err) {
      setErrorMessage(err.message || "Не удалось подтвердить код.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    if (step === 4) {
      verifyCode(e);
      return;
    }
    if (step === 3) {
      requestCode(e);
      return;
    }
    e.preventDefault();
  };

  const steps = ["1. Личные данные", "2. Участие", "3. Доступ", "4. Подтверждение"];

  return (
    <Card className="reg-card">
      <h1>Регистрация участника</h1>
      <div className="reg-stepper" aria-label={`Этапы регистрации, шаг ${step} из ${steps.length}`}>
        {steps.map((label, idx) => (
          <div
            key={label}
            className={`reg-step ${step === idx + 1 ? "active" : ""}`}
            aria-current={step === idx + 1 ? "step" : undefined}
          >
            {label}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
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

        {step === 1 && (
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
              <Select
                id="reg-degree"
                value={form.degree}
                onChange={(e) => update("degree", e.target.value)}
              >
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
              <Input
                id="reg-position"
                value={form.position}
                onChange={(e) => update("position", e.target.value)}
              />
            </Field>
            <Field label="Место работы" htmlFor="reg-organization">
              <Input
                id="reg-organization"
                value={form.organization}
                onChange={(e) => update("organization", e.target.value)}
              />
            </Field>
            <Field label="Город" htmlFor="reg-city" className="reg-city">
              <Input
                id="reg-city"
                role="combobox"
                aria-expanded={showCityDropdown && cityMatches.length > 0}
                aria-controls="reg-city-listbox"
                aria-autocomplete="list"
                aria-activedescendant={
                  showCityDropdown && cityActiveIndex >= 0
                    ? `reg-city-opt-${cityActiveIndex}`
                    : undefined
                }
                value={form.city}
                onChange={(e) => {
                  update("city", e.target.value);
                  setShowCityDropdown(true);
                  setCityActiveIndex(-1);
                }}
                onFocus={() => setShowCityDropdown(true)}
                onBlur={() => setTimeout(() => setShowCityDropdown(false), 150)}
                onKeyDown={(e) => {
                  if (!showCityDropdown && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                    setShowCityDropdown(true);
                    return;
                  }
                  if (e.key === "ArrowDown" && cityMatches.length > 0) {
                    e.preventDefault();
                    setCityActiveIndex((prev) => (prev + 1) % cityMatches.length);
                  } else if (e.key === "ArrowUp" && cityMatches.length > 0) {
                    e.preventDefault();
                    setCityActiveIndex((prev) => (prev <= 0 ? cityMatches.length - 1 : prev - 1));
                  } else if (e.key === "Enter" && cityActiveIndex >= 0 && cityMatches[cityActiveIndex]) {
                    e.preventDefault();
                    update("city", cityMatches[cityActiveIndex]);
                    setShowCityDropdown(false);
                    setCityActiveIndex(-1);
                  } else if (e.key === "Escape") {
                    setShowCityDropdown(false);
                    setCityActiveIndex(-1);
                  }
                }}
                placeholder="Начните вводить..."
                autoComplete="off"
              />
              {showCityDropdown && cityMatches.length > 0 && (
                <ul className="reg-city-menu" id="reg-city-listbox" role="listbox">
                  {cityMatches.map((city, idx) => (
                    <li
                      key={city}
                      id={`reg-city-opt-${idx}`}
                      role="option"
                      aria-selected={idx === cityActiveIndex}
                    >
                      <button
                        type="button"
                        className={`reg-city-option${idx === cityActiveIndex ? " active" : ""}`}
                        onMouseDown={(e) => {
                          // mousedown срабатывает до blur инпута — выбор не теряется
                          e.preventDefault();
                          update("city", city);
                          setShowCityDropdown(false);
                          setCityActiveIndex(-1);
                        }}
                      >
                        {city}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Формат участия" htmlFor="reg-user-type">
              <Select
                id="reg-user-type"
                value={form.user_type}
                onChange={(e) => update("user_type", e.target.value)}
              >
                <option value="online">Онлайн</option>
                <option value="offline">Оффлайн</option>
              </Select>
            </Field>
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
            {selectedSection && (
              <p className="reg-hint">
                Назначенная аудитория:{" "}
                <strong>{selectedSection.room || "пока не назначена"}</strong>
              </p>
            )}
            <Field label="Название доклада" htmlFor="reg-talk-title">
              <Input
                id="reg-talk-title"
                value={form.talk_title}
                onChange={(e) => update("talk_title", e.target.value)}
                required
              />
            </Field>
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
                Важно: код подтверждения придет в Telegram на этот номер. Укажите ваш актуальный
                номер, к которому привязан Telegram.
              </p>
              <p className="reg-hint">
                Допустимые варианты: +7 999 123-45-67, 89991234567, 9991234567.
              </p>
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Email" htmlFor="reg-email">
              <Input
                id="reg-email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
              />
            </Field>
            <Field label="Пароль" htmlFor="reg-password">
              <Input
                id="reg-password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                required
              />
            </Field>
            <label className="reg-checkbox">
              <input
                type="checkbox"
                checked={form.consent_personal_data}
                onChange={(e) => update("consent_personal_data", e.target.checked)}
              />
              <span>
                Я ознакомлен(а) с{" "}
                <Link to="/personal-data">Политикой обработки персональных данных</Link> и даю
                согласие на регистрацию, организацию участия, формирование программы, выпуск бейджа,
                сертификата и других материалов конференции.
              </span>
            </label>
            <label className="reg-checkbox">
              <input
                type="checkbox"
                checked={form.consent_publication}
                onChange={(e) => update("consent_publication", e.target.checked)}
              />
              <span>
                Я принимаю{" "}
                <Link to="/consent-authors">
                  согласие на публикацию материалов и сведений об авторе
                </Link>{" "}
                в программе конференции, электронном сборнике трудов и на сайте конференции.
              </span>
            </label>
          </>
        )}

        {step === 4 && (
          <>
            <p className="reg-note">
              Мы отправили код подтверждения для номера{" "}
              <strong>{normalizedPhone || form.phone}</strong>. Проверьте Telegram и введите код,
              чтобы завершить регистрацию.
            </p>
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
              <p className="reg-hint">
                Код подтверждения придет в Telegram, привязанный к этому номеру телефона.
              </p>
            </Field>
            <div className="reg-resend">
              <button
                type="button"
                className={buttonClassName("ghost")}
                onClick={requestCode}
                disabled={requestingCode || cooldown > 0}
              >
                {requestingCode
                  ? "Отправка..."
                  : cooldown > 0
                    ? `Повтор через ${cooldown}с`
                    : "Отправить код заново"}
              </button>
            </div>
          </>
        )}

        <div className="reg-actions">
          {step > 1 && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setErrorMessage("");
                setStatusMessage("");
                setStep(step - 1);
              }}
            >
              Назад
            </Button>
          )}
          {step < 3 && (
            <Button
              type="button"
              onClick={() => {
                setErrorMessage("");
                setStep(step + 1);
              }}
              disabled={
                (step === 1 && !form.full_name.trim()) ||
                (step === 2 && (!form.section_id || !form.talk_title.trim() || !normalizedPhone))
              }
            >
              Далее
            </Button>
          )}
          {step === 3 && (
            <Button
              type="submit"
              disabled={
                requestingCode || !form.consent_personal_data || !form.consent_publication
              }
            >
              {requestingCode ? "Отправка..." : "Получить код в Telegram"}
            </Button>
          )}
          {step === 4 && (
            <Button
              type="submit"
              disabled={loading || !verificationCode.trim() || !verificationToken}
            >
              {loading ? "Проверка..." : "Подтвердить и зарегистрироваться"}
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
