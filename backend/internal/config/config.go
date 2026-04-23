package config

import (
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL             string
	JWTSecret               string
	Port                    string
	AccessTokenTTL          time.Duration
	CORSOrigins             []string
	TrustedProxies          []string
	AppBaseURL              string
	SMTPHost                string
	SMTPPort                int
	SMTPUsername            string
	SMTPPassword            string
	SMTPFrom                string
	PasswordResetTTL        time.Duration
	PhoneAuthCodeTTL        time.Duration
	PhoneAuthResendCooldown time.Duration
	PhoneAuthMaxAttempts    int
	GreenSMSBaseURL         string
	GreenSMSToken           string
	GreenSMSUser            string
	GreenSMSPass            string
	GreenSMSChannel         string
	GreenSMSFrom            string
	GreenSMSTextTemplate    string
	GreenSMSTelegramTTL     int
	GreenSMSTelegramCascade string
	GreenSMSTelegramText    string
	FileStorageRoot         string
}

const (
	defaultAppBaseURL        = "http://localhost:5173"
	defaultAccessTokenTTL    = 12 * time.Hour
	defaultSMTPPort          = 587
	defaultPasswordResetTTL  = 2 * time.Hour
	defaultPhoneAuthCodeTTL  = 10 * time.Minute
	defaultPhoneAuthResend   = 60 * time.Second
	defaultPhoneAuthAttempts = 5
)

func loadDotEnv() {
	// Minimal .env loader for local development.
	// - Searches for .env in current dir and repo root (../.env when run from backend/).
	// - Does not override existing environment variables.
	paths := []string{".env", filepath.Join("..", ".env")}
	for _, p := range paths {
		b, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		lines := strings.Split(string(b), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			if strings.HasPrefix(line, "export ") {
				line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
			}
			eq := strings.IndexByte(line, '=')
			if eq <= 0 {
				continue
			}
			key := strings.TrimSpace(line[:eq])
			val := strings.TrimSpace(line[eq+1:])
			if key == "" {
				continue
			}
			// Strip inline comments for unquoted values.
			if val != "" && !strings.HasPrefix(val, "\"") && !strings.HasPrefix(val, "'") {
				if hash := strings.IndexByte(val, '#'); hash >= 0 {
					val = strings.TrimSpace(val[:hash])
				}
			}
			// Strip surrounding quotes.
			if len(val) >= 2 {
				if (val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'') {
					val = val[1 : len(val)-1]
				}
			}
			if _, exists := os.LookupEnv(key); exists {
				continue
			}
			_ = os.Setenv(key, val)
		}
		return
	}
}

func Load() Config {
	loadDotEnv()
	appBaseURL := loadAppBaseURL()
	corsOrigins := splitEnvList(os.Getenv("CORS_ORIGINS"))
	if len(corsOrigins) == 0 {
		corsOrigins = defaultCORSOrigins(appBaseURL)
	}
	cfg := Config{
		DatabaseURL:             os.Getenv("DATABASE_URL"),
		JWTSecret:               os.Getenv("JWT_SECRET"),
		Port:                    os.Getenv("PORT"),
		AccessTokenTTL:          envDuration("ACCESS_TOKEN_TTL", defaultAccessTokenTTL),
		CORSOrigins:             corsOrigins,
		TrustedProxies:          splitEnvList(os.Getenv("TRUSTED_PROXIES")),
		AppBaseURL:              appBaseURL,
		SMTPHost:                strings.TrimSpace(os.Getenv("SMTP_HOST")),
		SMTPPort:                envInt("SMTP_PORT", defaultSMTPPort),
		SMTPUsername:            strings.TrimSpace(os.Getenv("SMTP_USERNAME")),
		SMTPPassword:            os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:                strings.TrimSpace(os.Getenv("SMTP_FROM")),
		PasswordResetTTL:        envDuration("PASSWORD_RESET_TTL", defaultPasswordResetTTL),
		PhoneAuthCodeTTL:        envDuration("PHONE_AUTH_CODE_TTL", defaultPhoneAuthCodeTTL),
		PhoneAuthResendCooldown: envDuration("PHONE_AUTH_RESEND_COOLDOWN", defaultPhoneAuthResend),
		PhoneAuthMaxAttempts:    envInt("PHONE_AUTH_MAX_ATTEMPTS", defaultPhoneAuthAttempts),
		GreenSMSBaseURL:         strings.TrimSpace(os.Getenv("GREENSMS_API_URL")),
		GreenSMSToken:           strings.TrimSpace(os.Getenv("GREENSMS_TOKEN")),
		GreenSMSUser:            strings.TrimSpace(os.Getenv("GREENSMS_USER")),
		GreenSMSPass:            os.Getenv("GREENSMS_PASS"),
		GreenSMSChannel:         strings.TrimSpace(os.Getenv("GREENSMS_CHANNEL")),
		GreenSMSFrom:            strings.TrimSpace(os.Getenv("GREENSMS_FROM")),
		GreenSMSTextTemplate:    os.Getenv("GREENSMS_TEXT_TEMPLATE"),
		GreenSMSTelegramTTL:     envInt("GREENSMS_TELEGRAM_TTL", 3600),
		GreenSMSTelegramCascade: strings.TrimSpace(os.Getenv("GREENSMS_TELEGRAM_CASCADE")),
		GreenSMSTelegramText:    os.Getenv("GREENSMS_TELEGRAM_CASCADE_TEXT"),
		FileStorageRoot:         defaultFileStorageRoot(),
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	return cfg
}

func defaultCORSOrigins(appBaseURL string) []string {
	origins := []string{
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"http://localhost",
		"http://127.0.0.1",
	}

	if parsed, err := url.Parse(appBaseURL); err == nil && parsed.Scheme != "" && parsed.Host != "" {
		origins = append([]string{parsed.Scheme + "://" + parsed.Host}, origins...)
	}

	seen := make(map[string]struct{}, len(origins))
	result := make([]string, 0, len(origins))
	for _, origin := range origins {
		origin = strings.TrimSpace(origin)
		if origin == "" {
			continue
		}
		if _, exists := seen[origin]; exists {
			continue
		}
		seen[origin] = struct{}{}
		result = append(result, origin)
	}
	return result
}

func defaultFileStorageRoot() string {
	if value := strings.TrimSpace(os.Getenv("FILE_STORAGE_ROOT")); value != "" {
		return value
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "storage"
	}
	if filepath.Base(cwd) == "backend" {
		return filepath.Clean(filepath.Join(cwd, "..", "storage"))
	}
	return filepath.Join(cwd, "storage")
}

func loadAppBaseURL() string {
	value := strings.TrimSpace(os.Getenv("APP_BASE_URL"))
	if value == "" {
		return defaultAppBaseURL
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		log.Fatal("APP_BASE_URL must be an absolute URL")
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	parsed.Path = strings.TrimSuffix(parsed.Path, "/")
	return parsed.String()
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func envDuration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func splitEnvList(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		result = append(result, part)
	}
	if len(result) == 0 {
		return nil
	}
	return result
}
