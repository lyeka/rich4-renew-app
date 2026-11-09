# 玩家—Agent 协议 1.0

阶段 1 契约。JSON Schema 和共享夹具可执行；本目录没有实现游戏宿主、WebSocket、认证或生产去重存储。阶段 2 实现玩家接口，阶段 3 实现这里规定的传输和状态机。协议面向 **TS 宿主 ↔ Go 服务**，不是把网络消息直接作为模型工具。

## 文件和验证

- `decision-catalog.json`：26 类决策；包含 20 个声明类型，以及运行时 `casino` 三阶段、`kb-machine`、`kb-exchange`、`kb-dice-keep`。每项有源码路径、输入范围和信息约束。
- `scripts/inventory.mjs`：用 TypeScript AST 扫描当前核心中的 `ask({...})`（含 `as never`）；遇到不能识别的动态表达式直接报错。新增封装、别名或非 `ask` 决策入口时必须扩展此扫描器，不能仅依赖自动盘点。
- `scripts/generate-schema.mjs` → `schemas/protocol.schema.json`：唯一 Schema 源；JSON Schema Draft 2020-12。修改后运行 `npm run generate`，检查提交产物未漂移。
- `examples/valid.json` / `invalid.json`：**彼此独立**的消息样例，不是顺序执行记录；TS 和 Go 读取相同文件验证。更新样例用 `node scripts/generate-examples.mjs`。
- `examples/lifecycle.json`：普通、多步、持续控制、重复提交与恢复的顺序样例。
- `src/validate.mjs`：结构验证，以及动作参数、绑定、视图和事件游标的基础语义检查。**不替代宿主的业务规则和信息投影。**
- `visibility.md`：各信息来源的投影与禁止泄漏清单。

本阶段的动作示例用于展示参数形状，不是全部游戏工具实现；实际 action 集合、选项和参数范围必须由阶段 2 的共享规则实时产生。不得给模型通用 `eval`、原始 Game、存档或自由调用引擎函数。

## 身份与版本

每条消息携带 `version, messageId, gameId, epochId, seatId, sentAt, type, payload`，拒绝额外字段；数字 ID 和游标限制在 JS 安全整数范围内。单条 UTF-8 消息上限 **1 MiB**，传输层在 JSON 解码前限制大小；超限数据分页，禁止截断工具结果冒充完整结果。

连接只能绑定一个 `(gameId, epochId, seatId)`。绑定由宿主发起连接时的受信启动配置/会话凭证建立，**不能信任任意客户端自报的 seatId**；`host.hello` 不是认证机制。默认本机运行，远程部署须鉴权和 TLS。模型不提供这些绑定字段，由工具包装器注入。回答者取 `Ask.p`，不是 `Game.current`，以支持对手回合里的免责、嫁祸、拍卖等响应。

`host.hello → agent.ready` 协商精确版本和能力。当前仅接受 `1.0`，严格 Schema 下任何形状变化都要新版本及双方兼容测试；不静默猜测。缺少 continuous 能力时拒绝进入需要该能力的对局，而不是自动切换电脑玩家。administrative 是控制平面，模型工具不暴露座位接管和托管开关。

`hostInstanceId` 标识进程；加载存档、换宿主、重置对局必须产生新 `epochId`。重连同一仍存活宿主可以保持 epoch。同局同座位的 Session 可以保留，但历史摘要/计划要标记旧 epoch，不得把被撤销未来的信息带入新运行。

## 决策、操作和控制

- 一个引擎待回答问题对应 `decisionId`；实际 Ask 消费一次。一次卡片/道具/交易流程对应 `operationId`；子问题各用新 decisionId，通过 `parentDecisionId` 关联，不把中间选择当成业务完成。
- `revision` 是不透明的合法输入版本。允许动作、参数范围、资格变化时必须换 revision。只是更新可见动态画面时可以保留 revision。
- `snapshot.observedAt` 表示宿主观察时刻。`viewId` 表示交互坐标系/目标有效性版本，**不是每个动画帧编号**：相机、目标集合、交互布局变化时更新；轮盘继续转动不更新，避免网络耗时使所有停止输入失效。
- `actions` 是当前合法操作描述。`channel=answer` 用 `action.submit`，`channel=control` 用 `control.input`。普通决策也可声明非终结的视角控制；仅当真人 UI 允许移动时存在该动作。连续交互只接受 control；最终旧式 Answer 由宿主算出。
- `actionId` 和参数选项只在当前 decision/revision 内有效。禁止客户端自行拼引擎下标。取消是独立合法动作，宿主再映射旧式 `0/-1/undefined`，避免 0 金额与取消混淆。
- action 参数是标量或整数列表，支持范围、步长和选项集合。复杂选择分解成多个动作/子决策，不能通过自由 JSON 绕开限制。货架索引、合法目标、现有 UI 限制和跨参数约束仍由宿主二次校验。

普通决策 `clock=paused` 表示逻辑在 Ask 处等待，不影响网络重试计时。实时交互 `clock=realtime`，模型耗时、网络耗时计入运行时间；`deadlineAt` 是宿主的截止时刻，null 表示没有截止，不代表停止时间。普通带截止的询问也可以 paused + deadline：到期由宿主执行原有超时规则，不能由代理自行补策略。

## 消息和方向

| 消息 | 方向 | 含义 |
|---|---|---|
| host.hello / agent.ready | 宿主 → 服务 / 服务 → 宿主 | 绑定后协商协议与能力 |
| decision.open / update | 宿主 → 服务 | 新决策；刷新完整视图、动作及增量事件 |
| query.request / result | 服务 → 宿主 / 宿主 → 服务 | observation/entity/rules/events/legal_actions 只读查询 |
| action.submit / result | 服务 → 宿主 / 宿主 → 服务 | 一次性回答及 consumed/rejected 回执 |
| control.input / result | 服务 → 宿主 / 宿主 → 服务 | 非终结控制及 applied/rejected 回执 |
| decision.closed | 宿主 → 服务 | answered/finished/cancelled/timed_out/aborted，停止该决策的模型运行 |
| operation.result | 宿主 → 服务 | completed/blocked/cancelled/failed，业务操作结论 |
| decision.cancel | 宿主 → 服务 | 宿主撤销旧决策；随后 closed，不能再接受输入 |
| run.failed | 服务 → 宿主 | 模型/工具预算或服务失败，**不等于合法游戏输入** |
| events.batch / ack | 宿主 → 服务 / 服务 → 宿主 | 可见事件增量及持久接收游标 |
| sync.request / result | 服务 → 宿主 / 宿主 → 服务 | 恢复当前决策、事件、未确认请求回执及操作状态 |
| protocol.error | 双向 | 非业务响应；不得因错误推进引擎 |

query 的 `resourceId` 用于 entity/rules 的单项查询，null 表示列出当前可见集合；`afterCursor` 只用于 events，其余填 null。非事件集合用 `pageToken / nextPageToken` 分页，token 绑定座位、decision、revision 和查询条件；条件失效时拒绝并重新查询，不跨版本拼接目标列表。宿主按绑定座位检查目标存在且可见；不可见与不存在统一 not_found，避免探测隐藏对象。读取不得抽随机数、推进时钟或改变游戏状态。query.result 为固定容器，未请求部分置 null/空数组；实体和规则通过白名单 entity 字段表达。snapshot 是有限的当前交互视图，不是完整世界副本；大地图、规则集合和目标候选通过分页查询获得。大量可选目标用一个带 targetId 参数的动作和分页目标实体表达，不能突破 Schema 数组上限或静默截断候选。

## 状态与成功条件

| 当前状态 | 输入/事件 | 必须发生 |
|---|---|---|
| 无待决策 | decision.open | 进入 open；同一座位只运行一个决策 |
| open | 合法 action.submit | 宿主原子校验并消费一次 Answer，记录 consumed；closed(answered) |
| open | 合法 control.input | 宿主记录接收时刻并执行输入，返回 applied；通常继续 open |
| open | 不合法/过期输入 | rejected，不推进引擎，允许重新观察后修正 |
| open | deadline / 游戏交互自然结束 | 宿主仲裁，closed(timed_out/finished)，后续输入失效 |
| open | decision.cancel | 立即撤销资格，closed(cancelled)，停止模型和未发出的工具 |
| open | run.failed / 断线 | 按预算恢复；原有超时规则继续，没有默认规则则暂停 |
| closed | 相同请求重发 | 查回执账本，返回原结果，不执行第二次 |
| closed | 新请求 | stale_decision；即使业务操作还未结束，也不能复用旧 decisionId |

`consumed` 仅证明一次 Answer 已交给引擎，`applied` 仅证明一次控制已应用。购买前可能还有投资封锁、多步选目标也可能取消；必须等 `operation.result` 和可见业务事件确认最终效果，不能把 tool 的网络成功当成买地成功。最终拒绝/取消同样要给操作结论，避免服务一直等待。

顺序：校验/写回执 → result → closed（若终结）→ 后继 decision.open 或 operation.result。宿主单线程仲裁回答、截止、取消；同连接按写入顺序发送。事件可重复嵌入不同消息，服务按序号去重。事件闭包、回执和实际执行原子性在阶段 2/3 实现并故障注入测试，本目录没有声称实现了事务存储。

## 去重、重连与不确定结果

去重键 `(gameId, epochId, seatId, requestId)`，不是 messageId。命令内容比较 `type + decisionId + revision + actionId + arguments + observedViewId(若有)` 的规范化值，JSON 键顺序无关；相同键不同内容返回 request_conflict。传输重试沿用 requestId，语义修正必须新 requestId。查询另用独立 requestId，不改变状态。

同一 epoch 的操作回执必须保留到该局结束；内存压力不得静默驱逐后重新执行。查账本要先于“当前决策已关闭”的检查。重复拒绝也重放原回执；控制输入同样去重，以免双次按键/购买。服务断线时不假设请求未执行，先 sync 查询。

`sync.result.receipts` 必须与 pendingRequestIds 一一对应，status：consumed/applied/rejected 表示已知结果，not_seen 表示此存活宿主完整账本中未见，unknown 表示无法判定（不能自动重发）。not_seen 也需确认原决策仍有效才可重发。主机崩溃或读档产生新 epoch，旧输入一律无效；本协议**不承诺跨崩溃 exactly-once**。无持久结果而宿主状态可能已变时暂停核实，不能猜测成功或失败。

`pendingOperationIds` 单独查询未确认的业务操作，sync.result.operations 必须逐项给出 in_progress/completed/blocked/cancelled/failed/unknown 和摘要；操作终态与输入回执一样保留到该 epoch 结束。这样即使 operation.result 丢失，也能区分“选择已消费”和“业务效果已完成”。unknown 不能推断为完成，也不能据此重放旧输入。

`sync.result` 的 pendingDecision 是同步点的完整当前值；后续变动继续 update/closed。恢复不重放旧模型 run。工具和模型被取消后已经到达宿主的输入，仍以宿主回执为准。

## 可见事件与长 Session

每个 `(gameId,epochId,seatId)` 独立可见事件流。`sequence` 从 1 连续递增，`fromCursor` 不含、`toCursor` 包含，`to-from=items.length`；隐藏事件不占本座位序号，也不进入摘要。重复按 sequence/eventId 去重；断档主动拉取，不能把未知区间补成虚构事件。

`events.ack` 是服务已持久保存输入的最大连续游标，**不是模型已阅读游标**；后者由 Session 上下文管理单独记录。其他玩家事件无论当前是否轮到 Agent 都可 events.batch 入队，下一次决策才触发模型，避免每条事件都启动 run。

决策附带最近事件和权威当前快照；历史有更多时 hasMore=true，可通过 events 查询分页。重连 historyStatus=gap 表示留存不足，必须重建当前视图并持久记录缺口区间，再以保留窗口的 fromCursor 建立新基线，随后才可 ack 新基线后的连续事件；不能假装缺失区间已经读过。旧事件查询仍遵循事件发生时该座位的信息权限，不能用现在权限解密过去暗牌。

传输监听、查询结果分发必须独立于等待工具/模型的运行循环；否则等待 query.result 会阻塞收到它。Stage 3 负责实现。Session 中保存原始可见记录、计划、摘要和消费游标；压缩只处理已结束交互，当前 tool call/result 链不得截断。这是后续上下文阶段的输入契约，不在此阶段实现摘要器。
