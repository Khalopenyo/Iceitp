import { Link, useOutletContext } from "react-router-dom";
import { panoramaSceneList } from "../data/panoramaTour.js";
import { formatConferenceDateRange } from "../lib/conference.js";
import { Container } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./venue.css";

export default function Venue() {
  const outletContext = useOutletContext() || {};
  const conference = outletContext.conference || null;
  const address = conference?.venue_address?.trim() || "";
  const mapUrl = conference?.venue_map_url?.trim() || "";
  const transport = conference?.venue_transport?.trim() || "";
  const phone = conference?.support_phone?.trim() || "";
  const dateLabel =
    outletContext.conferenceDateLabel ||
    formatConferenceDateRange(conference?.starts_at, conference?.ends_at);
  const tours = panoramaSceneList.slice(0, 6);

  return (
    <section className="venue-page">
      <Container>
        <div className="venue-head">
          <h1>Место проведения</h1>
          <p className="venue-address">
            {address ? <strong>{address}</strong> : "Адрес площадки публикуется организатором."}
          </p>
        </div>

        <div className="venue-map">Интерактивная карта · маркер площадки</div>
        {mapUrl ? (
          <div className="venue-route">
            <a className={buttonClassName("ghost")} href={mapUrl} target="_blank" rel="noreferrer">
              Построить маршрут (внешний картсервис)
            </a>
          </div>
        ) : null}

        <div className="venue-cols">
          <div className="venue-col">
            <h2>Как добраться</h2>
            {transport ? (
              transport
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((paragraph, index) => <p key={index}>{paragraph}</p>)
            ) : (
              <p>Схему проезда (метро, парковка, вход) публикует организатор конференции.</p>
            )}
          </div>

          <div className="venue-col">
            <h2>Доп. информация</h2>
            <div className="venue-info-row">
              <span>
                <strong>Стойка регистрации:</strong> {dateLabel || "по программе конференции"}
              </span>
            </div>
            <div className="venue-info-row">
              <span>Получение бейджа — по QR из личного кабинета</span>
            </div>
            {phone ? (
              <div className="venue-info-row">
                <span>
                  <strong>Контакт на месте:</strong> <a href={`tel:${phone}`}>{phone}</a>
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="venue-sep" />

        <h2 className="venue-tours-title">360-туры по площадке</h2>
        <div className="venue-tours">
          {tours.map((scene) => (
            <Link key={scene.id} className="venue-tour" to="/map">
              <img className="venue-tour-img" src={scene.panorama} alt={scene.title} loading="lazy" />
              <div className="venue-tour-label">{scene.title}</div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
