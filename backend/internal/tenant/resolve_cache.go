package tenant

import (
	"sync"
	"time"
)

// resolveCache memoizes the Host-label → (org, conference) resolution that
// tenant.Middleware otherwise runs as two owner-pool queries on every request.
//
// TTL == 0 disables the cache entirely (get always misses, put is a no-op), which
// reproduces the original behaviour exactly — no staleness window. With a positive
// TTL the slug→org/conf mapping (which changes only on onboarding / status edits)
// is served from memory for up to TTL. Organization *status* is NOT cached here;
// RequireActiveOrg re-reads it per request, so suspension still takes effect
// immediately.
type resolveCache struct {
	ttl     time.Duration
	mu      sync.RWMutex
	entries map[string]resolveEntry
}

type resolveEntry struct {
	orgID    uint
	confID   uint
	matched  bool
	expireAt time.Time
}

func newResolveCache(ttl time.Duration) *resolveCache {
	return &resolveCache{ttl: ttl, entries: make(map[string]resolveEntry)}
}

// get returns the cached resolution for a Host label. ok is false on a miss, on an
// expired entry, or when the cache is disabled (ttl <= 0).
func (rc *resolveCache) get(label string) (orgID, confID uint, matched, ok bool) {
	if rc.ttl <= 0 {
		return 0, 0, false, false
	}
	rc.mu.RLock()
	e, present := rc.entries[label]
	rc.mu.RUnlock()
	if !present || time.Now().After(e.expireAt) {
		return 0, 0, false, false
	}
	return e.orgID, e.confID, e.matched, true
}

func (rc *resolveCache) put(label string, orgID, confID uint, matched bool) {
	if rc.ttl <= 0 {
		return
	}
	rc.mu.Lock()
	rc.entries[label] = resolveEntry{orgID: orgID, confID: confID, matched: matched, expireAt: time.Now().Add(rc.ttl)}
	rc.mu.Unlock()
}
