FROM golang:1.24.5-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/server ./cmd/server && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/bootstrap-admin ./cmd/bootstrap_admin

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S app && \
    adduser -S -G app app && \
    mkdir -p /app/storage && \
    chown -R app:app /app

WORKDIR /app

COPY --from=builder /out/server /usr/local/bin/server
COPY --from=builder /out/bootstrap-admin /usr/local/bin/bootstrap-admin
COPY --from=builder /src/assets /app/assets

USER app

EXPOSE 8080

CMD ["server"]
