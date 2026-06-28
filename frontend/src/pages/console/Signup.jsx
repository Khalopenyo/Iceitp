import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { apiPost } from "../../lib/api.js";
import { setUser, isAuthenticated } from "../../lib/auth.js";
import "./console.css";

// Транслитерация кириллицы — вузы РФ называются по-русски, а поддомен обязан быть
// латиницей; без этого авто-подсказка поддомена из названия была бы пустой.
const RU_LAT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
function translit(raw) {
  return String(raw).toLowerCase().split("").map((ch) => (ch in RU_LAT ? RU_LAT[ch] : ch)).join("");
}

// Зарезервированные поддомены — небольшое зеркало серверного списка для мгновенной
// подсказки (полный список и решение — на сервере).
const RESERVED = new Set([
  "www", "api", "app", "admin", "console", "kvorum", "lk", "mail", "auth",
  "login", "billing", "dashboard", "test", "dev", "demo", "support", "help",
]);
// Серверный паттерн DNS-лейбла: латиница/цифры, одиночные дефисы, не с краю.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Приводим ввод к допустимому DNS-лейблу на лету, чтобы превью поддомена и серверная
// валидация совпадали: транслит → латиница/цифры/дефис, без дефисов по краям.
function sanitizeSlug(raw) {
  return translit(raw)
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

// Возвращает текст ошибки поддомена или "" если он валиден (зеркало сервера).
function slugError(slug) {
  if (slug.length < 3 || slug.length > 30) return "Поддомен должен быть от 3 до 30 символов.";
  if (!SLUG_RE.test(slug)) return "Поддомен: только латиница, цифры и дефис (не по краям).";
  if (/^\d+$/.test(slug)) return "Поддомен не может состоять только из цифр.";
  if (RESERVED.has(slug)) return "Этот поддомен зарезервирован — выберите другой.";
  return "";
}

export default function Signup() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [university, setUniversity] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Поддомен по умолчанию подсказываем из названия вуза, пока его не правят вручную.
  const effectiveSlug = useMemo(
    () => (slugTouched ? slug : sanitizeSlug(university)),
    [slugTouched, slug, university]
  );

  // Уже вошли — повторная регистрация молча создала бы второй тенант; уводим в консоль.
  if (isAuthenticated()) return <Navigate to="/console" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !university.trim()) {
      setError("Заполните все обязательные поля.");
      return;
    }
    // Сервер обрезает пробелы перед проверкой длины — сверяем по обрезанному.
    if (password.trim().length < 8) {
      setError("Пароль должен быть не короче 8 символов.");
      return;
    }
    const slugErr = slugError(effectiveSlug);
    if (slugErr) {
      setError(slugErr);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await apiPost("/org/signup", {
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        university_name: university.trim(),
        slug: effectiveSlug,
      });
      if (data?.user) setUser(data.user);
      // Аккаунт и тенант созданы — ведём собирать первую конференцию.
      navigate("/console/onboarding", { replace: true });
    } catch (err) {
      setError(err.message || "Не удалось создать рабочее пространство.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="con-root">
      <div className="con-onboard">
        <div className="con-onboard-top">
          <span className="con-logo-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h11M4 17h7" /></svg>
          </span>
          <span className="con-logo-name">Кворум</span>
          <span className="con-onboard-top-note">Платформа конференций для вузов</span>
        </div>

        <div className="con-onboard-main">
          <form className="con-onboard-inner" onSubmit={submit}>
            <div className="con-onboard-eyebrow">Регистрация · бесплатно, без карты</div>
            <h1 className="con-onboard-h1">Создайте сайт конференций вашего вуза</h1>
            <p className="con-onboard-sub">
              Соберите программу, бейджи и сборник в одной консоли. Оплата — только перед
              публикацией на поддомене.
            </p>

            <div className="con-onboard-card">
              {error ? <div className="con-toast err" role="alert">{error}</div> : null}
              <label className="con-field">
                <span>Ваше имя</span>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Фамилия Имя Отчество" autoComplete="name" autoFocus />
              </label>
              <label className="con-field">
                <span>Рабочий e-mail</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="organizer@university.ru" autoComplete="email" />
              </label>
              <label className="con-field">
                <span>Пароль</span>
                <span className="con-input-wrap">
                  <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 8 символов" autoComplete="new-password" />
                  <button type="button" className="con-input-toggle" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? "Скрыть пароль" : "Показать пароль"}>
                    {show ? "Скрыть" : "Показать"}
                  </button>
                </span>
              </label>
              <label className="con-field">
                <span>Название вуза</span>
                <input value={university} onChange={(e) => setUniversity(e.target.value)} placeholder="Название вашего вуза" autoComplete="organization" />
              </label>
              <label className="con-field">
                <span>Адрес сайта (поддомен)</span>
                <span className="con-slug-row">
                  <input
                    className="con-slug-input"
                    value={effectiveSlug}
                    onChange={(e) => { setSlugTouched(true); setSlug(sanitizeSlug(e.target.value)); }}
                    placeholder="gtu"
                    aria-describedby="con-slug-preview"
                    spellCheck={false}
                  />
                  <span className="con-slug-suffix">.kvorum.ru</span>
                </span>
                <span id="con-slug-preview" className="con-field-hint">
                  Сайт откроется по адресу <b>{effectiveSlug || "вуз"}.kvorum.ru</b> после оплаты.
                </span>
              </label>

              <button type="submit" className="con-btn" style={{ width: "100%", height: "48px", justifyContent: "center", marginTop: "4px" }} disabled={saving}>
                {saving ? "Создаём рабочее пространство…" : "Создать рабочее пространство →"}
              </button>
              <p className="con-onboard-foot">
                Уже есть аккаунт? <Link to="/login">Войти</Link>
              </p>
            </div>

            <div className="con-steps">
              <div className="con-step active"><span className="con-step-num">1</span>Регистрация</div>
              <div className="con-step"><span className="con-step-num">2</span>Собрать конференцию</div>
              <div className="con-step"><span className="con-step-num">3</span>Оплатить и выкатить</div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
