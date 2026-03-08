package tunnel_test

import (
	"strings"
	"testing"

	"github.com/zikeji/ManlyCam/apps/agent/internal/config"
	"github.com/zikeji/ManlyCam/apps/agent/internal/tunnel"
)

func testConfig() config.Config {
	return config.Config{
		Stream: config.StreamConfig{
			OutputPort: 5000,
		},
		FRP: config.FRPConfig{
			ServerAddr: "upstream.example.com",
			ServerPort: 7000,
			AuthToken:  "supersecret",
			Stream: config.FRPStreamConfig{
				RemotePort: 11935,
			},
			API: config.FRPAPIConfig{
				LocalPort:  8080,
				RemotePort: 11936,
			},
		},
	}
}

func TestBuildFRPConfig_ServerFields(t *testing.T) {
	out := tunnel.BuildFRPConfig(testConfig())
	if !strings.Contains(out, `serverAddr = "upstream.example.com"`) {
		t.Errorf("missing serverAddr; got:\n%s", out)
	}
	if !strings.Contains(out, "serverPort = 7000") {
		t.Errorf("missing serverPort; got:\n%s", out)
	}
	if !strings.Contains(out, `auth.token = "supersecret"`) {
		t.Errorf("missing auth.token; got:\n%s", out)
	}
}

func TestBuildFRPConfig_StreamProxy(t *testing.T) {
	out := tunnel.BuildFRPConfig(testConfig())
	if !strings.Contains(out, "localPort = 5000") {
		t.Errorf("stream localPort mismatch; got:\n%s", out)
	}
	if !strings.Contains(out, "remotePort = 11935") {
		t.Errorf("stream remotePort mismatch; got:\n%s", out)
	}
}

func TestBuildFRPConfig_APIProxy(t *testing.T) {
	out := tunnel.BuildFRPConfig(testConfig())
	if !strings.Contains(out, "localPort = 8080") {
		t.Errorf("api localPort mismatch; got:\n%s", out)
	}
	if !strings.Contains(out, "remotePort = 11936") {
		t.Errorf("api remotePort mismatch; got:\n%s", out)
	}
}

func TestBuildFRPConfig_NoHardcodedValues(t *testing.T) {
	cfg := testConfig()
	cfg.FRP.ServerAddr = "custom-server.example.com"
	cfg.FRP.AuthToken = "my-unique-token-xyz"
	out := tunnel.BuildFRPConfig(cfg)
	if !strings.Contains(out, "custom-server.example.com") {
		t.Error("serverAddr not taken from config struct")
	}
	if !strings.Contains(out, "my-unique-token-xyz") {
		t.Error("auth_token not taken from config struct")
	}
	if strings.Contains(out, "upstream.example.com") {
		t.Error("hardcoded server address found — values must come from config struct only")
	}
}
