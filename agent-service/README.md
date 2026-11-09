# Agent 服务基础

阶段 1：可启动的健康检查、固定的 ADK 模型适配入口和离线兼容性测试。WebSocket、ADK Runner/Session、游戏工具及上下文管理按 Roadmap 后续阶段实现，当前服务还不能玩游戏。

## 依赖与运行

- `google.golang.org/adk/v2 v2.7.1`，锁定在 go.mod/go.sum；直接使用该版本的 `model.LLM` 和官方 `model/openaimodel`。
- ADK 最低要求 Go **1.26.10**，项目工具链 **1.27.3**。旧 Go 1.19 无法构建，需要安装新工具链；不会修改系统 Go。
- Node **22.12+**（游戏 Vite 依赖要求），npm lockfile 保证契约工具版本可重现。

从仓库根运行：

```sh
make setup-agent
make stage1
make agent-run
# 另一个终端
curl http://127.0.0.1:8080/healthz
```

有多版本 Go 时使用 `make stage1 GO=/absolute/path/to/go`。健康响应明确包含 `stage=foundation, gameConnection=false`；`/ws` 返回 404，不伪装连接已经可用。

## 模型配置与检查

| AGENT_PROVIDER | 默认地址 | 默认 AGENT_API | 密钥变量 |
|---|---|---|---|
| openai | https://api.openai.com/v1/ | responses | OPENAI_API_KEY |
| openrouter | https://openrouter.ai/api/v1/ | chat_completions | OPENROUTER_API_KEY |
| deepseek | https://api.deepseek.com/v1/ | chat_completions | DEEPSEEK_API_KEY |

必须显式设置 `AGENT_MODEL`，不把某个会变更的线上模型名固化进代码。可选 `AGENT_BASE_URL` 和 `AGENT_API` 覆盖默认地址/API；非本机地址只允许 HTTPS。三个 provider 不交叉借用密钥，忽略 SDK 环境中的 OPENAI_BASE_URL，避免将其他服务密钥发到错误地址。环境变量由进程读取，不自动加载 `.env`。

```sh
export AGENT_PROVIDER=openrouter
export AGENT_MODEL='<所选且支持工具调用的模型 ID>'
# 在当前终端安全设置 OPENROUTER_API_KEY
make model-check
```

此命令会付费调用配置的服务，最多两轮非流式请求、每轮 256 输出 token，单请求 30 秒、总计 60 秒。检查一次 `protocol_echo(value=ping)` → FunctionResponse → 最终文本的往返；验证工具名和参数，不接受伪造工具结果。SDK 内置重试关闭，后续统一由 Agent runtime 管理预算。输出模型名、请求数、工具调用数、供应商报告的 token 总数；失败日志不打印密钥/原始供应商响应。

契约夹具位于 Go 模块目录之外，因此验收使用 `-count=1`，确保 Schema/夹具变化不会被 Go 测试缓存掩盖。

离线 `go test -count=1 ./...` 使用 httptest 模拟两种 HTTP API，检查工具声明、调用 ID/结果回传、用量映射及 429 不自动重试，同时检查三家配置和密钥隔离。它验证适配代码，不等同于这些服务的所有模型都支持工具；没有配置密钥时不执行付费检查。

本阶段采用非流式请求降低接入面。流式工具参数分片、推理模型特殊参数、并行工具、断连取消以及真实模型兼容性矩阵在阶段 4 按所选模型验证；不能凭“兼容 OpenAI”宣称全部支持。Agent 的计划、工具权限、上下文预算与压缩仍由项目实现，不由这个适配器代替。

源码依据：[ADK v2.7.1](https://github.com/google/adk-go/tree/v2.7.1)、[openaimodel](https://github.com/google/adk-go/tree/v2.7.1/model/openaimodel)。以锁定模块中实际导出的接口为准。
