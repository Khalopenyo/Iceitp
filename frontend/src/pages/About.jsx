import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { fetchContentBlocks } from "../lib/content.js";
import { fetchBranding } from "../lib/org.js";
import { formatConferenceDateRange, getConferenceDescription } from "../lib/conference.js";
import { Container, Badge } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./about.css";

export default function About() {
  const outletContext = useOutletContext() || {};
  const conference = outletContext.conference || null;
  const [blocks, setBlocks] = useState([]);
  const [org, setOrg] = useState(null);

  useEffect(() => {
    fetchContentBlocks().then((list) => setBlocks(list));
  }, []);

  useEffect(() => {
    fetchBranding().then((value) => {
      if (value) setOrg(value);
    });
  }, []);

  const description = getConferenceDescription(conference);
  const dateLabel =
    outletContext.conferenceDateLabel ||
    formatConferenceDateRange(conference?.starts_at, conference?.ends_at);
  const registrationOpen = conference?.status === "draft" || conference?.status === "live";
  const aboutBlocks = blocks.filter((block) => block && block.kind !== "hero");

  return (
    <section className="about-page">
      <Container>
        <div className="about-head">
          <h1>О конференции</h1>
          <p className="about-sub">{description}</p>
        </div>

        <div className="about-layout">
          <div className="about-main">
            {org?.display_name ? (
              <div className="about-block">
                <h2>Организатор</h2>
                <p>{org.display_name}</p>
              </div>
            ) : null}

            {aboutBlocks.length > 0 ? (
              aboutBlocks.map((block) => (
                <div key={block.id} className="about-block">
                  {block.title ? <h2>{block.title}</h2> : null}
                  {block.body
                    ? block.body
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((paragraph, index) => <p key={index}>{paragraph}</p>)
                    : null}
                </div>
              ))
            ) : (
              <div className="about-block">
                <h2>О мероприятии</h2>
                <p>{description}</p>
                <p className="about-note">
                  Цели и тематика, информация об организаторе, история выпусков, партнёры и документы
                  публикуются организатором через CMS.
                </p>
              </div>
            )}
          </div>

          <aside>
            <div className="about-side-card">
              <h3>Ключевые даты</h3>
              <div className="about-date">
                <span>Регистрация</span>
                <Badge variant={registrationOpen ? "success" : "neutral"}>
                  {registrationOpen ? "Открыта" : "Закрыта"}
                </Badge>
              </div>
              {dateLabel ? (
                <div className="about-date">
                  <span>Проведение</span>
                  <strong>{dateLabel}</strong>
                </div>
              ) : null}
              <div className="about-side-actions">
                <Link className={buttonClassName("primary", true)} to="/register">
                  Зарегистрироваться
                </Link>
                <Link className={buttonClassName("ghost", true)} to="/program">
                  Смотреть программу
                </Link>
              </div>
            </div>
          </aside>
        </div>

        <div className="about-banner">
          <span>
            Готовы участвовать?{registrationOpen ? " Регистрация открыта." : ""}
          </span>
          <Link className={buttonClassName("primary")} to="/register">
            Зарегистрироваться
          </Link>
        </div>
      </Container>
    </section>
  );
}
