import { Link } from "react-router-dom";
import "./platform.css";

// Маркетинговый лендинг платформы «Кворум» — «парадная дверь» SaaS на голом домене
// (kvorum.ru). Объясняет продукт и ведёт организатора в самостоятельную регистрацию
// (/console/signup), после которой создаётся рабочее пространство вуза.

const STEPS = [
  { n: "1", t: "Зарегистрируйтесь", d: "Создайте аккаунт вуза за пару минут — мы развернём изолированное рабочее пространство и поддомен вуз.kvorum.ru." },
  { n: "2", t: "Соберите конференцию", d: "Как в конструкторе: программа, секции, спикеры, документы, брендинг и тема — без вёрстки и разработчиков." },
  { n: "3", t: "Опубликуйте и принимайте участников", d: "Запустите сайт на своём поддомене: регистрация, личные кабинеты, чат, бейджи и сертификаты — всё внутри." },
];

const FEATURES = [
  { t: "Регистрация участников", d: "Настраиваемая анкета, статусы, экспорт в CSV, регистрация на месте без камеры." },
  { t: "Программа и секции", d: "Секции, залы, распределение докладов по слотам, личное расписание участника." },
  { t: "Спикеры и документы", d: "Карточки спикеров, программа и материалы, генерация бейджей и сертификатов." },
  { t: "Брендинг и поддомен", d: "Логотип, цвет, тема оформления и собственный поддомен — сайт под брендом вуза." },
  { t: "Команда оргкомитета", d: "Приглашайте коллег с ролями: куратор, модератор, редактор, стендист." },
  { t: "Коммуникация", d: "Чат с участниками, модерация вопросов и обратная связь — в одном месте." },
];

const PLANS = [
  { name: "Кафедра", d: "Для одной кафедры и небольших конференций.", points: ["Одна активная конференция", "До 300 участников", "Базовый брендинг"] },
  { name: "Институт", d: "Для факультета с регулярными событиями.", points: ["Несколько конференций", "Команда оргкомитета", "Сертификаты и бейджи"], featured: true },
  { name: "Университет", d: "Для вуза с потоком мероприятий в год.", points: ["Без лимита конференций", "Кастомный домен", "Приоритетная поддержка"] },
];

export default function PlatformLanding() {
  return (
    <div className="pl-root">
      <a className="pl-skip" href="#pl-main">Перейти к содержимому</a>
      <header className="pl-header">
        <div className="pl-container pl-header-in">
          <span className="pl-logo">
            <span className="pl-logo-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h11M4 17h7" /></svg>
            </span>
            Кворум
          </span>
          <nav className="pl-nav" aria-label="Разделы">
            <a href="#how">Как это работает</a>
            <a href="#features">Возможности</a>
            <a href="#plans">Тарифы</a>
          </nav>
          <div className="pl-header-cta">
            <Link className="pl-btn-ghost" to="/login">Войти</Link>
            <Link className="pl-btn" to="/console/signup">Создать конференцию</Link>
          </div>
        </div>
      </header>

      <main id="pl-main" tabIndex={-1}>
        <section className="pl-hero">
          <div className="pl-container">
            <div className="pl-eyebrow">SaaS для научных конференций вузов</div>
            <h1 className="pl-h1">Конференции вашего вуза — на одной платформе</h1>
            <p className="pl-lead">
              Кворум заменяет разрозненные формы, мессенджеры и ручную вёрстку: вуз получает
              изолированное рабочее пространство и собирает сайт конференции как в конструкторе —
              от регистрации участников до сертификатов.
            </p>
            <div className="pl-hero-cta">
              <Link className="pl-btn pl-btn-lg" to="/console/signup">Создать рабочее пространство</Link>
              <Link className="pl-btn-ghost pl-btn-lg" to="/login">У меня уже есть аккаунт</Link>
            </div>
            <div className="pl-hero-note">Самостоятельный запуск без участия оператора · 152-ФЗ соответствие</div>
          </div>
        </section>

        <section id="how" className="pl-section">
          <div className="pl-container">
            <h2 className="pl-h2">Как это работает</h2>
            <div className="pl-steps">
              {STEPS.map((s) => (
                <div key={s.n} className="pl-step">
                  <span className="pl-step-n">{s.n}</span>
                  <h3 className="pl-step-t">{s.t}</h3>
                  <p className="pl-step-d">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="pl-section pl-section-alt">
          <div className="pl-container">
            <h2 className="pl-h2">Всё для конференции — внутри</h2>
            <div className="pl-features">
              {FEATURES.map((f) => (
                <div key={f.t} className="pl-feature">
                  <h3 className="pl-feature-t">{f.t}</h3>
                  <p className="pl-feature-d">{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="plans" className="pl-section">
          <div className="pl-container">
            <h2 className="pl-h2">Тарифы</h2>
            <p className="pl-section-sub">Оплата — последним шагом: сначала соберите и посмотрите результат, затем платите за публикацию.</p>
            <div className="pl-plans">
              {PLANS.map((p) => (
                <div key={p.name} className={`pl-plan${p.featured ? " featured" : ""}`}>
                  {p.featured ? <span className="pl-plan-badge">Популярный</span> : null}
                  <h3 className="pl-plan-name">{p.name}</h3>
                  <p className="pl-plan-d">{p.d}</p>
                  <ul className="pl-plan-list">
                    {p.points.map((pt) => <li key={pt}>{pt}</li>)}
                  </ul>
                  <Link className={p.featured ? "pl-btn pl-plan-cta" : "pl-btn-ghost pl-plan-cta"} to="/console/signup">Начать</Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pl-cta">
          <div className="pl-container pl-cta-in">
            <h2 className="pl-h2" style={{ marginBottom: 8 }}>Готовы провести конференцию?</h2>
            <p className="pl-cta-sub">Зарегистрируйтесь и создайте рабочее пространство вуза прямо сейчас.</p>
            <Link className="pl-btn pl-btn-lg" to="/console/signup">Создать рабочее пространство</Link>
          </div>
        </section>
      </main>

      <footer className="pl-footer">
        <div className="pl-container pl-footer-in">
          <span className="pl-logo pl-logo-sm">
            <span className="pl-logo-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h11M4 17h7" /></svg>
            </span>
            Кворум
          </span>
          <nav className="pl-footer-nav" aria-label="Документы">
            <Link to="/legal">Правовые документы</Link>
            <Link to="/login">Войти</Link>
            <Link to="/console/signup">Регистрация</Link>
          </nav>
          <span className="pl-footer-copy">© 2026 Кворум</span>
        </div>
      </footer>
    </div>
  );
}
