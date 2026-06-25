import { Button } from "./index.jsx";

// Общая пагинация для админ-списков (вместо дублей в Admin/AdminQuestions).
export function Pagination({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="ui-pagination">
      <span>
        Страница {page} из {totalPages} · всего {total}
      </span>
      <Button
        variant="ghost"
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        Назад
      </Button>
      <Button
        variant="ghost"
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        Вперёд
      </Button>
    </div>
  );
}
