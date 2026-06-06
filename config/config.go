// Package config provides configuration management utilities for the 3x-ui panel,
// including version information, logging levels, database paths, and environment variable handling.
package config

import (
	_ "embed"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

//go:embed version
var version string

//go:embed name
var name string

// LogLevel represents the logging level for the application.
type LogLevel string

// Logging level constants
const (
	Debug   LogLevel = "debug"
	Info    LogLevel = "info"
	Notice  LogLevel = "notice"
	Warning LogLevel = "warning"
	Error   LogLevel = "error"
)

// GetVersion returns the version string of the 3x-ui application.
func GetVersion() string {
	return strings.TrimSpace(version)
}

// GetName returns the name of the 3x-ui application.
func GetName() string {
	return strings.TrimSpace(name)
}

// GetLogLevel returns the current logging level based on environment variables or defaults to Info.
func GetLogLevel() LogLevel {
	if IsDebug() {
		return Debug
	}
	logLevel := os.Getenv("QUI_LOG_LEVEL")
	if logLevel == "" {
		return Info
	}
	return LogLevel(logLevel)
}

// IsDebug returns true if debug mode is enabled via the QUI_DEBUG environment variable.
func IsDebug() bool {
	return os.Getenv("QUI_DEBUG") == "true"
}

// IsSkipHSTS returns true if skipping HSTS mode is enabled via the QUI_SKIP_HSTS environment variable.
func IsSkipHSTS() bool {
	return os.Getenv("QUI_SKIP_HSTS") == "true"
}

// GetBinFolderPath returns the path to the binary folder, defaulting to "bin" if not set via QUI_BIN_FOLDER.
func GetBinFolderPath() string {
	binFolderPath := os.Getenv("QUI_BIN_FOLDER")
	if binFolderPath == "" {
		binFolderPath = "bin"
	}
	return binFolderPath
}

func getBaseDir() string {
	exePath, err := os.Executable()
	if err != nil {
		return "."
	}
	exeDir := filepath.Dir(exePath)
	exeDirLower := strings.ToLower(filepath.ToSlash(exeDir))
	if strings.Contains(exeDirLower, "/appdata/local/temp/") || strings.Contains(exeDirLower, "/go-build") {
		wd, err := os.Getwd()
		if err != nil {
			return "."
		}
		return wd
	}
	return exeDir
}

// GetDBFolderPath returns the path to the database folder based on environment variables or platform defaults.
func GetDBFolderPath() string {
	dbFolderPath := os.Getenv("QUI_DB_FOLDER")
	if dbFolderPath != "" {
		return dbFolderPath
	}
	if runtime.GOOS == "windows" {
		return getBaseDir()
	}
	return "/etc/q-ui"
}

// GetDBPath returns the full path to the database file.
func GetDBPath() string {
	return fmt.Sprintf("%s/%s.db", GetDBFolderPath(), GetName())
}

// GetDBKind returns the configured database backend: "sqlite" (default) or "postgres".
func GetDBKind() string {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("QUI_DB_TYPE")))
	switch v {
	case "postgres", "postgresql", "pg":
		return "postgres"
	default:
		return "sqlite"
	}
}

// GetDBDSN returns the PostgreSQL DSN from QUI_DB_DSN. Empty for sqlite.
func GetDBDSN() string {
	return strings.TrimSpace(os.Getenv("QUI_DB_DSN"))
}

// GetEnvFilePaths returns the candidate service environment file paths (the file
// systemd loads via EnvironmentFile) across the supported distro families.
func GetEnvFilePaths() []string {
	if runtime.GOOS == "windows" {
		return nil
	}
	return []string{
		"/etc/default/q-ui",
		"/etc/conf.d/q-ui",
		"/etc/sysconfig/q-ui",
	}
}

// GetLogFolder returns the path to the log folder based on environment variables or platform defaults.
func GetLogFolder() string {
	logFolderPath := os.Getenv("QUI_LOG_FOLDER")
	if logFolderPath != "" {
		return logFolderPath
	}
	if runtime.GOOS == "windows" {
		return filepath.Join(".", "log")
	}
	return "/var/log/q-ui"
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	if err != nil {
		return err
	}

	return out.Sync()
}

// legacyEnvSuffixes are the environment-variable names (without prefix) that the
// panel reads. They were renamed from XUI_* to QUI_* in the x-ui -> q-ui rebrand.
var legacyEnvSuffixes = []string{
	"LOG_LEVEL", "DEBUG", "SKIP_HSTS", "BIN_FOLDER", "DB_FOLDER", "DB_TYPE", "DB_DSN",
	"LOG_FOLDER", "MAIN_FOLDER", "SERVICE", "IN_DOCKER", "ENABLE_FAIL2BAN",
	"DB_MAX_IDLE_CONNS", "DB_MAX_OPEN_CONNS", "TEST_PG_DSN",
}

func init() {
	// Backward compatibility: honor legacy XUI_* environment variables when the
	// new QUI_* equivalent is unset, so existing installs and containers keep
	// working after the x-ui -> q-ui rename. Runs before any QUI_* read.
	for _, suffix := range legacyEnvSuffixes {
		if os.Getenv("QUI_"+suffix) != "" {
			continue
		}
		if v, ok := os.LookupEnv("XUI_" + suffix); ok {
			_ = os.Setenv("QUI_"+suffix, v)
		}
	}
}

func init() {
	// Auto-migrate the database from the pre-rename location so an in-place
	// upgrade from x-ui keeps its data. Only runs when the DB folder is the
	// platform default (QUI_DB_FOLDER unset) and the new DB does not yet exist.
	if os.Getenv("QUI_DB_FOLDER") != "" {
		return
	}
	newDBPath := GetDBPath()
	if _, err := os.Stat(newDBPath); err == nil {
		return // new DB already present, nothing to migrate
	}

	// Old default location of the SQLite file before the rename.
	var oldDBPath string
	if runtime.GOOS == "windows" {
		oldDBPath = filepath.Join(getBaseDir(), "x-ui.db")
	} else {
		oldDBPath = "/etc/x-ui/x-ui.db"
	}
	if _, err := os.Stat(oldDBPath); os.IsNotExist(err) {
		return // nothing to migrate
	}
	if err := os.MkdirAll(GetDBFolderPath(), 0o755); err != nil {
		return
	}
	_ = copyFile(oldDBPath, newDBPath) // best-effort; ignore error
}
