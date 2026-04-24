package mail

import (
	"bytes"
	"conferenceplatforma/internal/config"
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
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
	timeout  time.Duration
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
		timeout:  15 * time.Second,
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

	return sendMailWithTimeout(ctx, s.addr, s.host, auth, s.from, []string{message.To}, payload.Bytes(), s.timeout)
}

func sendMailWithTimeout(
	ctx context.Context,
	addr string,
	host string,
	auth smtp.Auth,
	from string,
	to []string,
	msg []byte,
	timeout time.Duration,
) error {
	if deadline, ok := ctx.Deadline(); ok {
		remaining := time.Until(deadline)
		if remaining > 0 && (timeout <= 0 || remaining < timeout) {
			timeout = remaining
		}
	}
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	dialer := &net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return err
	}

	deadline := time.Now().Add(timeout)
	_ = conn.SetDeadline(deadline)

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		_ = conn.Close()
		return err
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: host}); err != nil {
			return err
		}
	}

	if auth != nil {
		if ok, _ := client.Extension("AUTH"); ok {
			if err := client.Auth(auth); err != nil {
				return err
			}
		}
	}

	if err := client.Mail(from); err != nil {
		return err
	}
	for _, recipient := range to {
		if err := client.Rcpt(recipient); err != nil {
			return err
		}
	}

	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(msg); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}

	return client.Quit()
}
