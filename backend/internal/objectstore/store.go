package objectstore

import (
	"context"
	"errors"
	"io"
)

var ErrNotConfigured = errors.New("object storage is not configured")
var ErrObjectNotFound = errors.New("object not found")

type Object struct {
	Body        io.ReadCloser
	ContentType string
	Size        int64
}

type Store interface {
	Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error
	Get(ctx context.Context, key string) (*Object, error)
	Delete(ctx context.Context, key string) error
}
