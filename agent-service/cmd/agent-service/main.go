package main

import (
	"flag"
	"github.com/lyeka/rich4-renew-app/agent-service/internal/health"
	"log"
	"net/http"
	"time"
)

func main() {
	addr := flag.String("listen", "127.0.0.1:8080", "health endpoint address")
	flag.Parse()
	s := &http.Server{Addr: *addr, Handler: health.Handler(), ReadHeaderTimeout: 5 * time.Second}
	log.Printf("foundation service listening on %s; game transport is not implemented yet", *addr)
	log.Fatal(s.ListenAndServe())
}
