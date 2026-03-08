// Package tunnel manages the frp reverse proxy tunnel to the server.
package tunnel

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"time"

	"github.com/zikeji/ManlyCam/apps/agent/internal/config"
)

// BuildFRPConfig generates the frpc TOML configuration string from the agent config.
// Uses frp v0.6x+ TOML format with [[proxies]] arrays.
// It is a pure function — testable without frpc binary present.
//
// Two proxies are configured:
//   - "stream": forwards stream.rtsp_port (mediamtx RTSP) → frp.stream.remote_port
//   - "api":    forwards frp.api.local_port → frp.api.remote_port
func BuildFRPConfig(cfg config.Config) string {
	return fmt.Sprintf(`serverAddr = %q
serverPort = %d

auth.token = %q

[[proxies]]
name = "stream"
type = "tcp"
localIP = "127.0.0.1"
localPort = %d
remotePort = %d

[[proxies]]
name = "api"
type = "tcp"
localIP = "127.0.0.1"
localPort = %d
remotePort = %d
`,
		cfg.FRP.ServerAddr,
		cfg.FRP.ServerPort,
		cfg.FRP.AuthToken,
		cfg.Stream.RTSPPort,
		cfg.FRP.Stream.RemotePort,
		cfg.FRP.API.LocalPort,
		cfg.FRP.API.RemotePort,
	)
}

// Tunnel manages the frpc subprocess with exponential backoff on failure.
// frpc binary must be installed on $PATH — see deployment docs.
type Tunnel struct{}

// Start checks for frpc on PATH, writes a temp config, and runs frpc.
// On subprocess exit it restarts with exponential backoff (1s → 2s → 4s → 60s cap).
// On context cancellation it terminates frpc and returns ctx.Err().
func (t *Tunnel) Start(ctx context.Context, cfg config.Config) error {
	if _, err := exec.LookPath("frpc"); err != nil {
		return fmt.Errorf("frpc binary not found on PATH: %w", err)
	}

	tmpFile, err := writeTempFRPConfig(cfg)
	if err != nil {
		return err
	}
	defer os.Remove(tmpFile)

	backoff := time.Second
	for {
		cmd := exec.CommandContext(ctx, "frpc", "-c", tmpFile)
		cmd.Stdout = os.Stderr // frpc logs to stdout; redirect to our stderr
		cmd.Stderr = os.Stderr

		if err := cmd.Run(); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			log.Printf("frpc exited with error: %v; retrying in %s", err, backoff)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			backoff = min(backoff*2, 60*time.Second)
		} else {
			// frpc exited cleanly (unexpected) — restart with backoff.
			if ctx.Err() != nil {
				return ctx.Err()
			}
			backoff = min(backoff*2, 60*time.Second)
		}
	}
}

func writeTempFRPConfig(cfg config.Config) (string, error) {
	f, err := os.CreateTemp("", "frpc-*.toml")
	if err != nil {
		return "", fmt.Errorf("creating temp frpc config: %w", err)
	}
	defer f.Close()
	if _, err := f.WriteString(BuildFRPConfig(cfg)); err != nil {
		os.Remove(f.Name())
		return "", fmt.Errorf("writing temp frpc config: %w", err)
	}
	return f.Name(), nil
}
