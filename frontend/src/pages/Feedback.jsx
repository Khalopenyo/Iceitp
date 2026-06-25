import { useState } from "react";
import { apiPost } from "../lib/api.js";
import { Card, Field, Textarea, Button } from "../components/ui/index.jsx";
import "./feedback.css";

const MAX_FEEDBACK_LENGTH = 3000;
const ratingOptions = [
  { value: 5, label: "5", text: "Отлично" },
  { value: 4, label: "4", text: "Хорошо" },
  { value: 3, label: "3", text: "Нормально" },
  { value: 2, label: "2", text: "Нужно улучшить" },
  { value: 1, label: "1", text: "Плохо" },
];

const ratingHint = (rating) => {
  switch (Number(rating)) {
    case 5:
      return "Отметьте, что особенно стоит сохранить в следующей конференции.";
    case 4:
      return "Укажите, что было хорошо и что можно довести до идеального состояния.";
    case 3:
      return "Опишите, чего не хватило участнику по программе, коммуникации или навигации.";
    case 2:
    case 1:
      return "Чем конкретнее замечания, тем быстрее оргкомитет сможет исправить проблему.";
    default:
      return "";
  }
};

export default function Feedback() {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const trimmedComment = comment.trim();
    if (!trimmedComment) {
      setErrorMessage("Опишите впечатления о конференции или предложения по улучшению.");
      setStatusMessage("");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await apiPost("/feedback", { rating: Number(rating), comment: trimmedComment });
      setComment("");
      setStatusMessage("Спасибо. Отзыв сохранён и будет доступен оргкомитету в админке.");
    } catch (err) {
      setErrorMessage(err.message || "Не удалось отправить отзыв");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="fb">
      <div className="fb-head">
        <h1>Обратная связь</h1>
        <p>
          Оцените организацию конференции и оставьте предложения по улучшению программы, коммуникации
          или работы площадки.
        </p>
      </div>
      <Card>
        <form onSubmit={submit}>
          <div>
            <span className="fb-block-label" id="fb-rating-label">
              Оценка
            </span>
            <div className="fb-rating-grid" role="group" aria-labelledby="fb-rating-label">
              {ratingOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`fb-rating-btn ${Number(rating) === option.value ? "active" : ""}`}
                  aria-pressed={Number(rating) === option.value}
                  onClick={() => setRating(option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.text}</span>
                </button>
              ))}
            </div>
            <p className="fb-hint">{ratingHint(rating)}</p>
          </div>

          <Field label="Отзыв и предложения по улучшению" htmlFor="fb-comment">
            <Textarea
              id="fb-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, MAX_FEEDBACK_LENGTH))}
              rows={6}
              placeholder="Например: что сработало хорошо, чего не хватило участникам, какие процессы стоит улучшить к следующей конференции."
            />
          </Field>

          <div className="fb-footer">
            <span className="fb-count">
              {comment.length} / {MAX_FEEDBACK_LENGTH}
            </span>
            <Button type="submit" disabled={loading}>
              {loading ? "Отправка…" : "Отправить отзыв"}
            </Button>
          </div>

          {statusMessage ? (
            <div className="fb-status fb-status-success" role="status">
              {statusMessage}
            </div>
          ) : null}
          {errorMessage ? (
            <div className="fb-status fb-status-error" role="alert">
              {errorMessage}
            </div>
          ) : null}
        </form>
      </Card>
    </section>
  );
}
