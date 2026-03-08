package cmd

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"
	"github.com/zikeji/ManlyCam/apps/agent/internal/camera"
	"github.com/zikeji/ManlyCam/apps/agent/internal/config"
	"github.com/zikeji/ManlyCam/apps/agent/internal/tunnel"
)

var configPath string

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the ManlyCam agent — camera pipeline and frp tunnels",
	RunE:  runStart,
}

func init() {
	startCmd.Flags().StringVar(&configPath, "config", "/etc/manlycam/config.toml", "path to config.toml")
	rootCmd.AddCommand(startCmd)
}

func runStart(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load(configPath)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	errCh := make(chan error, 2)

	log.Printf("starting ManlyCam agent (server=%s:%d)", cfg.FRP.ServerAddr, cfg.FRP.ServerPort)

	go func() {
		p := &camera.Pipeline{}
		errCh <- p.Start(ctx, cfg.Stream)
	}()
	go func() {
		t := &tunnel.Tunnel{}
		errCh <- t.Start(ctx, *cfg)
	}()

	select {
	case sig := <-sigCh:
		log.Printf("received signal %v — shutting down", sig)
		cancel()
	case err := <-errCh:
		if err != nil {
			log.Printf("fatal error: %v", err)
			cancel()
		}
	}

	// Wait for both goroutines to finish (with 5s timeout to prevent hang)
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
shutdown:
	for i := 0; i < 2; i++ {
		select {
		case <-errCh:
		case <-shutdownCtx.Done():
			log.Printf("shutdown timeout — forced exit")
			break shutdown
		}
	}
	log.Printf("ManlyCam agent stopped")
	return nil
}
