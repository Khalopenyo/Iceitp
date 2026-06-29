package db

import (
	"log"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// PoolConfig bounds the underlying *sql.DB connection pool. Zero values leave the
// corresponding driver default untouched. With RLS enforced every request holds a
// connection for its whole duration, so MaxOpenConns must be capped to keep a
// traffic spike from exhausting Postgres' max_connections.
type PoolConfig struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

// applyPool sets the pool limits on the gorm connection. It only changes the pool
// shape (no query behaviour), so it is safe on both the owner and app pools.
func applyPool(gdb *gorm.DB, pool PoolConfig) error {
	sqlDB, err := gdb.DB()
	if err != nil {
		return err
	}
	if pool.MaxOpenConns > 0 {
		sqlDB.SetMaxOpenConns(pool.MaxOpenConns)
	}
	if pool.MaxIdleConns > 0 {
		sqlDB.SetMaxIdleConns(pool.MaxIdleConns)
	}
	if pool.ConnMaxLifetime > 0 {
		sqlDB.SetConnMaxLifetime(pool.ConnMaxLifetime)
	}
	if pool.ConnMaxIdleTime > 0 {
		sqlDB.SetConnMaxIdleTime(pool.ConnMaxIdleTime)
	}
	return nil
}

// Open opens a database connection without running migrations. Used for the
// app-serving (conf_app) pool under RLS, which must not — and cannot — migrate.
func Open(databaseURL string, pool PoolConfig) (*gorm.DB, error) {
	gdb, err := gorm.Open(postgres.Open(databaseURL), &gorm.Config{TranslateError: true})
	if err != nil {
		return nil, err
	}
	if err := applyPool(gdb, pool); err != nil {
		return nil, err
	}
	return gdb, nil
}

// Connect opens the owner connection and runs migrations on it. The owner role
// owns the tables (bypasses RLS), so migrations/seed run here.
func Connect(databaseURL string, pool PoolConfig) *gorm.DB {
	db, err := Open(databaseURL, pool)
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}
	if err := RunMigrations(db); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	return db
}
