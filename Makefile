GO ?= go
NPM ?= npm

.PHONY: setup-agent stage1 contracts-check agent-check fixture-check agent-run model-check

setup-agent:
	$(NPM) ci --prefix contracts
	$(NPM) ci --prefix game
	cd agent-service && $(GO) mod download

stage1: contracts-check agent-check fixture-check

contracts-check:
	$(NPM) test --prefix contracts

agent-check:
	cd agent-service && $(GO) test -count=1 ./...

fixture-check:
	$(NPM) test --prefix game -- src/core/agent-fixture.test.ts
	cd game && ./node_modules/.bin/tsc --noEmit

agent-run:
	cd agent-service && $(GO) run ./cmd/agent-service

# Explicitly billable; offline stage1 never invokes this target.
model-check:
	cd agent-service && $(GO) run ./cmd/modelcheck --live
