import { Link, useOutletContext } from "react-router-dom";
import { panoramaSceneList } from "../../data/panoramaTour.js";
import { formatConferenceDateRange } from "../../lib/conference.js";
import "./event.css";

// EventVenue — экран «Площадка» в зоне EventShell: адрес, схема, доп.инфо, 360-туры.
export default function EventVenue() {
  const { conference } = useOutletContext();
  const address = conference?.venue_address?.trim() || "";
  const mapUrl = conference?.venue_map_url?.trim() || "";
  const transport = conference?.venue_transport?.trim() || "";
  const phone = conference?.support_phone?.trim() || "";
  const dateLabel = formatConferenceDateRange(conference?.starts_at, conference?.ends_at);
  const tours = panoramaSceneList.slice(0, 6);

  return (
    <div className="ev-page" data-screen-label="Площадка">
      <div className="ev-page-eyebrow">Навигация · Площадка</div>
      <h1 className="ev-page-h">Место проведения</h1>
      <p className="ev-venue-addr">
        {address ? <strong>{address}</strong> : "Адрес площадки публикуется организатором."}
      </p>

      <div className="ev-venue-map" aria-hidden="true">
        Интерактивная карта · маркер площадки
      </div>
      {mapUrl ? (
        <a className="ev-btn-sm ghost" href={mapUrl} target="_blank" rel="noreferrer" style={{ marginBottom: 20 }}>
          Построить маршрут (внешний картсервис) →
        </a>
      ) : null}

      <div className="ev-cols-2">
        <div className="ev-info-card">
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

        <div className="ev-info-card">
          <h2>Доп. информация</h2>
          <p>
            <strong>Стойка регистрации:</strong> {dateLabel || "по программе конференции"}
          </p>
          <p>Получение бейджа — по QR из личного кабинета.</p>
          {phone ? (
            <p>
              <strong>Контакт на месте:</strong> <a href={`tel:${phone}`}>{phone}</a>
            </p>
          ) : null}
        </div>
      </div>

      <h2 className="ev-tours-title">360-туры по площадке</h2>
      <div className="ev-tours">
        {tours.map((scene) => (
          <Link key={scene.id} className="ev-tour" to="/map">
            <img src={scene.panorama} alt={scene.title} loading="lazy" />
            <div className="ev-tour-label">{scene.title}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
