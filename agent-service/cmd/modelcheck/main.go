// modelcheck is explicitly opt-in: running without --live does not call a provider.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"github.com/lyeka/rich4-renew-app/agent-service/internal/modelconfig"
	"os"
	"time"
)

func main() {
	live := flag.Bool("live", false, "send a bounded two-request probe to the configured provider (billable)")
	flag.Parse()
	if !*live {
		fmt.Fprintln(os.Stderr, "Use --live with AGENT_PROVIDER, AGENT_MODEL and the provider API key; offline checks: go test ./...")
		os.Exit(2)
	}
	c, err := modelconfig.FromEnv()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	llm, err := modelconfig.New(ctx, c)
	if err != nil {
		fmt.Fprintln(os.Stderr, "model initialization failed")
		os.Exit(1)
	}
	result, err := modelconfig.Probe(ctx, llm)
	if err != nil {
		fmt.Fprintln(os.Stderr, "model compatibility probe failed; check provider/model/tool support and network (provider response omitted)")
		os.Exit(1)
	}
	if err = json.NewEncoder(os.Stdout).Encode(result); err != nil {
		os.Exit(1)
	}
}
