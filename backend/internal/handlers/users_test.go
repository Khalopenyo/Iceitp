package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestUpdateProfileRejectsDuplicatePhone(t *testing.T) {
	db := newAuthTestDB(t)
	section := seedSection(t, db, "Аудитория 201")
	firstUser := seedUserWithPhone(t, db, "first@example.com", "+79990000001")
	secondUser := seedUserWithPhone(t, db, "second@example.com", "+79990000002")

	router := gin.New()
	handler := &UserHandler{DB: db}
	router.PUT("/me/profile", func(c *gin.Context) {
		c.Set("user_id", secondUser.ID)
		handler.UpdateProfile(c)
	})

	body, err := json.Marshal(models.Profile{
		FullName:     "Второй пользователь",
		Organization: "Тест",
		Position:     "Доцент",
		City:         "Москва",
		Degree:       "Кандидат наук, доцент",
		SectionID:    &section.ID,
		TalkTitle:    "Тестовый доклад",
		Phone:        firstUser.Profile.Phone,
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPut, "/me/profile", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d: %s", http.StatusConflict, recorder.Code, recorder.Body.String())
	}
}
