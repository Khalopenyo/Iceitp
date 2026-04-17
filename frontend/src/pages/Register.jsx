import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../lib/api.js";
import { setToken } from "../lib/auth.js";
import { Link, useLocation, useNavigate } from "react-router-dom";

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
  const degreeOptions = ["Кандидат наук", "Доктор наук", "Доцент", "Профессор"];
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
    "Кемь"
  ];
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showDegreeDropdown, setShowDegreeDropdown] = useState(false);
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

  const payload = useMemo(
    () => ({
      ...form,
      section_id: form.section_id ? Number(form.section_id) : null,
    }),
    [form]
  );

  const requestCode = async (e) => {
    if (e) {
      e.preventDefault();
    }
    if (!form.section_id) {
      setErrorMessage("Выберите секцию конференции перед отправкой анкеты.");
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
      setStatusMessage(data.message || "Код отправлен по SMS");
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
      setToken(data.token);
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

  return (
    <section className="panel">
      <h2>Регистрация участника</h2>
      <div className="stepper">
        <div className={`step ${step === 1 ? "active" : ""}`}>1. Личные данные</div>
        <div className={`step ${step === 2 ? "active" : ""}`}>2. Участие</div>
        <div className={`step ${step === 3 ? "active" : ""}`}>3. Доступ</div>
        <div className={`step ${step === 4 ? "active" : ""}`}>4. Подтверждение</div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        {errorMessage ? <p className="form-status error">{errorMessage}</p> : null}
        {statusMessage ? <p className="form-status info">{statusMessage}</p> : null}
        {step === 1 && (
          <>
            <label>
              ФИО
              <input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} required />
            </label>
            <label>
              Ученая степень/звание
              <div className="dropdown">
                <button
                  type="button"
                  className="dropdown-trigger"
                  onClick={() => setShowDegreeDropdown((prev) => !prev)}
                >
                  {form.degree || "Выберите степень/звание"}
                </button>
                {showDegreeDropdown && (
                  <div className="dropdown-menu">
                    {degreeOptions.map((degree) => (
                      <button
                        type="button"
                        key={degree}
                        className="dropdown-item"
                        onClick={() => {
                          update("degree", degree);
                          setShowDegreeDropdown(false);
                        }}
                      >
                        {degree}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <label>
              Должность
              <input value={form.position} onChange={(e) => update("position", e.target.value)} />
            </label>
            <label>
              Место работы
              <input value={form.organization} onChange={(e) => update("organization", e.target.value)} />
            </label>
            <label className="city-field">
              Город
              <input
                value={form.city}
                onChange={(e) => {
                  update("city", e.target.value);
                  setShowCityDropdown(true);
                }}
                onFocus={() => setShowCityDropdown(true)}
                onBlur={() => setTimeout(() => setShowCityDropdown(false), 150)}
                placeholder="Начните вводить..."
              />
              {showCityDropdown && (
                <div className="city-dropdown">
                  {cityOptions
                    .filter((city) => city.toLowerCase().includes(form.city.toLowerCase()))
                    .slice(0, 8)
                    .map((city) => (
                      <button
                        type="button"
                        key={city}
                        className="city-option"
                        onClick={() => {
                          update("city", city);
                          setShowCityDropdown(false);
                        }}
                      >
                        {city}
                      </button>
                    ))}
                </div>
              )}
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <label>
              Формат участия
              <select value={form.user_type} onChange={(e) => update("user_type", e.target.value)}>
                <option value="online">Онлайн</option>
                <option value="offline">Оффлайн</option>
              </select>
            </label>
            <label>
              Секция (тема конференции)
              <select value={form.section_id} onChange={(e) => update("section_id", e.target.value)} required>
                <option value="">Выберите секцию</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}{s.room ? ` — ${s.room}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {selectedSection && (
              <p className="muted">
                Назначенная аудитория: <strong>{selectedSection.room || "пока не назначена"}</strong>
              </p>
            )}
            <label>
              Название доклада
              <input value={form.talk_title} onChange={(e) => update("talk_title", e.target.value)} required />
            </label>
            <label>
              Телефон
              <input value={form.phone} onChange={(e) => update("phone", e.target.value)} required />
            </label>
          </>
        )}
        {step === 3 && (
          <>
            <label>
              Email
              <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
            </label>
            <label>
              Пароль
              <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.consent_personal_data}
                onChange={(e) => update("consent_personal_data", e.target.checked)}
              />
              <span>
                Я ознакомлен(а) с{" "}
                <Link to="/personal-data">Политикой обработки персональных данных</Link> и даю согласие на
                регистрацию, организацию участия, формирование программы, выпуск бейджа, сертификата и других
                материалов конференции.
              </span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.consent_publication}
                onChange={(e) => update("consent_publication", e.target.checked)}
              />
              <span>
                Я принимаю{" "}
                <Link to="/consent-authors">согласие на публикацию материалов и сведений об авторе</Link> в
                программе конференции, электронном сборнике трудов и на сайте конференции.
              </span>
            </label>
          </>
        )}
        {step === 4 && (
          <>
            <p className="muted">
              Мы отправили SMS-код на номер <strong>{form.phone}</strong>. Введите его, чтобы завершить регистрацию.
            </p>
            <label>
              Код подтверждения
              <input
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="5 цифр"
                required
              />
            </label>
            <div className="auth-inline-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={requestCode}
                disabled={requestingCode || cooldown > 0}
              >
                {requestingCode ? "Отправка..." : cooldown > 0 ? `Повтор через ${cooldown}с` : "Отправить код заново"}
              </button>
            </div>
          </>
        )}
        <div className="form-actions">
          {step > 1 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setErrorMessage("");
                setStatusMessage("");
                setStep(step - 1);
              }}
            >
              Назад
            </button>
          )}
          {step < 3 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setErrorMessage("");
                setStep(step + 1);
              }}
              disabled={
                (step === 1 && !form.full_name.trim()) ||
                (step === 2 && (!form.section_id || !form.talk_title.trim() || !form.phone.trim()))
              }
            >
              Далее
            </button>
          )}
          {step === 3 && (
            <button
              className="btn btn-primary"
              type="submit"
              disabled={requestingCode || !form.consent_personal_data || !form.consent_publication}
            >
              {requestingCode ? "Отправка..." : "Получить код"}
            </button>
          )}
          {step === 4 && (
            <button className="btn btn-primary" type="submit" disabled={loading || !verificationCode.trim() || !verificationToken}>
              {loading ? "Проверка..." : "Подтвердить и зарегистрироваться"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
