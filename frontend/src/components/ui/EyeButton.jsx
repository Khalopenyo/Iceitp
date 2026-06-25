// Переключатель видимости пароля (глазок) для полей ввода паролей.
export function EyeButton({ shown, onToggle }) {
  return (
    <button
      type="button"
      className="auth-eye"
      onClick={onToggle}
      aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
      aria-pressed={shown}
      tabIndex={-1}
    >
      {shown ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7a13 13 0 0 1-2.2 3M6.3 6.3A13 13 0 0 0 3 12c0 2.5 4 7 9 7a9.4 9.4 0 0 0 3.2-.55" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 12c1.5-3.5 5-7 9-7s7.5 3.5 9 7c-1.5 3.5-5 7-9 7s-7.5-3.5-9-7Z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      )}
    </button>
  );
}
