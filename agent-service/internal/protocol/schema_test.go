package protocol

import (
	"encoding/json"
	"github.com/santhosh-tekuri/jsonschema/v6"
	"os"
	"path/filepath"
	"testing"
)

// Both languages consume the exact same committed schema and wire fixtures.
func TestSharedWireFixtures(t *testing.T) {
	root := filepath.Join("..", "..", "..", "contracts")
	c := jsonschema.NewCompiler()
	c.AssertFormat()
	schema, err := c.Compile(filepath.Join(root, "schemas", "protocol.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	read := func(name string, v any) {
		t.Helper()
		b, e := os.ReadFile(filepath.Join(root, "examples", name))
		if e != nil {
			t.Fatal(e)
		}
		if e = json.Unmarshal(b, v); e != nil {
			t.Fatal(e)
		}
	}
	var valid []any
	read("valid.json", &valid)
	for i, v := range valid {
		if e := schema.Validate(v); e != nil {
			t.Errorf("valid[%d]: %v", i, e)
		}
	}
	var invalid []struct {
		Name    string
		Message any
	}
	read("invalid.json", &invalid)
	for _, v := range invalid {
		t.Run(v.Name, func(t *testing.T) {
			if schema.Validate(v.Message) == nil {
				t.Fatal("accepted invalid fixture")
			}
		})
	}
}
