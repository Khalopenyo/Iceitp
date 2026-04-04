package mail

import (
	"bytes"
	"conferenceplatforma/internal/config"
	"context"
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"
)

type PasswordResetMessage struct {
	To        string
	ResetURL  string
	ExpiresAt time.Time
}

type PasswordResetSender interface {
	SendPasswordReset(ctx context.Context, message PasswordResetMessage) error
}

type LogPasswordResetSender struct{}

func (s *LogPasswordResetSender) SendPasswordReset(_ context.Context, message PasswordResetMessage) error {
	log.Printf("password reset for %s: %s (expires %s)", message.To, message.ResetURL, message.ExpiresAt.Format(time.RFC3339))
	return nil
}

type SMTPPasswordResetSender struct {
	addr     string
	host     string
	from     string
	username string
	password string
}

func NewPasswordResetSender(cfg config.Config) PasswordResetSender {
	if strings.TrimSpace(cfg.SMTPHost) == "" || strings.TrimSpace(cfg.SMTPFrom) == "" {
		return &LogPasswordResetSender{}
	}
	return &SMTPPasswordResetSender{
		addr:     fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort),
		host:     cfg.SMTPHost,
		from:     cfg.SMTPFrom,
		username: cfg.SMTPUsername,
		password: cfg.SMTPPassword,
	}
}

func (s *SMTPPasswordResetSender) SendPasswordReset(ctx context.Context, message PasswordResetMessage) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	var auth smtp.Auth
	if strings.TrimSpace(s.username) != "" || strings.TrimSpace(s.password) != "" {
		auth = smtp.PlainAuth("", s.username, s.password, s.host)
	}

	body := fmt.Sprintf(
		"Здравствуйте!\n\nЧтобы задать новый пароль для ConferencePlatforma, откройте ссылку:\n%s\n\nСсылка действует до %s.\nЕсли вы не запрашивали восстановление пароля, просто проигнорируйте письмо.\n",
		message.ResetURL,
		message.ExpiresAt.Format(time.RFC3339),
	)

	var payload bytes.Buffer
	fmt.Fprintf(&payload, "To: %s\r\n", message.To)
	fmt.Fprintf(&payload, "From: %s\r\n", s.from)
	fmt.Fprintf(&payload, "Subject: ConferencePlatforma password reset\r\n")
	fmt.Fprintf(&payload, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&payload, "Content-Type: text/plain; charset=UTF-8\r\n")
	fmt.Fprintf(&payload, "\r\n%s", body)

	return smtp.SendMail(s.addr, auth, s.from, []string{message.To}, payload.Bytes())
}
