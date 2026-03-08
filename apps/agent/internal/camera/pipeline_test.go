package camera_test

import (
	"testing"

	"github.com/zikeji/ManlyCam/apps/agent/internal/camera"
	"github.com/zikeji/ManlyCam/apps/agent/internal/config"
)

func TestBuildArgs_HFlipVFlip(t *testing.T) {
	cfg := config.StreamConfig{
		Width: 1920, Height: 1080, Framerate: 30, Codec: "h264",
		HFlip: true, VFlip: true, OutputPort: 5000,
	}
	args := camera.BuildArgs(cfg)
	if !contains(args, "--hflip") {
		t.Error("expected --hflip in args when hflip=true")
	}
	if !contains(args, "--vflip") {
		t.Error("expected --vflip in args when vflip=true")
	}
}

func TestBuildArgs_NoFlip(t *testing.T) {
	cfg := config.StreamConfig{
		Width: 1920, Height: 1080, Framerate: 30, Codec: "h264",
		HFlip: false, VFlip: false, OutputPort: 5000,
	}
	args := camera.BuildArgs(cfg)
	if contains(args, "--hflip") {
		t.Error("expected --hflip NOT in args when hflip=false")
	}
	if contains(args, "--vflip") {
		t.Error("expected --vflip NOT in args when vflip=false")
	}
}

func TestBuildArgs_OutputAndCodec(t *testing.T) {
	cfg := config.StreamConfig{
		Width: 640, Height: 480, Framerate: 15, Codec: "mjpeg",
		OutputPort: 5000,
	}
	args := camera.BuildArgs(cfg)
	if !containsPair(args, "-o", "tcp://0.0.0.0:5000") {
		t.Errorf("expected -o tcp://0.0.0.0:5000 in args; got %v", args)
	}
	if !containsPair(args, "--codec", "mjpeg") {
		t.Errorf("expected --codec mjpeg in args; got %v", args)
	}
}

func TestBuildArgs_Dimensions(t *testing.T) {
	cfg := config.StreamConfig{
		Width: 2328, Height: 1748, Framerate: 30, Codec: "h264",
		OutputPort: 5000,
	}
	args := camera.BuildArgs(cfg)
	if !containsPair(args, "--width", "2328") {
		t.Errorf("expected --width 2328 in args; got %v", args)
	}
	if !containsPair(args, "--height", "1748") {
		t.Errorf("expected --height 1748 in args; got %v", args)
	}
	if !containsPair(args, "--framerate", "30") {
		t.Errorf("expected --framerate 30 in args; got %v", args)
	}
}

func contains(args []string, s string) bool {
	for _, a := range args {
		if a == s {
			return true
		}
	}
	return false
}

func containsPair(args []string, key, val string) bool {
	for i := 0; i < len(args)-1; i++ {
		if args[i] == key && args[i+1] == val {
			return true
		}
	}
	return false
}
