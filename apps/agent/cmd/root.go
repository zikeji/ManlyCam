package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "manlycam-agent",
	Short: "ManlyCam agent — runs on Raspberry Pi to stream camera and manage the frp tunnel",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
