package health

import "net/http"

func Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","stage":"foundation","protocol":"1.0","gameConnection":false}`))
	})
	return mux
}
