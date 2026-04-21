package objectstore

import (
	"bytes"
	"context"
	"io"
	"sync"
)

type MemoryStore struct {
	mu      sync.RWMutex
	objects map[string]memoryObject
}

type memoryObject struct {
	contentType string
	body        []byte
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		objects: make(map[string]memoryObject),
	}
}

func (s *MemoryStore) Put(_ context.Context, key string, body io.Reader, _ int64, contentType string) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.objects[key] = memoryObject{
		contentType: contentType,
		body:        data,
	}
	return nil
}

func (s *MemoryStore) Get(_ context.Context, key string) (*Object, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	obj, ok := s.objects[key]
	if !ok {
		return nil, ErrObjectNotFound
	}
	return &Object{
		Body:        io.NopCloser(bytes.NewReader(obj.body)),
		ContentType: obj.contentType,
		Size:        int64(len(obj.body)),
	}, nil
}

func (s *MemoryStore) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.objects, key)
	return nil
}
