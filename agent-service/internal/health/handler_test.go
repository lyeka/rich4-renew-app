package health

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	w := httptest.NewRecorder()
	Handler().ServeHTTP(w, httptest.NewRequest("GET", "/healthz", nil))
	var body struct {
		Status         string
		Stage          string
		GameConnection bool
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || body.Status != "ok" || body.Stage != "foundation" || body.GameConnection {
		t.Fatalf("unexpected health: %s", w.Body.String())
	}
	w = httptest.NewRecorder()
	Handler().ServeHTTP(w, httptest.NewRequest("GET", "/ws", nil))
	if w.Code != 404 {
		t.Fatal("must not advertise an unimplemented game connection")
	}
}
