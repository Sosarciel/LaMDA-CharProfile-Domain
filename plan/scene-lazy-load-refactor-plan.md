---
aliases: [CharProfile Scene 懒加载重构方案]
---
# CharProfile-Domain Scene 懒加载重构方案

## 1. 修正说明

本文档为 `scene-lazy-load-analysis.md` 的修正与补充报告。

### 1.1 首次分析的遗漏

首次分析中搜索 `getDefine()` 调用时使用了 `charHelper\.|charProfile\.|getCH\(\)\.` 前缀模式，
**遗漏了通过解构变量名 `ch` 直接调用的情况**（`ch.getDefine()`）。

实际生产代码中 `getDefine()` 有 **2 处调用**：
- `server/src/DataManager/DataHelper.ts:122` — `addFavorite` 中
- `server/src/DataManager/HistHelper.ts:68` — `genChatMessages` 中

这两处都是同步调用 `ch.getDefine()`，且 `defineScene` 的结果会传入 `DialogHelper` /
`ContextEnhance.appendHist` 作为消息拼接的核心数据。

### 1.2 修正后的调用点汇总

| 方法 | 调用位置 | 调用形式 | 说明 |
|------|----------|----------|------|
| `getScene()` | `CmdTable.ts:393` | `threadStatus.getCH().getScene()` | setscene 命令，获取 default |
| `getScene(name)` | `CmdTable.ts:397` | `threadStatus.getCH().getScene(sceneName)` | setscene 命令，获取指定 scene |
| `getScene()` | `ThreadStatus.ts:211` | `this.getCH().getScene()` | resetThreadStatus |
| `getDefine()` | `DataHelper.ts:122` | `ch.getDefine()` | addFavorite |
| `getDefine()` | `HistHelper.ts:68` | `ch.getDefine()` | genChatMessages |
| `getDefine()` | `Test:188,224` | `config.getDefine()` | 单元测试 |
| `getScene(name)` | `Test:175,211` | `config.getScene("default")` | 单元测试 |

> `hasScene()` 在外部生产代码和测试中均未被调用，但按用户要求保留。

## 2. 用户确认的设计决策

| 决策点 | 用户决定 |
|--------|----------|
| default 和 define scene | **必须立即加载**，初始化流程中有警告逻辑需保留 |
| hasScene / getScene / getDefine | **全部保留** |
| 并发去重 | **通过在 sceneTable 中存储 Promise 实现** |
| 其他 scene（非 default/define） | 懒加载：用时才读取-解析-缓存 |

## 3. 重构方案

### 3.1 核心思路

将 scene 分为两类处理：

1. **立即加载**：`default` scene 和 `define` scene 在 `CharConfig.create()` 时同步解析（保持原有行为）
2. **懒加载**：其他 scene 在 `getScene(name)` 首次调用时才读取+解析，缓存到 `sceneTable`

### 3.2 sceneTable 存储类型变更

```typescript
// 当前
private sceneTable: Record<string, CharScene> = {};

// 重构后
private sceneTable: Record<string, Promise<CharScene>> = {};
```

- `default` scene 和 `define` scene 在 `create` 时写入已 resolve 的 Promise
- 其他 scene 在首次 `getScene(name)` 时写入进行中的 Promise
- 并发调用同一 scene 时，所有调用者共享同一个 Promise，天然去重

### 3.3 文件读取职责

CharConfig 需要能自行读取 scene 文件。方案：

- `CharConfig.create` 接收 `sceneDir` 路径（而非 `sceneTextTable`）
- `CharAccesser.loadChar` 不再扫描+读取全部 scene 文件，仅传 `sceneDir` 路径
- `CharConfig` 内部新增 `private loadSceneFile(sceneName): Promise<string>` 方法，读取 `{sceneDir}/{sceneName}.hbs`

define 文件路径同理，`CharConfig.create` 接收 `definePath`（而非 `defineText`），内部自行读取。

### 3.4 方法签名变更

#### getScene

```typescript
// 当前（同步）
getScene(sceneName: string | null = "default"): CharScene

// 重构后（异步）
async getScene(sceneName: string | null = "default"): Promise<CharScene>
```

逻辑：
1. 标准化 sceneName（null → "default"）
2. 检查 `sceneTable[sceneName]` 是否已有 Promise
3. 有 → await 返回
4. 无 → 创建 `parseSceneFromFile(sceneName)` 的 Promise，存入 `sceneTable`，await 返回
5. 解析失败（文件不存在/解析异常）→ 返回 default scene 的缓存

#### getDefine

```typescript
// 当前（同步）
getDefine(): CharScene

// 重构后（异步）
async getDefine(): Promise<CharScene>
```

逻辑：
1. `defineScene` 在 `create` 时已加载为 Promise，直接 await 返回

#### hasScene

```typescript
// 当前（同步，检查内存表）
hasScene(sceneName: string): boolean

// 重构后（同步，检查内存缓存是否存在已解析的 Promise）
hasScene(sceneName: string): boolean
```

语义不变：仅检查内存缓存中是否有对应 Promise。未懒加载的 scene 返回 false。
（如需检查文件是否存在，可另加 `hasSceneFile(name): Promise<boolean>`，但当前无需求。）

### 3.5 loadScenes 简化

```typescript
// 当前 loadScenes：全量遍历解析
private async loadScenes(sceneTextTable: Record<string, string>): Promise<void>

// 重构后：仅加载 default
private async loadDefaultScene(): Promise<void>
```

- 不再扫描 scenes 目录
- 仅解析 default scene（从文件读取，或使用 fallback）
- 保留原有警告逻辑（缺少 default scene 时 warn + fallback greeting）

### 3.6 parseDefine 不变

`parseDefine` 方法本身不需要修改，仍是接收 `name` + `defineText` 返回 `CharScene`。
只是调用时机从 `loadScenes` 全量调用，变为 `getScene` 懒加载时单个调用。

### 3.7 reloadChar 清空缓存

`CharProfile.reloadChar()` 需要在重新加载后清空 sceneTable 中的懒加载缓存：

```typescript
async reloadChar(): Promise<CharConfig> {
    const charConfig = await fix(this).loadChar();
    // reloadChar 内部会重新 create CharConfig
    // 新的 CharConfig 实例自带清空的 sceneTable
    // 无需额外操作，因为 loadChar 返回的是全新的 CharConfig 实例
}
```

实际上 `reloadChar` 调用 `loadChar` → `CharAccesser.loadChar` → `CharConfig.create`，
每次 create 都是新实例，sceneTable 自然是空的。**无需额外处理**。

### 3.8 CharAccesser.loadChar 简化

```typescript
// 当前
async loadChar(): Promise<CharConfig> {
    const jo = await UtilFT.loadJSONFile(this.charConfigPath);
    // 扫描 scenes 目录
    const filterList = await UtilFT.fileSearchGlob(this.charSceneDir, `*${CharConstant.DEFINE_EXT}`);
    // 并行读取全部 scene 文件
    const procTable = await Promise.all(filterList.map(...));
    const sceneTable = procTable.reduce(...);
    // 读取 define 文件
    let define = "";
    try { define = await fs.promises.readFile(this.charDefinePath, "utf-8"); } catch ...
    return CharConfig.create(this.charId, jo, define, sceneTable);
}

// 重构后
async loadChar(): Promise<CharConfig> {
    const jo = await UtilFT.loadJSONFile(this.charConfigPath);
    // 不再扫描/读取 scene 文件，仅传路径
    return CharConfig.create(this.charId, jo, {
        sceneDir: this.charSceneDir,
        definePath: this.charDefinePath,
    });
}
```

### 3.9 CharConfig.create 签名变更

```typescript
// 当前
static async create(
    charId: string,
    rawObj: JObject,
    defineText: string,
    sceneTextTable: Record<string, string>
): Promise<CharConfig>

// 重构后
static async create(
    charId: string,
    rawObj: JObject,
    paths: { sceneDir: string; definePath: string }
): Promise<CharConfig>
```

create 内部：
1. `fromJSON(rawObj)` — 配置初始化
2. `loadDefaultScene()` — 立即加载 default scene（读取 `{sceneDir}/default.hbs` + fallback）
3. `loadDefineScene()` — 立即加载 define scene（读取 `definePath` + 警告逻辑）
4. 其他 scene 不加载

## 4. 受影响调用点修改

### 4.1 server 侧（getScene / getDefine 变 async → 需 await）

| 文件 | 行号 | 修改 |
|------|------|------|
| `CmdTable.ts:393` | `const defscene = threadStatus.getCH().getScene();` | → `const defscene = await threadStatus.getCH().getScene();` |
| `CmdTable.ts:397` | `const scene = threadStatus.getCH().getScene(sceneName);` | → `const scene = await threadStatus.getCH().getScene(sceneName);` |
| `ThreadStatus.ts:211` | `const scene = this.getCH().getScene();` | → `const scene = await this.getCH().getScene();` |
| `DataHelper.ts:122` | `defineScene: ch.getDefine()` | → `defineScene: await ch.getDefine()` |
| `HistHelper.ts:68` | `const defineScene = ch.getDefine();` | → `const defineScene = await ch.getDefine();` |

> 注意：`CmdTable.ts:405` 的 `convModel.getScene()` 是 Dialog-Domain 的 ConversationModel.getScene()，不是 CharProfile 的，**不需要改**。

### 4.2 Test 侧

| 文件 | 行号 | 修改 |
|------|------|------|
| `charprofile-domain.test.ts:175` | `const defaultScene = config.getScene("default");` | → `const defaultScene = await config.getScene("default");` |
| `charprofile-domain.test.ts:188` | `const define = config.getDefine();` | → `const define = await config.getDefine();` |
| `charprofile-domain.test.ts:211` | 同上 | 同上 |
| `charprofile-domain.test.ts:224` | 同上 | 同上 |

### 4.3 fieldList 类型

`CharConfigMixinOpt.fieldList` 中 `getScene` 和 `getDefine` 的类型签名变化会被 modular-mixer 的 `ComposeOpt` 自动推断。
需验证 modular-mixer 对 async 方法的类型推断是否正确（预期没问题，因为 TypeScript 方法签名中 `async` 等价于返回 `Promise`）。

## 5. 重构步骤

| 步骤 | 内容 | 文件 |
|------|------|------|
| 1 | 修改 `CharConfig` 类：sceneTable 类型改为 `Record<string, Promise<CharScene>>`，新增 `sceneDir`/`definePath` 字段，修改 `create`/`loadScenes`→`loadDefaultScene`，新增 `loadSceneFromFile`，`getScene`/`getDefine` 变 async | `Config.ts` |
| 2 | 修改 `CharAccesser.loadChar`：不再扫描/读取 scene 文件，传路径给 CharConfig | `Accesser.ts` |
| 3 | 修改 server 侧调用点：5 处加 `await` | `CmdTable.ts`, `ThreadStatus.ts`, `DataHelper.ts`, `HistHelper.ts` |
| 4 | 修改测试：4 处加 `await` | `charprofile-domain.test.ts` |
| 5 | 编译验证：`tsc --noEmit` | — |
| 6 | 运行测试：`npm test` | — |

## 6. 遗留问题

### 6.1 default scene 文件不存在时的警告

当前 `loadScenes` 中检查 `sceneTextTable["default"]` 是否为 null。
重构后 `loadDefaultScene` 需要改为检查 `{sceneDir}/default.hbs` 文件是否存在：
- 文件不存在 → warn + fallback greeting scene（保持原有行为）

### 6.2 define 文件读取失败的警告

当前在 `CharAccesser.loadChar` 中 try-catch 读取 define 文件，失败时 warn。
重构后该逻辑移到 `CharConfig.loadDefineScene` 中，行为保持一致。

### 6.3 scene 解析校验

当前 `loadScenes` 中有两个校验：
1. `dialog.length <= 0` → warn + skip
2. `dialog[last].sender_name != charDisplayName` → warn + skip

懒加载后，这两个校验需保留在 `getScene` 的解析路径中。
但注意：default scene 的 fallback 不受此校验约束（fallback 的 dialog 就是 greeting）。

### 6.4 scene 文件不存在的处理

`getScene("nonexistent")` 时：
- 文件不存在 → 应返回 default scene（当前行为）
- 需确保不会因文件读取异常而 crash

建议在 `loadSceneFromFile` 中：
- 文件不存在 → return null
- `getScene` 收到 null → 返回 default scene 缓存

---

*分析时间: 2026-08-04*
*分析者: Akaset*
