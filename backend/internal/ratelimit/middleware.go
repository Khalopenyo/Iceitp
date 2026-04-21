package ratelimit

import (
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type entry struct {
	count   int
	resetAt time.Time
}

type Limiter struct {
	limit   int
	window  time.Duration
	mu      sync.Mutex
	entries map[string]entry
}

func New(limit int, window time.Duration) *Limiter {
	if limit <= 0 {
		limit = 1
	}
	if window <= 0 {
		window = time.Minute
	}
	return &Limiter{
		limit:   limit,
		window:  window,
		entries: make(map[string]entry),
	}
}

func (l *Limiter) Middleware(scope string) gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now()
		key := scope + ":" + c.ClientIP()

		l.mu.Lock()
		l.cleanup(now)
		record := l.entries[key]
		if record.resetAt.IsZero() || !record.resetAt.After(now) {
			record = entry{
				count:   0,
				resetAt: now.Add(l.window),
			}
		}
		if record.count >= l.limit {
			retryAfter := int(math.Ceil(record.resetAt.Sub(now).Seconds()))
			l.mu.Unlock()
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":               "too many requests",
				"retry_after_seconds": retryAfter,
			})
			return
		}
		record.count++
		l.entries[key] = record
		l.mu.Unlock()

		c.Next()
	}
}

func (l *Limiter) cleanup(now time.Time) {
	for key, record := range l.entries {
		if !record.resetAt.After(now) {
			delete(l.entries, key)
		}
	}
}
