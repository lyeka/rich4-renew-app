# 阶段 1 验收记录

日期：2026-11-09。结论：**工程基础与协议阶段已完成，可以进入阶段 2 的共享宿主开发。** 当前不是可游玩的 Agent 版本。

## 交付与验收对应

| Roadmap 要求 | 已交付 |
|---|---|
| 工程结构 | `agent-service/`、`contracts/`、`eval/`，根目录 Makefile，锁定依赖与启动文档 |
| 全部决策盘点 | [决策清单](../contracts/decision-catalog.json)：26 类，包含 Ask 声明之外的赌场三阶段和歌舞伎町三个入口；AST 检查清单与源码同步 |
| 人类信息权限 | [可见性规范](../contracts/visibility.md)：明确当前查询页对手卡片/道具公开、赌场暗牌与 RNG 不公开；列出时机、视野和小游戏控制约束 |
| 两端消息契约 | [JSON Schema](../contracts/schemas/protocol.schema.json)：19 种消息，快照、可见事件、分页查询、动作描述、回答、持续输入、回执、取消及恢复 |
| 生命周期 | [协议说明](../contracts/README.md)：decision/operation、消费与效果、同 epoch 去重、事件顺序、历史缺口、超时仲裁、新 epoch 失效 |
| 典型交互 | 47 个合法消息、10 个非法消息、8 组顺序交互；包含多步、实时、重复提交、丢失回执/操作结果恢复、迟到回答及模型失败 |
| ADK 与模型入口 | ADK Go v2.7.1、Go 1.27.3；官方 openaimodel 的 Responses/Chat Completions 适配；OpenAI/OpenRouter/DeepSeek 配置隔离、离线 HTTP 测试、显式 modelcheck |
| 可运行地图 | [Agent Lab](../eval/fixtures/maps/agent-lab.json)：纯 Board JSON；真实 Game 启动到真人 Ask，录制购买/升级输入，验证现金、产权、等级和事件 |
| 服务可启动 | `cmd/agent-service` 暴露 /healthz；明确报告 foundation 和 gameConnection=false |

## 实际验证

执行根目录 `make stage1 GO=/tmp/rich4-agent-toolchain/go/bin/go`，使用 Node 22.20.0 和独立 Go 1.27.3 工具链，未替换机器原有 Go 1.19。

- 契约与生命周期：**29 项通过，0 跳过**。
- Go：全部包编译，health、modelconfig、protocol 三个测试包通过；共享协议夹具在 Go 中重新验证，`-count=1` 避免模块外文件被测试缓存掩盖。
- 无素材核心地图：**2 项通过，0 跳过**。
- 游戏 TypeScript：`tsc --noEmit` 通过。
- 实际启动服务并请求 `/healthz`：HTTP 200，返回 `{"status":"ok","stage":"foundation","protocol":"1.0","gameConnection":false}`；验证后已停止测试进程。

本次未调用付费模型。两种 API 的工具调用/结果回传由本地 HTTP fixture 验证；选定真实模型后运行 [modelcheck](../agent-service/README.md) 确认线上兼容性。未声称完成所有既有素材地图或完整对局回归。

## 阶段 2/3 的明确边界

1. 当前 Schema 只证明结构可表达，输入辅助校验只检查契约，不证明信息投影或业务资格已经正确实现。下一阶段从 UI 和核心规则抽取共享投影、视野、动作资格，禁止直接发送原始 Ask/Game。
2. 无界面地图测试证明真实核心能在无 DOM/素材环境暂停并消费录制回答；尚不证明动画关闭、小游戏时钟、各地图的浏览器/无界面一致性。小游戏输入与结果计算移入共享宿主后再按同源同时间输入验收。
3. 生命周期顺序样例是可执行的契约检查。生产连接绑定、去重账本、原子消费、恢复和超时竞争在阶段 2/3 实现，并做故障注入验证；不能把样例当成运行时去重实现。
4. 服务当前只提供基础启动和模型适配测试，没有 WebSocket、Runner/Session、游戏工具或策略。后续沿用本阶段的协议实现，不通过内置电脑策略补齐缺口。
