package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"

	"conferenceplatforma/internal/antiplagiat"
	"conferenceplatforma/internal/config"
	"conferenceplatforma/internal/db"
)

func main() {
	cfg := config.Load()
	database := db.Connect(cfg.DatabaseURL)
	service := antiplagiat.NewService(database)
	service.ResumePending()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	concurrency := envInt("ANTIPLAGIAT_WORKER_CONCURRENCY", 1)
	if concurrency < 1 {
		concurrency = 1
	}

	baseWorkerID := strings.TrimSpace(os.Getenv("ANTIPLAGIAT_WORKER_ID"))
	if baseWorkerID == "" {
		baseWorkerID = fmt.Sprintf("antiplagiat-worker-%d", os.Getpid())
	}

	log.Printf("antiplagiat worker starting with concurrency=%d", concurrency)

	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		workerID := fmt.Sprintf("%s-%d", baseWorkerID, i+1)
		go func(id string) {
			defer wg.Done()
			opts := antiplagiat.DefaultWorkerOptions()
			opts.WorkerID = id
			if err := service.RunWorker(ctx, opts); err != nil {
				log.Printf("antiplagiat worker %s stopped with error: %v", id, err)
			}
		}(workerID)
	}

	<-ctx.Done()
	log.Printf("antiplagiat worker shutting down")
	wg.Wait()
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
