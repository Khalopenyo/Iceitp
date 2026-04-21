package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestLimiterBlocksAfterLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)

	limiter := New(2, time.Minute)
	router := gin.New()
	router.POST("/limited", limiter.Middleware("test_scope"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/limited", nil)
		req.RemoteAddr = "192.0.2.10:1234"
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)
		if recorder.Code != http.StatusOK {
			t.Fatalf("request %d: expected status %d, got %d", i+1, http.StatusOK, recorder.Code)
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/limited", nil)
	req.RemoteAddr = "192.0.2.10:1234"
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("expected status %d, got %d: %s", http.StatusTooManyRequests, recorder.Code, recorder.Body.String())
	}
}
