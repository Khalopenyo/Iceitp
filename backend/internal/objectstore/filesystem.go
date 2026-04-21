package objectstore

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type FilesystemStore struct {
	root string
}

func NewFilesystemStore(root string) (Store, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		return nil, ErrNotConfigured
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(absRoot, 0o755); err != nil {
		return nil, err
	}
	return &FilesystemStore{root: absRoot}, nil
}

func (s *FilesystemStore) Put(_ context.Context, key string, body io.Reader, _ int64, _ string) error {
	target, err := s.resolvePath(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}

	tempFile, err := os.CreateTemp(filepath.Dir(target), ".upload-*")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()
	defer func() {
		_ = tempFile.Close()
		_ = os.Remove(tempPath)
	}()

	if _, err := io.Copy(tempFile, body); err != nil {
		return err
	}
	if err := tempFile.Close(); err != nil {
		return err
	}
	if err := os.Rename(tempPath, target); err != nil {
		return err
	}
	return nil
}

func (s *FilesystemStore) Get(_ context.Context, key string) (*Object, error) {
	target, err := s.resolvePath(key)
	if err != nil {
		return nil, err
	}
	file, err := os.Open(target)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrObjectNotFound
		}
		return nil, err
	}

	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, err
	}

	header := make([]byte, 512)
	n, err := file.Read(header)
	if err != nil && !errors.Is(err, io.EOF) {
		_ = file.Close()
		return nil, err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		_ = file.Close()
		return nil, err
	}

	return &Object{
		Body:        file,
		ContentType: http.DetectContentType(header[:n]),
		Size:        info.Size(),
	}, nil
}

func (s *FilesystemStore) Delete(_ context.Context, key string) error {
	target, err := s.resolvePath(key)
	if err != nil {
		return err
	}
	if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *FilesystemStore) resolvePath(key string) (string, error) {
	cleanKey := strings.Trim(strings.TrimSpace(key), "/")
	if cleanKey == "" {
		return "", ErrObjectNotFound
	}
	target := filepath.Clean(filepath.Join(s.root, filepath.FromSlash(cleanKey)))
	rel, err := filepath.Rel(s.root, target)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New("invalid storage key")
	}
	return target, nil
}
