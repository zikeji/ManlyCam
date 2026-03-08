// Package config handles loading and validation of agent configuration.
package config

import (
	"fmt"
	"os"

	"github.com/BurntSushi/toml"
)

// Config is the root configuration for the ManlyCam agent.
type Config struct {
	Stream StreamConfig `toml:"stream"`
	FRP    FRPConfig    `toml:"frp"`
	Update UpdateConfig `toml:"update"`
}

// StreamConfig holds mediamtx camera pipeline settings.
// mediamtx supervises the libcamera source internally and exposes:
//   - RTSP at rtsp://localhost:<rtsp_port>/cam  (frp stream tunnel)
//   - HTTP API at 127.0.0.1:<api_port>          (frp api tunnel → server proxy for Story 3.6 controls)
type StreamConfig struct {
	Width     int  `toml:"width"`
	Height    int  `toml:"height"`
	Framerate int  `toml:"framerate"`
	HFlip     bool `toml:"hflip"`
	VFlip     bool `toml:"vflip"`
	RTSPPort    int    `toml:"rtsp_port"`
	APIPort     int    `toml:"api_port"`
	TuningFile  string `toml:"tuning_file"`
}

// FRPConfig holds frpc tunnel settings.
type FRPConfig struct {
	ServerAddr string          `toml:"server_addr"`
	ServerPort int             `toml:"server_port"`
	AuthToken  string          `toml:"auth_token"`
	Stream     FRPStreamConfig `toml:"stream"`
	API        FRPAPIConfig    `toml:"api"`
}

// FRPStreamConfig configures the stream proxy tunnel.
type FRPStreamConfig struct {
	RemotePort int `toml:"remote_port"`
}

// FRPAPIConfig configures the API proxy tunnel.
type FRPAPIConfig struct {
	LocalPort  int `toml:"local_port"`
	RemotePort int `toml:"remote_port"`
}

// UpdateConfig holds self-update settings.
type UpdateConfig struct {
	UpdateURL string `toml:"update_url"`
}

// Load reads and parses a TOML config file at path, validates required fields,
// and returns the populated Config or an error.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config file %q: %w", path, err)
	}
	var cfg Config
	if _, err := toml.Decode(string(data), &cfg); err != nil {
		return nil, fmt.Errorf("parsing config file %q: %w", path, err)
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (c *Config) validate() error {
	if c.FRP.ServerAddr == "" {
		return fmt.Errorf("config: frp.server_addr is required")
	}
	if c.FRP.ServerPort == 0 {
		return fmt.Errorf("config: frp.server_port is required")
	}
	if c.FRP.ServerPort < 1 || c.FRP.ServerPort > 65535 {
		return fmt.Errorf("config: frp.server_port must be 1-65535, got %d", c.FRP.ServerPort)
	}
	if c.FRP.AuthToken == "" {
		return fmt.Errorf("config: frp.auth_token is required")
	}
	if c.Stream.RTSPPort == 0 {
		return fmt.Errorf("config: stream.rtsp_port is required")
	}
	if c.Stream.RTSPPort < 1 || c.Stream.RTSPPort > 65535 {
		return fmt.Errorf("config: stream.rtsp_port must be 1-65535, got %d", c.Stream.RTSPPort)
	}
	if c.Stream.APIPort == 0 {
		return fmt.Errorf("config: stream.api_port is required")
	}
	if c.Stream.APIPort < 1 || c.Stream.APIPort > 65535 {
		return fmt.Errorf("config: stream.api_port must be 1-65535, got %d", c.Stream.APIPort)
	}
	if c.Stream.Width <= 0 {
		return fmt.Errorf("config: stream.width must be positive, got %d", c.Stream.Width)
	}
	if c.Stream.Height <= 0 {
		return fmt.Errorf("config: stream.height must be positive, got %d", c.Stream.Height)
	}
	if c.FRP.Stream.RemotePort < 1 || c.FRP.Stream.RemotePort > 65535 {
		return fmt.Errorf("config: frp.stream.remote_port must be 1-65535, got %d", c.FRP.Stream.RemotePort)
	}
	if c.FRP.API.LocalPort < 1 || c.FRP.API.LocalPort > 65535 {
		return fmt.Errorf("config: frp.api.local_port must be 1-65535, got %d", c.FRP.API.LocalPort)
	}
	if c.FRP.API.RemotePort < 1 || c.FRP.API.RemotePort > 65535 {
		return fmt.Errorf("config: frp.api.remote_port must be 1-65535, got %d", c.FRP.API.RemotePort)
	}
	return nil
}
