package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/zikeji/ManlyCam/apps/agent/internal/config"
)

const validTOML = `
[stream]
width = 2328
height = 1748
framerate = 30
hflip = true
vflip = true
rtsp_port = 8554
api_port = 9997

[frp]
server_addr = "upstream.example.com"
server_port = 7000
auth_token = "supersecret"

[frp.stream]
remote_port = 11935

[frp.api]
local_port = 9997
remote_port = 11936

[update]
update_url = "https://api.github.com/repos/zikeji/ManlyCam/releases/latest"
`

func writeTempConfig(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "config.toml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write temp config: %v", err)
	}
	return path
}

func TestLoad_ValidTOML(t *testing.T) {
	path := writeTempConfig(t, validTOML)
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Stream.Width != 2328 {
		t.Errorf("Stream.Width = %d, want 2328", cfg.Stream.Width)
	}
	if cfg.Stream.Height != 1748 {
		t.Errorf("Stream.Height = %d, want 1748", cfg.Stream.Height)
	}
	if cfg.Stream.Framerate != 30 {
		t.Errorf("Stream.Framerate = %d, want 30", cfg.Stream.Framerate)
	}
	if !cfg.Stream.HFlip {
		t.Error("Stream.HFlip = false, want true")
	}
	if !cfg.Stream.VFlip {
		t.Error("Stream.VFlip = false, want true")
	}
	if cfg.Stream.RTSPPort != 8554 {
		t.Errorf("Stream.RTSPPort = %d, want 8554", cfg.Stream.RTSPPort)
	}
	if cfg.Stream.APIPort != 9997 {
		t.Errorf("Stream.APIPort = %d, want 9997", cfg.Stream.APIPort)
	}
	if cfg.FRP.ServerAddr != "upstream.example.com" {
		t.Errorf("FRP.ServerAddr = %q, want %q", cfg.FRP.ServerAddr, "upstream.example.com")
	}
	if cfg.FRP.ServerPort != 7000 {
		t.Errorf("FRP.ServerPort = %d, want 7000", cfg.FRP.ServerPort)
	}
	if cfg.FRP.AuthToken != "supersecret" {
		t.Errorf("FRP.AuthToken = %q, want %q", cfg.FRP.AuthToken, "supersecret")
	}
	if cfg.FRP.Stream.RemotePort != 11935 {
		t.Errorf("FRP.Stream.RemotePort = %d, want 11935", cfg.FRP.Stream.RemotePort)
	}
	if cfg.FRP.API.LocalPort != 9997 {
		t.Errorf("FRP.API.LocalPort = %d, want 9997", cfg.FRP.API.LocalPort)
	}
	if cfg.FRP.API.RemotePort != 11936 {
		t.Errorf("FRP.API.RemotePort = %d, want 11936", cfg.FRP.API.RemotePort)
	}
}

func TestLoad_MissingServerAddr(t *testing.T) {
	const tomlContent = `
[stream]
rtsp_port = 8554
api_port = 9997

[frp]
server_port = 7000
auth_token = "secret"
`
	path := writeTempConfig(t, tomlContent)
	_, err := config.Load(path)
	if err == nil {
		t.Fatal("Load() expected error for missing server_addr, got nil")
	}
}

func TestLoad_MissingFile(t *testing.T) {
	_, err := config.Load("/nonexistent/path/config.toml")
	if err == nil {
		t.Fatal("Load() expected error for missing file, got nil")
	}
}

func TestLoad_MalformedTOML(t *testing.T) {
	path := writeTempConfig(t, "this is not valid toml ][[[")
	_, err := config.Load(path)
	if err == nil {
		t.Fatal("Load() expected error for malformed TOML, got nil")
	}
}

func TestLoad_InvalidServerPort(t *testing.T) {
	const tomlContent = `
[stream]
width = 1920
height = 1080
framerate = 30
rtsp_port = 8554
api_port = 9997

[frp]
server_addr = "upstream.example.com"
server_port = 99999
auth_token = "secret"

[frp.stream]
remote_port = 11935

[frp.api]
local_port = 9997
remote_port = 11936
`
	path := writeTempConfig(t, tomlContent)
	_, err := config.Load(path)
	if err == nil {
		t.Fatal("Load() expected error for invalid server_port, got nil")
	}
}

func TestLoad_InvalidWidth(t *testing.T) {
	const tomlContent = `
[stream]
width = 0
height = 1080
framerate = 30
rtsp_port = 8554
api_port = 9997

[frp]
server_addr = "upstream.example.com"
server_port = 7000
auth_token = "secret"

[frp.stream]
remote_port = 11935

[frp.api]
local_port = 9997
remote_port = 11936
`
	path := writeTempConfig(t, tomlContent)
	_, err := config.Load(path)
	if err == nil {
		t.Fatal("Load() expected error for invalid width, got nil")
	}
}

func TestLoad_MissingAPIPort(t *testing.T) {
	const tomlContent = `
[stream]
width = 1920
height = 1080
framerate = 30
rtsp_port = 8554

[frp]
server_addr = "upstream.example.com"
server_port = 7000
auth_token = "secret"

[frp.stream]
remote_port = 11935

[frp.api]
local_port = 9997
remote_port = 11936
`
	path := writeTempConfig(t, tomlContent)
	_, err := config.Load(path)
	if err == nil {
		t.Fatal("Load() expected error for missing api_port, got nil")
	}
}

func TestLoad_MissingRTSPPort(t *testing.T) {
	const tomlContent = `
[stream]
width = 1920
height = 1080
framerate = 30
api_port = 9997

[frp]
server_addr = "upstream.example.com"
server_port = 7000
auth_token = "secret"

[frp.stream]
remote_port = 11935

[frp.api]
local_port = 9997
remote_port = 11936
`
	path := writeTempConfig(t, tomlContent)
	_, err := config.Load(path)
	if err == nil {
		t.Fatal("Load() expected error for missing rtsp_port, got nil")
	}
}

func TestLoad_InvalidFramerate(t *testing.T) {
	const tomlContent = `
[stream]
width = 1920
height = 1080
framerate = 0
rtsp_port = 8554
api_port = 9997

[frp]
server_addr = "upstream.example.com"
server_port = 7000
auth_token = "secret"

[frp.stream]
remote_port = 11935

[frp.api]
local_port = 9997
remote_port = 11936
`
	path := writeTempConfig(t, tomlContent)
	_, err := config.Load(path)
	if err == nil {
		t.Fatal("Load() expected error for invalid framerate (0), got nil")
	}
}
