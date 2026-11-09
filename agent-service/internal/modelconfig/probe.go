package modelconfig

import (
	"context"
	"fmt"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

type ProbeResult struct {
	Model       string `json:"model"`
	ToolCalls   int    `json:"toolCalls"`
	Requests    int    `json:"requests"`
	TotalTokens int32  `json:"totalTokens"`
}

// Probe exercises the ADK model interface, tool-call decoding and tool-result round trip.
// It is a compatibility check, not the production Runner or a game strategy.
func Probe(ctx context.Context, llm model.LLM) (ProbeResult, error) {
	out := ProbeResult{Model: llm.Name()}
	req := &model.LLMRequest{Model: llm.Name(), Contents: []*genai.Content{genai.NewContentFromText("Call protocol_echo with value ping once, then report its result. Do not invent a tool result.", genai.RoleUser)}, Config: &genai.GenerateContentConfig{
		MaxOutputTokens: 256,
		Tools:           []*genai.Tool{{FunctionDeclarations: []*genai.FunctionDeclaration{{Name: "protocol_echo", Description: "Returns a value to check tool transport", Parameters: &genai.Schema{Type: genai.TypeObject, Properties: map[string]*genai.Schema{"value": {Type: genai.TypeString}}, Required: []string{"value"}}}}}},
	}}
	for round := 0; round < 2; round++ {
		out.Requests++
		var content *genai.Content
		for response, err := range llm.GenerateContent(ctx, req, false) {
			if err != nil {
				return out, err
			}
			if response == nil {
				continue
			}
			if response.ErrorCode != "" {
				return out, fmt.Errorf("model failure: %s", response.ErrorCode)
			}
			if response.UsageMetadata != nil {
				out.TotalTokens += response.UsageMetadata.TotalTokenCount
			}
			if response.Content != nil {
				content = response.Content
			}
		}
		if content == nil {
			return out, fmt.Errorf("missing response content")
		}
		if round == 0 {
			var call *genai.FunctionCall
			for _, part := range content.Parts {
				if part.FunctionCall != nil {
					if call != nil {
						return out, fmt.Errorf("expected one tool call")
					}
					call = part.FunctionCall
				}
			}
			if call == nil || call.Name != "protocol_echo" || len(call.Args) != 1 || call.Args["value"] != "ping" {
				return out, fmt.Errorf("expected protocol_echo(value=ping)")
			}
			out.ToolCalls++
			req.Contents = append(req.Contents, content, &genai.Content{Role: "user", Parts: []*genai.Part{{FunctionResponse: &genai.FunctionResponse{ID: call.ID, Name: call.Name, Response: map[string]any{"value": "ping", "status": "ok"}}}}})
		} else {
			hasText := false
			for _, part := range content.Parts {
				if part.FunctionCall != nil {
					return out, fmt.Errorf("unexpected second tool call")
				}
				if part.Text != "" {
					hasText = true
				}
			}
			if !hasText {
				return out, fmt.Errorf("missing final text")
			}
		}
	}
	return out, nil
}
