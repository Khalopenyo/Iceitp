package tenant

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func TestDBReturnsFallbackWithoutRequestTx(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	fallback := &gorm.DB{}
	if DB(c, fallback) != fallback {
		t.Error("DB should return the fallback when no request transaction is installed")
	}
}

// TestRLSMiddlewareDisabledIsNoOp verifies that with enforcement off the
// middleware installs no transaction and passes the request through unchanged, so
// handlers transparently use the global pool via DB(c, fallback).
func TestRLSMiddlewareDisabledIsNoOp(t *testing.T) {
	gin.SetMode(gin.TestMode)
	fallback := &gorm.DB{}
	var got *gorm.DB

	r := gin.New()
	r.Use(RLSMiddleware(nil, false)) // db arg is unused on the disabled path
	r.GET("/x", func(c *gin.Context) {
		got = DB(c, fallback)
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if got != fallback {
		t.Error("disabled RLSMiddleware must not install a request transaction")
	}
}
