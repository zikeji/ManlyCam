package camera_test

import (
	"strings"
	"testing"

	"github.com/zikeji/ManlyCam/apps/agent/internal/camera"
	"github.com/zikeji/ManlyCam/apps/agent/internal/config"
)

func TestBuildMTXConfig_RTSPPort(t *testing.T) {
	cfg := config.StreamConfig{RTSPPort: 8554, APIPort: 9997, Width: 1920, Height: 1080, Framerate: 30}
	out := camera.BuildMTXConfig(cfg)
	if !strings.Contains(out, ":8554") {
		t.Errorf("expected :8554 in config; got:\n%s", out)
	}
}

func TestBuildMTXConfig_APIAddress(t *testing.T) {
	cfg := config.StreamConfig{RTSPPort: 8554, APIPort: 9997, Width: 1920, Height: 1080, Framerate: 30}
	out := camera.BuildMTXConfig(cfg)
	if !strings.Contains(out, "api: yes") {
		t.Errorf("expected api: yes; got:\n%s", out)
	}
	if !strings.Contains(out, `apiAddress: "127.0.0.1:9997"`) {
		t.Errorf("expected apiAddress: \"127.0.0.1:9997\"; got:\n%s", out)
	}
}

func TestBuildMTXConfig_Dimensions(t *testing.T) {
	cfg := config.StreamConfig{RTSPPort: 8554, APIPort: 9997, Width: 2328, Height: 1748, Framerate: 30}
	out := camera.BuildMTXConfig(cfg)
	if !strings.Contains(out, "rpiCameraWidth: 2328") {
		t.Errorf("expected rpiCameraWidth: 2328; got:\n%s", out)
	}
	if !strings.Contains(out, "rpiCameraHeight: 1748") {
		t.Errorf("expected rpiCameraHeight: 1748; got:\n%s", out)
	}
	if !strings.Contains(out, "rpiCameraFPS: 30") {
		t.Errorf("expected rpiCameraFPS: 30; got:\n%s", out)
	}
}

func TestBuildMTXConfig_HFlipVFlip(t *testing.T) {
	cfg := config.StreamConfig{RTSPPort: 8554, APIPort: 9997, Width: 1920, Height: 1080, Framerate: 30, HFlip: true, VFlip: true}
	out := camera.BuildMTXConfig(cfg)
	if !strings.Contains(out, "rpiCameraHFlip: true") {
		t.Errorf("expected rpiCameraHFlip: true; got:\n%s", out)
	}
	if !strings.Contains(out, "rpiCameraVFlip: true") {
		t.Errorf("expected rpiCameraVFlip: true; got:\n%s", out)
	}
}

func TestBuildMTXConfig_NoFlip(t *testing.T) {
	cfg := config.StreamConfig{RTSPPort: 8554, APIPort: 9997, Width: 1920, Height: 1080, Framerate: 30}
	out := camera.BuildMTXConfig(cfg)
	if !strings.Contains(out, "rpiCameraHFlip: false") {
		t.Errorf("expected rpiCameraHFlip: false; got:\n%s", out)
	}
	if !strings.Contains(out, "rpiCameraVFlip: false") {
		t.Errorf("expected rpiCameraVFlip: false; got:\n%s", out)
	}
}

func TestBuildMTXConfig_TuningFile(t *testing.T) {
	cfg := config.StreamConfig{RTSPPort: 8554, APIPort: 9997, Width: 1920, Height: 1080, Framerate: 30,
		TuningFile: "/usr/share/libcamera/ipa/rpi/vc4/imx519.json"}
	out := camera.BuildMTXConfig(cfg)
	if !strings.Contains(out, "rpiCameraTuningFile: /usr/share/libcamera/ipa/rpi/vc4/imx519.json") {
		t.Errorf("expected rpiCameraTuningFile in config; got:\n%s", out)
	}
}

func TestBuildMTXConfig_NoTuningFile(t *testing.T) {
	cfg := config.StreamConfig{RTSPPort: 8554, APIPort: 9997, Width: 1920, Height: 1080, Framerate: 30}
	out := camera.BuildMTXConfig(cfg)
	if strings.Contains(out, "rpiCameraTuningFile") {
		t.Errorf("expected no rpiCameraTuningFile when not set; got:\n%s", out)
	}
}

func TestBuildMTXConfig_StreamPath(t *testing.T) {
	cfg := config.StreamConfig{RTSPPort: 8554, APIPort: 9997, Width: 1920, Height: 1080, Framerate: 30}
	out := camera.BuildMTXConfig(cfg)
	if !strings.Contains(out, "source: rpiCamera") {
		t.Errorf("expected source: rpiCamera; got:\n%s", out)
	}
}
