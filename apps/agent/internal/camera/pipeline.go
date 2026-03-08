// Package camera manages the Raspberry Pi camera capture pipeline.
package camera

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"strconv"

	"github.com/zikeji/ManlyCam/apps/agent/internal/config"
)

// BuildArgs constructs the rpicam-vid argument list from the given stream config.
// It is a pure function with no side effects — testable without hardware.
//
// Constructed command format:
//
//	rpicam-vid -t 0 --width <w> --height <h> --framerate <fps>
//	  --codec <codec> [--hflip] [--vflip] --inline --listen
//	  -o tcp://0.0.0.0:<output_port>
func BuildArgs(cfg config.StreamConfig) []string {
	args := []string{
		"rpicam-vid", "-t", "0",
		"--width", strconv.Itoa(cfg.Width),
		"--height", strconv.Itoa(cfg.Height),
		"--framerate", strconv.Itoa(cfg.Framerate),
		"--codec", cfg.Codec,
	}
	if cfg.HFlip {
		args = append(args, "--hflip")
	}
	if cfg.VFlip {
		args = append(args, "--vflip")
	}
	args = append(args, "--inline", "--listen", "-o",
		fmt.Sprintf("tcp://0.0.0.0:%d", cfg.OutputPort))
	return args
}

// Pipeline manages the rpicam-vid subprocess lifecycle.
type Pipeline struct{}

// Start launches rpicam-vid and supervises it. On crash it restarts immediately
// (no backoff — camera hardware is always locally available). On context
// cancellation it stops the subprocess and returns ctx.Err().
func (p *Pipeline) Start(ctx context.Context, cfg config.StreamConfig) error {
	for {
		args := BuildArgs(cfg)
		cmd := exec.CommandContext(ctx, args[0], args[1:]...)
		if err := cmd.Run(); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			// Camera hardware is local — restart immediately without backoff.
			log.Printf("camera pipeline crashed: %v; restarting", err)
			continue
		}
		// rpicam-vid exited cleanly (unexpected) — restart.
		if ctx.Err() != nil {
			return ctx.Err()
		}
		log.Printf("camera pipeline exited cleanly; restarting")
	}
}
