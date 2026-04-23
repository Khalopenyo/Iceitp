import { clearAuth } from "./auth.js";

const rawBaseUrl = typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";
const baseUrl = rawBaseUrl.replace(/\/+$/, "");

class ApiError extends Error {
  constructor(message, { status, path, rawMessage, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.rawMessage = rawMessage || "";
    this.details = details || "";
  }
}

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function mapKnownApiMessage(path, status, rawMessage, details) {
  const raw = normalizeWhitespace(rawMessage);
  const normalized = raw.toLowerCase();
  const detailText = normalizeWhitespace(details);

  const exactMap = {
    "invalid payload": "Проверьте заполнение формы и попробуйте еще раз.",
    "invalid credentials": "Неверный email или пароль.",
    "invalid phone": "Укажите корректный номер телефона.",
    "user already exists": "Пользователь с таким email уже зарегистрирован.",
    "phone already in use": "Этот номер телефона уже используется в другом аккаунте.",
    "invalid confirmation code": "Неверный код подтверждения.",
    "invalid or expired confirmation code": "Код подтверждения неверный или уже истек.",
    "too many confirmation attempts": "Слишком много попыток. Запросите новый код.",
    "user with this phone was not found": "Пользователь с таким номером не найден.",
    "this phone is assigned to multiple accounts": "Этот номер связан с несколькими аккаунтами. Обратитесь к организатору.",
    "invalid or expired reset token": "Ссылка для восстановления недействительна или устарела.",
    "password confirmation does not match": "Пароли не совпадают.",
    "selected section not found": "Выбранная секция больше недоступна. Обновите страницу и выберите другую.",
    "selected room not found": "Выбранная аудитория больше недоступна.",
    "selected user not found": "Выбранный пользователь больше недоступен.",
    "badge can be prepared only for offline participants": "Бейдж можно подготовить только для офлайн-участника.",
    "invalid badge token": "QR-код бейджа недействителен или устарел.",
    "invalid question token": "QR-код для вопросов недействителен или устарел.",
    "invalid token type": "Ссылка недействительна.",
    "invalid token payload": "Ссылка повреждена или недействительна.",
    "user or conference not found": "Участник или конференция не найдены.",
    "conference not found": "Конференция пока недоступна.",
    "certificate not found": "Сертификат не найден.",
    "certificate owner not found": "Владелец сертификата не найден.",
    "certificate number is required": "Укажите номер сертификата.",
    "question is required": "Введите вопрос.",
    "author name is required": "Укажите имя.",
    "question is too long": "Вопрос слишком длинный.",
    "author name is too long": "Имя слишком длинное.",
    "comment is required": "Напишите отзыв или предложение.",
    "comment is too long": "Отзыв слишком длинный.",
    "rating must be between 1 and 5": "Выберите оценку от 1 до 5.",
    "file is required": "Выберите файл для загрузки.",
    "unsupported file type": "Этот формат файла не поддерживается.",
    "empty file": "Вы выбрали пустой файл.",
    "submission file not found": "Файл статьи не найден.",
    "message not found": "Сообщение не найдено.",
    "attachment not found": "Вложение не найдено.",
    "you can edit only your own messages": "Редактировать можно только свои сообщения.",
    "you cannot delete this message": "Удалить можно только свое сообщение.",
    "title is required": "Заполните обязательное поле.",
    "title and room are required": "Укажите название и аудиторию.",
    "not enough sections": "Пока недостаточно секций для формирования расписания.",
  };

  if (exactMap[normalized]) {
    return exactMap[normalized];
  }

  if (normalized === "forbidden" || status === 403) {
    return "У вас нет доступа к этому действию.";
  }

  if (normalized.includes("file is too large")) {
    return "Файл слишком большой. Максимальный размер: 20 МБ.";
  }

  if (normalized.includes("invalid message id") || normalized.includes("invalid attachment id") || normalized.includes("invalid submission id")) {
    return "Не удалось найти выбранный объект. Обновите страницу и попробуйте снова.";
  }

  if (normalized.includes("failed to establish session")) {
    return "Не удалось начать сеанс. Попробуйте войти еще раз.";
  }

  if (normalized.includes("failed to reset password")) {
    return "Не удалось изменить пароль. Попробуйте запросить новую ссылку.";
  }

  if (normalized.includes("failed to verify check-in")) {
    return "Не удалось отметить присутствие. Попробуйте еще раз.";
  }

  if (normalized.includes("failed to load")) {
    return "Не удалось загрузить данные. Попробуйте обновить страницу.";
  }

  if (normalized.includes("failed to save")) {
    return "Не удалось сохранить изменения. Попробуйте еще раз.";
  }

  if (normalized.includes("failed to update")) {
    return "Не удалось обновить данные. Попробуйте еще раз.";
  }

  if (normalized.includes("failed to delete")) {
    return "Не удалось удалить данные. Попробуйте еще раз.";
  }

  if (normalized.includes("failed to create")) {
    return "Не удалось создать запись. Попробуйте еще раз.";
  }

  if (normalized.includes("failed to list")) {
    return "Не удалось загрузить список. Попробуйте обновить страницу.";
  }

  if (normalized.includes("failed to generate question qr")) {
    return "Не удалось подготовить QR для вопросов.";
  }

  if (normalized.includes("failed to issue registration code") || normalized.includes("failed to issue phone code")) {
    return "Не удалось отправить код подтверждения. Попробуйте позже.";
  }

  if (normalized.includes("failed to generate registration code") || normalized.includes("failed to generate phone code")) {
    return "Не удалось сгенерировать код подтверждения. Попробуйте позже.";
  }

  if (normalized.includes("failed to verify registration")) {
    return "Не удалось завершить регистрацию. Попробуйте еще раз.";
  }

  if (normalized.includes("reset instructions sent if the email exists")) {
    return "Если такой email зарегистрирован, инструкция по восстановлению уже отправлена.";
  }

  if (detailText && normalized.includes("file is too large")) {
    return `Файл слишком большой. ${detailText}`;
  }

  if (status === 400) {
    return "Проверьте введенные данные и попробуйте еще раз.";
  }
  if (status === 401) {
    return path.startsWith("/auth/login")
      ? "Неверный email или пароль."
      : "Сессия истекла. Войдите снова.";
  }
  if (status === 404) {
    return "Нужные данные не найдены.";
  }
  if (status === 409) {
    return "Это действие сейчас недоступно из-за конфликта данных.";
  }
  if (status === 429) {
    return "Слишком много попыток. Подождите немного и попробуйте снова.";
  }
  if (status >= 500) {
    return "На сервере произошла ошибка. Попробуйте еще раз позже.";
  }

  return raw || "Не удалось выполнить запрос.";
}

async function request(path, options = {}) {
  const { suppressAuthRedirect: suppressAuthRedirectOption, ...fetchOptions } = options;
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const suppressAuthRedirect =
    suppressAuthRedirectOption === true ||
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/register") ||
    path.startsWith("/auth/forgot-password") ||
    path.startsWith("/auth/reset-password") ||
    path.startsWith("/auth/logout");
  let res;
  try {
    res = await fetch(`${baseUrl}/api${path}`, {
      ...fetchOptions,
      headers,
      credentials: "include",
    });
  } catch (error) {
    throw new ApiError("Не удалось связаться с сервером. Проверьте подключение и попробуйте еще раз.", {
      status: 0,
      path,
      rawMessage: error?.message,
    });
  }
  if (res.status === 401) {
    clearAuth();
    if (!suppressAuthRedirect) {
      window.location.href = "/login";
    }
  }
  if (!res.ok) {
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const rawMessage = parsed?.error || text || "Request failed";
    const details = parsed?.details || "";
    const friendlyMessage = mapKnownApiMessage(path, res.status, rawMessage, details);
    throw new ApiError(friendlyMessage, {
      status: res.status,
      path,
      rawMessage,
      details,
    });
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/pdf")) {
    return res;
  }
  return res.json();
}

export const apiGet = (path, options = {}) => request(path, options);
export const apiPost = (path, data, options = {}) => request(path, { ...options, method: "POST", body: JSON.stringify(data) });
export const apiPostForm = (path, formData, options = {}) => request(path, { ...options, method: "POST", body: formData });
export const apiPatch = (path, data, options = {}) => request(path, { ...options, method: "PATCH", body: JSON.stringify(data) });
export const apiPut = (path, data, options = {}) => request(path, { ...options, method: "PUT", body: JSON.stringify(data) });
export const apiDelete = (path, options = {}) => request(path, { ...options, method: "DELETE" });
