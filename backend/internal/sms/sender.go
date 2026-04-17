package sms

import (
	"bytes"
	"conferenceplatforma/internal/config"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	defaultGreenSMSBaseURL      = "https://api3.greensms.ru"
	defaultGreenSMSCodeTemplate = "Код входа в платформу конференции: %s"
)

type AuthCodeMessage struct {
	Phone string
	Code  string
}

type AuthCodeDelivery struct {
	RequestID string
}

type AuthCodeSender interface {
	SendAuthCode(ctx context.Context, message AuthCodeMessage) (AuthCodeDelivery, error)
}

type LogAuthCodeSender struct{}

func (s *LogAuthCodeSender) SendAuthCode(_ context.Context, message AuthCodeMessage) (AuthCodeDelivery, error) {
	log.Printf("phone auth code for %s: %s", message.Phone, message.Code)
	return AuthCodeDelivery{}, nil
}

type GreenSMSSender struct {
	baseURL      string
	token        string
	user         string
	pass         string
	from         string
	textTemplate string
	client       *http.Client
}

type greenSMSResponse struct {
	RequestID string `json:"request_id"`
	Error     string `json:"error"`
	Code      int    `json:"code"`
}

func NewAuthCodeSender(cfg config.Config) AuthCodeSender {
	if strings.TrimSpace(cfg.GreenSMSToken) == "" && (strings.TrimSpace(cfg.GreenSMSUser) == "" || strings.TrimSpace(cfg.GreenSMSPass) == "") {
		return &LogAuthCodeSender{}
	}
	baseURL := strings.TrimSpace(cfg.GreenSMSBaseURL)
	if baseURL == "" {
		baseURL = defaultGreenSMSBaseURL
	}
	return &GreenSMSSender{
		baseURL:      strings.TrimRight(baseURL, "/"),
		token:        strings.TrimSpace(cfg.GreenSMSToken),
		user:         strings.TrimSpace(cfg.GreenSMSUser),
		pass:         cfg.GreenSMSPass,
		from:         strings.TrimSpace(cfg.GreenSMSFrom),
		textTemplate: strings.TrimSpace(cfg.GreenSMSTextTemplate),
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (s *GreenSMSSender) SendAuthCode(ctx context.Context, message AuthCodeMessage) (AuthCodeDelivery, error) {
	if strings.TrimSpace(message.Phone) == "" || strings.TrimSpace(message.Code) == "" {
		return AuthCodeDelivery{}, fmt.Errorf("missing phone auth payload")
	}

	values := url.Values{}
	values.Set("to", strings.TrimSpace(message.Phone))
	values.Set("txt", s.renderText(message.Code))
	if s.from != "" {
		values.Set("from", s.from)
	}
	if s.token == "" {
		values.Set("user", s.user)
		values.Set("pass", s.pass)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/sms/send", bytes.NewBufferString(values.Encode()))
	if err != nil {
		return AuthCodeDelivery{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	if s.token != "" {
		req.Header.Set("Authorization", "Bearer "+s.token)
	}

	res, err := s.client.Do(req)
	if err != nil {
		return AuthCodeDelivery{}, err
	}
	defer res.Body.Close()

	var payload greenSMSResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return AuthCodeDelivery{}, fmt.Errorf("decode greensms response: %w", err)
	}

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		if strings.TrimSpace(payload.Error) != "" {
			return AuthCodeDelivery{}, fmt.Errorf("greensms: %s", strings.TrimSpace(payload.Error))
		}
		return AuthCodeDelivery{}, fmt.Errorf("greensms: unexpected status %d", res.StatusCode)
	}
	if strings.TrimSpace(payload.RequestID) == "" {
		if strings.TrimSpace(payload.Error) != "" {
			return AuthCodeDelivery{}, fmt.Errorf("greensms: %s", strings.TrimSpace(payload.Error))
		}
		return AuthCodeDelivery{}, fmt.Errorf("greensms: missing request_id")
	}

	return AuthCodeDelivery{RequestID: payload.RequestID}, nil
}

func (s *GreenSMSSender) renderText(code string) string {
	template := strings.TrimSpace(s.textTemplate)
	if template == "" {
		template = defaultGreenSMSCodeTemplate
	}
	if strings.Contains(template, "%s") {
		return fmt.Sprintf(template, code)
	}
	return strings.TrimSpace(template + " " + code)
}
