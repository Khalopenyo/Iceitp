package handlers

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type paginatedResponse[T any] struct {
	Items    []T   `json:"items"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
}

func parsePagination(c *gin.Context, defaultPageSize, maxPageSize int) (page, pageSize int) {
	page = parsePositiveInt(c.Query("page"), 1)
	pageSize = parsePositiveInt(c.Query("page_size"), defaultPageSize)
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize
}

func parsePositiveInt(raw string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
