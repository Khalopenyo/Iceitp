import { Link } from "react-router-dom";
import { getToken } from "../lib/auth.js";

const conferenceSessions = [
  {
    label: "Сессия 1",
    title: "Экономика, право и управление в условиях цифровой трансформации",
    text: "Для исследований и практических кейсов на стыке экономики, правового регулирования и управления.",
  },
  {
    label: "Сессия 2",
    title: "Современное общество в цифровую эпоху",
    text: "Для обсуждения социальных изменений, цифровых сервисов и новых моделей взаимодействия.",
  },
  {
    label: "Сессия 3",
    title: "Лингвистика и методика преподавания языков",
    text: "Для преподавателей, исследователей языка и авторов методических и образовательных практик.",
  },
  {
    label: "Сессия 4",
    title: "Физическое воспитание: инновации и подходы",
    text: "Для работ об образовательных методиках, здоровье, спорте и современных форматах подготовки.",
  },
  {
    label: "Сессия 5",
    title: "Наука зуммеров и альфа (молодые ученые до 35 лет)",
    text: "Отдельный молодежный трек для молодых исследователей, аспирантов и начинающих авторов.",
  },
];

const conferenceAudience = [
  "Студенты",
  "Аспиранты",
  "Преподаватели вузов",
  "Представители бизнеса",
  "Представители госструктур",
];

const conferenceResults = [
  {
    title: "РИНЦ / eLIBRARY",
    text: "Публикация всех принятых материалов в специальном сборнике конференции.",
  },
  {
    title: "Журналы ВАК (К-3)",
    text: "Лучшие статьи по решению оргкомитета рекомендуются к дальнейшей публикации.",
  },
  {
    title: "Сертификаты",
    text: "Электронные документы для портфолио будут доступны участнику прямо в личном кабинете.",
  },
  {
    title: "Антиплагиат от 75%",
    text: "К рассмотрению принимаются только оригинальные материалы с уровнем оригинальности не ниже 75%.",
  },
];

const conferenceDates = [
  {
    label: "До 20 апреля",
    title: "Прием заявок и статей",
    text: "Материалы загружаются только через личный кабинет платформы. На почту madinaborz@mail.ru статьи больше отправлять не нужно.",
  },
  {
    label: "20 апреля",
    title: "Программа и ссылки на трансляции",
    text: "Участники получают готовую программу конференции и данные для онлайн-подключения.",
  },
  {
    label: "24-25 апреля",
    title: "Дни проведения конференции",
    text: "Очные и онлайн-сессии проходят в Грозном на площадке ГГНТУ и на цифровой платформе конференции.",
  },
];

const organizers = [
  {
    short: "ГГНТУ",
    name: "Грозненский государственный нефтяной технический университет",
  },
  {
    short: "СОГУ",
    name: "Северо-Осетинский государственный университет",
  },
  {
    short: "МГТУ",
    name: "Майкопский государственный технологический университет",
  },
  {
    short: "БАГСУ",
    name: "Башкирская академия государственной службы и управления",
  },
  {
    short: "КНИИ РАН",
    name: "Комплексный научно-исследовательский институт РАН",
  },
];

const coordinator = {
  name: "Барзаева Мадина Ахьятовна",
  role: "Координатор конференции",
  email: "madinaborz@mail.ru",
  phone: "8 (929) 892-07-00",
};

export default function Welcome() {
  const isAuthorized = Boolean(getToken());
  const ctaTarget = isAuthorized ? "/dashboard" : "/register";

  return (
    <section className="hero landing-page">
      <div className="hero-stage">
        <div className="hero-outline-circle" aria-hidden="true" />
        <div className="hero-dot-grid" aria-hidden="true" />
        <div className="hero-ribbon" aria-hidden="true" />
        <div className="hero-cross" aria-hidden="true" />
        <div className="hero-ring" aria-hidden="true" />
        <div className="hero-lines" aria-hidden="true" />
        <div className="hero-vertical-text" aria-hidden="true">
          Мы будущее
        </div>

        <div className="hero-copy">
          <p className="hero-overline">Всероссийская научно-практическая конференция с международным участием</p>
          <h1>ЦИФРОВАЯ РЕВОЛЮЦИЯ: ТОЧКИ СОЦИАЛЬНО-ЭКОНОМИЧЕСКОГО РОСТА</h1>
          <p className="hero-subtitle">24-25 апреля 2026 г. | Офлайн (Грозный, ГГНТУ) и Онлайн.</p>
          <p className="hero-description">
            Площадка для тех, кто хочет говорить о цифровой трансформации экономики предметно: с позиции науки,
            бизнеса, образования и государственного управления.
          </p>
          <div className="hero-detail-pills">
            <span>5 тематических сессий</span>
            <span>РИНЦ / eLIBRARY</span>
            <span>Лучшие статьи для ВАК (К-3)</span>
          </div>
          <div className="hero-actions">
            <Link className="btn btn-primary" to={ctaTarget}>
              Подать заявку до 20 апреля
            </Link>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-visual-stack">
            <div className="hero-phone">
              <div className="hero-phone-camera" />
              <div className="hero-phone-screen">
                <img className="hero-phone-preview" src="/image.png" alt="" />
              </div>
            </div>
            <div className="hero-coin">
              <span>2026</span>
            </div>
          </div>
        </div>
      </div>

      <section id="about" className="landing-section section-intro">
        <div className="section-heading">
          <div className="badge">О конференции</div>
          <h2>Кому и зачем это нужно</h2>
          <p>
            Конференция собирает участников, которым важно не просто обсуждать цифровую трансформацию, а
            договариваться о практических точках роста для экономики и общества.
          </p>
        </div>
        <div className="intro-grid">
          <article className="intro-card intro-card-accent">
            <span className="intro-card-label">Цель</span>
            <h3>Диалог между наукой, бизнесом и государством</h3>
            <p>По вопросам цифровой трансформации экономики, управления, образования и общественных практик.</p>
          </article>
          <article className="intro-card">
            <span className="intro-card-label">Для кого</span>
            <ul className="intro-audience-list">
              {conferenceAudience.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section id="sections" className="landing-section">
        <div className="section-heading">
          <div className="badge">Секции</div>
          <h2>Пять сессий для маршрутизации регистрации</h2>
          <p>
            Эти направления отображаются на главной странице и используются как базовый набор секций при подаче
            заявки через личный кабинет.
          </p>
        </div>
        <div className="session-grid">
          {conferenceSessions.map((session) => (
            <article key={session.label} className="session-card">
              <div className="session-card-head">
                <span className="session-card-label">{session.label}</span>
                <span className="session-card-chip">Регистрация</span>
              </div>
              <h3>{session.title}</h3>
              <p>{session.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <div className="badge">Публикация и результаты</div>
          <h2>То, ради чего подают сильные материалы</h2>
          <p>
            Научная публикация, статусные рекомендации и документы для портфолио собраны в одном потоке, без
            ручной переписки и разрозненных каналов.
          </p>
        </div>
        <div className="results-grid">
          {conferenceResults.map((item) => (
            <article key={item.title} className="result-card">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <div className="badge">Важные даты</div>
          <h2>Календарь участия</h2>
          <p>Вся логика движения участника по конференции укладывается в три ключевые даты.</p>
        </div>
        <div className="timeline">
          {conferenceDates.map((item) => (
            <article key={item.label} className="timeline-item">
              <div className="timeline-marker" aria-hidden="true" />
              <div className="timeline-content">
                <span className="timeline-date">{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section organizers-section">
        <div className="section-heading">
          <div className="badge">Организаторы и контакты</div>
          <h2>Кто проводит конференцию</h2>
          <p>
            Организационный блок собран так, чтобы участник сразу видел состав партнеров и понимал, куда писать
            по срочным вопросам.
          </p>
        </div>
        <div className="organizers-layout">
          <div className="organizer-grid">
            {organizers.map((item) => (
              <article key={item.short} className="organizer-card" aria-label={item.name}>
                <strong>{item.short}</strong>
                <span>{item.name}</span>
              </article>
            ))}
          </div>
          <aside className="contact-card">
            <span className="contact-label">Координатор</span>
            <h3>{coordinator.name}</h3>
            <p>{coordinator.role}</p>
            <div className="contact-list">
              <a href={`tel:${coordinator.phone.replace(/\D+/g, "")}`}>{coordinator.phone}</a>
              <a href={`mailto:${coordinator.email}`}>{coordinator.email}</a>
            </div>
          </aside>
        </div>
      </section>
    </section>
  );
}
