package objectstore

import (
	"fmt"
	"strings"
)

// New selects a Store implementation by backend name. "" or "filesystem" returns
// the local-filesystem store (the default — single-VM deployments are byte-for-byte
// unchanged). This is the seam for adding an S3/object-store backend behind the
// Store interface without touching any handler; until that exists, "s3" reports
// ErrNotConfigured rather than silently falling back to local disk.
func New(backend, root string) (Store, error) {
	switch strings.ToLower(strings.TrimSpace(backend)) {
	case "", "filesystem", "fs", "local":
		return NewFilesystemStore(root)
	case "s3", "object", "minio":
		return nil, fmt.Errorf("object storage backend %q not yet implemented: %w", backend, ErrNotConfigured)
	default:
		return nil, fmt.Errorf("unknown FILE_STORAGE_BACKEND %q (supported: filesystem, s3)", backend)
	}
}
