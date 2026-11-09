package modelconfig

import (
	"context"
	"encoding/json"
	"fmt"
	"google.golang.org/adk/v2/model/openaimodel"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProviderIsolation(t *testing.T) {
	t.Setenv("AGENT_MODEL", "explicit-model")
	t.Setenv("OPENAI_API_KEY", "openai-secret")
	t.Setenv("OPENAI_BASE_URL", "https://wrong.invalid/")
	t.Setenv("AGENT_BASE_URL", "")
	t.Setenv("AGENT_API", "")
	for _, provider := range []string{"openai", "openrouter", "deepseek"} {
		t.Run(provider, func(t *testing.T) {
			t.Setenv("AGENT_PROVIDER", provider)
			key := strings.ToUpper(provider) + "_API_KEY"
			t.Setenv(key, "provider-key")
			c, err := FromEnv()
			if err != nil {
				t.Fatal(err)
			}
			if c.APIKey != "provider-key" || strings.Contains(c.BaseURL, "wrong.invalid") {
				t.Fatal("provider config contamination")
			}
			want := openaimodel.APIChatCompletions
			if provider == "openai" {
				want = openaimodel.APIResponses
			}
			if c.API != want {
				t.Fatal("wrong API")
			}
			t.Setenv(key, "")
			if _, err = FromEnv(); err == nil {
				t.Fatal("missing provider key accepted")
			}
		})
	}
}
func TestToolRoundTrip(t *testing.T) {
	for _, api := range []openaimodel.API{openaimodel.APIResponses, openaimodel.APIChatCompletions} {
		t.Run(string(api), func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				w.Header().Set("Content-Type", "application/json")
				if r.Header.Get("Authorization") != "Bearer fixture-key" {
					t.Error("wrong key")
				}
				path := "/v1/chat/completions"
				if api == openaimodel.APIResponses {
					path = "/v1/responses"
				}
				if r.URL.Path != path {
					t.Errorf("wrong path: %s", r.URL.Path)
				}
				b, _ := io.ReadAll(r.Body)
				var req map[string]any
				if err := json.Unmarshal(b, &req); err != nil {
					t.Error(err)
				}
				if req["model"] != "fixture-model" || !strings.Contains(string(b), "protocol_echo") {
					t.Error("model/tool declaration missing")
				}
				if calls == 2 {
					marker := "tool_call_id"
					if api == openaimodel.APIResponses {
						marker = "function_call_output"
					}
					if !strings.Contains(string(b), marker) || !strings.Contains(string(b), "call_1") || !strings.Contains(string(b), "ping") {
						t.Errorf("tool result lost: %s", b)
					}
				}
				if api == openaimodel.APIChatCompletions {
					if calls == 1 {
						fmt.Fprint(w, `{"id":"c1","object":"chat.completion","model":"fixture-model","choices":[{"index":0,"finish_reason":"tool_calls","message":{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"protocol_echo","arguments":"{\"value\":\"ping\"}"}}]}}],"usage":{"prompt_tokens":5,"completion_tokens":5,"total_tokens":10}}`)
					} else {
						fmt.Fprint(w, `{"id":"c2","object":"chat.completion","model":"fixture-model","choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"ping"}}],"usage":{"prompt_tokens":5,"completion_tokens":5,"total_tokens":10}}`)
					}
				} else {
					if calls == 1 {
						fmt.Fprint(w, `{"id":"r1","object":"response","status":"completed","model":"fixture-model","output":[{"type":"function_call","id":"fc_1","call_id":"call_1","name":"protocol_echo","arguments":"{\"value\":\"ping\"}"}],"usage":{"input_tokens":5,"output_tokens":5,"total_tokens":10}}`)
					} else {
						fmt.Fprint(w, `{"id":"r2","object":"response","status":"completed","model":"fixture-model","output":[{"type":"message","id":"m2","role":"assistant","status":"completed","content":[{"type":"output_text","text":"ping","annotations":[]}]}],"usage":{"input_tokens":5,"output_tokens":5,"total_tokens":10}}`)
					}
				}
			}))
			defer server.Close()
			llm, err := New(context.Background(), Config{Model: "fixture-model", APIKey: "fixture-key", BaseURL: server.URL + "/v1/", API: api})
			if err != nil {
				t.Fatal(err)
			}
			result, err := Probe(context.Background(), llm)
			if err != nil {
				t.Fatal(err)
			}
			if calls != 2 || result.ToolCalls != 1 || result.TotalTokens != 20 {
				t.Fatalf("bad round trip: %+v calls=%d", result, calls)
			}
		})
	}
}
func TestProviderErrorHasNoHiddenRetries(t *testing.T) {
	calls := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(429)
		fmt.Fprint(w, `{"error":{"message":"rate limited","type":"rate_limit_error"}}`)
	}))
	defer s.Close()
	llm, err := New(context.Background(), Config{Model: "fixture", APIKey: "fixture", BaseURL: s.URL + "/v1/", API: openaimodel.APIChatCompletions})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Probe(context.Background(), llm); err == nil || calls != 1 {
		t.Fatalf("error=%v calls=%d", err, calls)
	}
}
