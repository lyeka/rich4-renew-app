// Package modelconfig isolates provider configuration from the game and agent loop.
package modelconfig

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/openai/openai-go/v3/option"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/openaimodel"
)

type Config struct {
	Provider string
	Model    string
	BaseURL  string
	APIKey   string
	API      openaimodel.API
}

// FromEnv never falls through to another provider's key or OpenAI's ambient base URL.
func FromEnv() (Config, error) {
	c := Config{Provider: os.Getenv("AGENT_PROVIDER"), Model: os.Getenv("AGENT_MODEL")}
	var key string
	switch c.Provider {
	case "openai":
		c.BaseURL = "https://api.openai.com/v1/"
		c.API = openaimodel.APIResponses
		key = "OPENAI_API_KEY"
	case "openrouter":
		c.BaseURL = "https://openrouter.ai/api/v1/"
		c.API = openaimodel.APIChatCompletions
		key = "OPENROUTER_API_KEY"
	case "deepseek":
		c.BaseURL = "https://api.deepseek.com/v1/"
		c.API = openaimodel.APIChatCompletions
		key = "DEEPSEEK_API_KEY"
	default:
		return c, fmt.Errorf("AGENT_PROVIDER must be openai, openrouter or deepseek")
	}
	c.APIKey = os.Getenv(key)
	if v := os.Getenv("AGENT_BASE_URL"); v != "" {
		c.BaseURL = v
	}
	if v := os.Getenv("AGENT_API"); v != "" {
		c.API = openaimodel.API(v)
	}
	return c, c.Validate()
}
func (c Config) Validate() error {
	if c.Model == "" || c.APIKey == "" {
		return fmt.Errorf("explicit model and provider API key are required")
	}
	if c.API != openaimodel.APIResponses && c.API != openaimodel.APIChatCompletions {
		return fmt.Errorf("unsupported API %q", c.API)
	}
	u, err := url.Parse(c.BaseURL)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("invalid base URL")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1")) {
		return fmt.Errorf("base URL must be HTTPS or loopback HTTP")
	}
	return nil
}
func New(ctx context.Context, c Config) (model.LLM, error) {
	if err := c.Validate(); err != nil {
		return nil, err
	}
	return openaimodel.NewModel(ctx, c.Model, &openaimodel.ClientConfig{
		APIKey: c.APIKey, BaseURL: c.BaseURL, API: c.API, HTTPClient: &http.Client{Timeout: 30 * time.Second},
		Options: []option.RequestOption{option.WithMaxRetries(0)}, // Runtime owns retry budget, not nested SDK retries.
	})
}
