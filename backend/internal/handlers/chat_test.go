package handlers

import (
	"bytes"
	"conferenceplatforma/internal/models"
	"conferenceplatforma/internal/objectstore"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type chatTestFile struct {
	FieldName string
	FileName  string
	Content   []byte
}

func newChatTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Profile{},
		&models.Section{},
		&models.ChatMessage{},
		&models.ChatAttachment{},
	); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return db
}

func newChatTestRouter(db *gorm.DB, storageRoot string, maxAttachmentSize int64) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		userID, _ := strconv.ParseUint(c.GetHeader("X-User-ID"), 10, 64)
		role := models.Role(strings.TrimSpace(c.GetHeader("X-User-Role")))
		if role == "" {
			role = models.RoleParticipant
		}
		c.Set("user_id", uint(userID))
		c.Set("role", role)
		c.Next()
	})

	store, err := objectstore.NewFilesystemStore(storageRoot)
	if err != nil {
		panic(err)
	}
	handler := &ChatHandler{
		DB:                     db,
		Store:                  store,
		MaxAttachmentSizeBytes: maxAttachmentSize,
	}
	router.GET("/api/chat", handler.ListMessages)
	router.POST("/api/chat", handler.PostMessage)
	router.GET("/api/chat/attachments/:id", handler.DownloadAttachment)
	return router
}

func seedChatSection(t *testing.T, db *gorm.DB, title string) models.Section {
	t.Helper()

	section := models.Section{Title: title}
	if err := db.Create(&section).Error; err != nil {
		t.Fatalf("create section: %v", err)
	}
	return section
}

func seedChatUser(t *testing.T, db *gorm.DB, email string, role models.Role, sectionID *uint) models.User {
	t.Helper()

	user := models.User{
		Email:        email,
		PasswordHash: "hash",
		Role:         role,
		UserType:     models.UserTypeOffline,
		Profile: models.Profile{
			FullName:     "Участник " + email,
			Organization: "Организация",
			Position:     "Докладчик",
			SectionID:    sectionID,
			ConsentGiven: true,
		},
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	return user
}

func performChatJSONRequest(t *testing.T, router *gin.Engine, method, path string, payload any, user models.User) *httptest.ResponseRecorder {
	t.Helper()

	var body *bytes.Reader
	if payload == nil {
		body = bytes.NewReader(nil)
	} else {
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		body = bytes.NewReader(encoded)
	}

	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", strconv.FormatUint(uint64(user.ID), 10))
	req.Header.Set("X-User-Role", string(user.Role))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func performChatMultipartRequest(
	t *testing.T,
	router *gin.Engine,
	path string,
	fields map[string]string,
	files []chatTestFile,
	user models.User,
) *httptest.ResponseRecorder {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatalf("write field %s: %v", key, err)
		}
	}
	for _, file := range files {
		part, err := writer.CreateFormFile(file.FieldName, file.FileName)
		if err != nil {
			t.Fatalf("create form file: %v", err)
		}
		if _, err := part.Write(file.Content); err != nil {
			t.Fatalf("write file content: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("X-User-ID", strconv.FormatUint(uint64(user.ID), 10))
	req.Header.Set("X-User-Role", string(user.Role))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func performChatDownloadRequest(t *testing.T, router *gin.Engine, path string, user models.User) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("X-User-ID", strconv.FormatUint(uint64(user.ID), 10))
	req.Header.Set("X-User-Role", string(user.Role))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func TestPostChatMessageWithoutAttachmentStillWorks(t *testing.T) {
	db := newChatTestDB(t)
	router := newChatTestRouter(db, t.TempDir(), 1024*1024)
	user := seedChatUser(t, db, "conference@example.com", models.RoleParticipant, nil)

	recorder := performChatJSONRequest(t, router, http.MethodPost, "/api/chat", map[string]any{
		"scope":   "conference",
		"content": "Привет, конференция",
	}, user)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, recorder.Code, recorder.Body.String())
	}

	var response chatMessageResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.Content != "Привет, конференция" {
		t.Fatalf("unexpected content %q", response.Content)
	}
	if len(response.Attachments) != 0 {
		t.Fatalf("expected no attachments, got %d", len(response.Attachments))
	}
}

func TestPostChatMessageWithAttachment(t *testing.T) {
	db := newChatTestDB(t)
	storageRoot := t.TempDir()
	router := newChatTestRouter(db, storageRoot, 1024*1024)
	user := seedChatUser(t, db, "attach@example.com", models.RoleParticipant, nil)

	recorder := performChatMultipartRequest(t, router, "/api/chat", map[string]string{
		"scope":   "conference",
		"content": "См. файл",
	}, []chatTestFile{
		{
			FieldName: "files",
			FileName:  "notes.pdf",
			Content:   []byte("conference attachment"),
		},
	}, user)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, recorder.Code, recorder.Body.String())
	}

	var response chatMessageResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(response.Attachments) != 1 {
		t.Fatalf("expected 1 attachment, got %d", len(response.Attachments))
	}
	if response.Attachments[0].DownloadURL == "" {
		t.Fatalf("expected download url in response")
	}

	var attachment models.ChatAttachment
	if err := db.First(&attachment, response.Attachments[0].ID).Error; err != nil {
		t.Fatalf("load attachment: %v", err)
	}
	if attachment.FileName != "notes.pdf" {
		t.Fatalf("expected stored file name notes.pdf, got %q", attachment.FileName)
	}
	storedPath := filepath.Join(filepath.Clean(storageRoot), filepath.FromSlash(attachment.ObjectKey))
	if _, err := os.Stat(storedPath); err != nil {
		t.Fatalf("expected stored attachment file: %v", err)
	}
	if !strings.HasPrefix(storedPath, filepath.Clean(storageRoot)) {
		t.Fatalf("expected file path inside test storage root, got %q", storedPath)
	}

	listRecorder := performChatDownloadRequest(t, router, "/api/chat?scope=conference", user)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected list status %d, got %d: %s", http.StatusOK, listRecorder.Code, listRecorder.Body.String())
	}

	var listResponse chatListResponse
	if err := json.Unmarshal(listRecorder.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("unmarshal list response: %v", err)
	}
	if len(listResponse.Messages) != 1 || len(listResponse.Messages[0].Attachments) != 1 {
		t.Fatalf("expected 1 message with 1 attachment, got %#v", listResponse.Messages)
	}
}

func TestChatAttachmentDownloadRequiresAuthorizedScope(t *testing.T) {
	db := newChatTestDB(t)
	router := newChatTestRouter(db, t.TempDir(), 1024*1024)
	sectionA := seedChatSection(t, db, "Секция A")
	sectionB := seedChatSection(t, db, "Секция B")
	author := seedChatUser(t, db, "section-a@example.com", models.RoleParticipant, &sectionA.ID)
	other := seedChatUser(t, db, "section-b@example.com", models.RoleParticipant, &sectionB.ID)

	recorder := performChatMultipartRequest(t, router, "/api/chat", map[string]string{
		"scope": "section",
	}, []chatTestFile{
		{
			FieldName: "files",
			FileName:  "agenda.pdf",
			Content:   []byte("section attachment"),
		},
	}, author)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, recorder.Code, recorder.Body.String())
	}

	var response chatMessageResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(response.Attachments) != 1 {
		t.Fatalf("expected 1 attachment, got %d", len(response.Attachments))
	}

	authorized := performChatDownloadRequest(t, router, response.Attachments[0].DownloadURL, author)
	if authorized.Code != http.StatusOK {
		t.Fatalf("expected authorized status %d, got %d", http.StatusOK, authorized.Code)
	}

	forbidden := performChatDownloadRequest(t, router, response.Attachments[0].DownloadURL, other)
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden status %d, got %d: %s", http.StatusForbidden, forbidden.Code, forbidden.Body.String())
	}
}

func TestPostChatMessageRejectsInvalidAttachment(t *testing.T) {
	db := newChatTestDB(t)
	router := newChatTestRouter(db, t.TempDir(), 16)
	user := seedChatUser(t, db, "invalid@example.com", models.RoleParticipant, nil)

	testCases := []struct {
		name     string
		fileName string
		content  []byte
	}{
		{
			name:     "unsupported extension",
			fileName: "danger.exe",
			content:  []byte("not allowed"),
		},
		{
			name:     "oversized attachment",
			fileName: "big.txt",
			content:  bytes.Repeat([]byte("a"), 32),
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := performChatMultipartRequest(t, router, "/api/chat", map[string]string{
				"scope": "conference",
			}, []chatTestFile{
				{
					FieldName: "files",
					FileName:  tc.fileName,
					Content:   tc.content,
				},
			}, user)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, recorder.Code, recorder.Body.String())
			}
		})
	}
}
