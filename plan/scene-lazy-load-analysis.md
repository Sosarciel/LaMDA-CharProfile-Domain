---
aliases: [CharProfile Scene 懒加载重构分析]
---
# CharProfile-Domain Scene 懒加载重构分析

## 1. 问题陈述

### 现状
CharProfile-Domain 在 `CharConfig.create()` 初始化阶段，会**一次性加载并解析所有 scene**（包括 define 场景和全部 scene 文件），无论这些 scene 是否会被实际使用。

### 不合理之处
- **反直觉**：角色加载时即付出全部 scene 解析开销，但多数对话场景下只需 `default` 或 `define` 场景
- **资源浪费**：每个 scene 都涉及文件 I/O + Handlebars 模板渲染（`parseDefine` 内调用 `Hbs.create` → 动态 import handlebars → 编译模板 → 渲染），这是一组有意义的异步开销
- **扩展性瓶颈**：角色 scene 数量增长时，初始化耗时线性增长

## 2. 当前调用链分析

### 2.1 初始化链路

```
CharProfile.getCharHelper(charId)
  └─ _CharProfile.create(opt)
       └─ CharAccesser.create(opt)          // 构建路径，检查文件夹
       └─ da.loadChar()                     // ← 关键入口
            ├─ UtilFT.loadJSONFile(configPath)           // 读 config.json
            ├─ UtilFT.fileSearchGlob(sceneDir, "*.hbs")  // 扫描 scenes 目录
            ├─ Promise.all(readFile for each scene)      // 并行读取全部 scene 文件
            ├─ readFile(charDefinePath)                  // 读 define.hbs
            └─ CharConfig.create(charId, jo, define, sceneTextTable)
                 ├─ new CharConfig(charId, rawObj)       // fromJSON 初始化配置
                 ├─ loadScenes(sceneTextTable)           // ← 全量解析所有 scene
                 │    └─ for each sceneName:
                 │         parseDefine(sceneName, sceneText)
                 │           └─ Hbs.create(context)     // 每个scene都创建Hbs实例
                 │           └─ hbs.render(defineText)  // 模板渲染
                 │           └─ parseDialog(...)         // 解析对话
                 └─ parseDefine('define', defineText)   // 解析 define 场景
                      └─ Hbs.create(context)
                      └─ hbs.render(defineText)
                      └─ parseDialog(...)
```

### 2.2 关键代码位置

| 文件 | 行号 | 说明 |
|------|------|------|
| `CharProfile.ts:78-82` | `getCharHelper` → `_CharProfile.create` | 入口，缓存 charTable |
| `Accesser.ts:76-93` | `loadChar()` | 扫描+读取全部 scene 文件，传入 CharConfig.create |
| `Config.ts:53-67` | `CharConfig.create()` | 调用 `loadScenes` + `parseDefine` 全量解析 |
| `Config.ts:91-125` | `loadScenes()` | 遍历 sceneTextTable，逐个 `parseDefine` |
| `Config.ts:70-89` | `parseDefine()` | Hbs 模板渲染 + 对话解析，每个 scene 一份 Hbs 实例 |

### 2.3 Scene 数据结构

```typescript
// Interface.ts
type CharScene = {
    define: string;                  // 场景定义文本（Hbs渲染后）
    dialog: CharRenderedMessage[];   // 预对话（会遗忘）
    memory: CharRenderedMessage[];   // 记忆对话（不会遗忘）
    name: string;                    // 场景名
};
```

每个 scene 的解析流程：
1. **Hbs.create(context)** — 动态 import handlebars，创建实例，注册 `def`/`defli` helper
2. **hbs.render(defineText)** — 编译+渲染模板，context 中的 `predialog`/`memory` 被 `defli` helper 填充
3. **parseDialog(hbs.context.predialog)** — 将 `string[]` 解析为 `CharRenderedMessage[]`
4. **parseDialog(hbs.context.memory)** — 同上

### 2.4 Scene 的存储形式

- **文件位置**: `{dataDir}/character/{charId}/scenes/{sceneName}.hbs`
- **文件格式**: Handlebars 模板，通过 `{{#defli "predialog"}}` 和 `{{#defli "memory"}}` 块定义对话
- **default scene**: 必须存在，否则使用 fallback（空 define + greeting dialog）

### 2.5 Define 场景的特殊性

define 场景 (`define.hbs`) 与普通 scene 结构相同，但：
- 位于 `{dataDir}/character/{charId}/define.hbs`（不在 scenes 目录下）
- 在 `CharConfig.create` 中单独解析，存入 `this.defineScene`
- 通过 `getDefine()` 方法访问
- 其 memory 对话用于角色设定的长期记忆

## 3. 外部调用分析

### 3.1 getScene() 调用点

| 位置 | 代码 | 说明 |
|------|------|------|
| `server/src/CmdBackend/CmdTable.ts:393` | `threadStatus.getCH().getScene()` | setscene 命令，获取 default scene |
| `server/src/CmdBackend/CmdTable.ts:397` | `threadStatus.getCH().getScene(sceneName)` | setscene 命令，获取指定 scene |
| `server/src/DataManager/ThreadStatus.ts:211` | `this.getCH().getScene()` | resetThreadStatus，重置线程时获取 default scene |

### 3.2 getDefine() 调用点

在 src 源码中（排除 dist/backup/node_modules），**未发现外部模块直接调用 `getDefine()`**。
仅在 Test 中有调用（test 14, test 16）。

### 3.3 hasScene() 调用点

在 src 源码中，**未发现外部模块调用 `hasScene()`**。

### 3.4 调用模式总结

- **getScene()** 是唯一被外部调用的 scene 相关方法，且调用时总是同步期望返回 `CharScene`
- 调用场景集中在：`setscene` 命令和 `resetThreadStatus`
- `getDefine()` 在外部生产代码中**实际未被调用**（仅测试中验证）
- `hasScene()` 在外部**完全未被调用**

## 4. 重构目标

### 核心目标
将 scene 从「初始化时全量解析」改为「用时才读取-解析-缓存入内存表单」。

### 具体目标
1. **lazy load**：`getScene(name)` 首次调用时才读取+解析对应 scene 文件
2. **cache**：解析后缓存到内存表，后续调用直接返回缓存
3. **define scene 也懒加载**：`getDefine()` 首次调用时才解析 define.hbs
4. **保持 API 签名兼容**：但 `getScene`/`getDefine` 需要变为 async

## 5. 影响面评估

### 5.1 API 签名变更（Breaking Change）

| 方法 | 当前签名 | 目标签名 |
|------|----------|----------|
| `getScene(name?)` | `CharScene` (sync) | `Promise<CharScene>` (async) |
| `getDefine()` | `CharScene` (sync) | `Promise<CharScene>` (async) |
| `hasScene(name)` | `boolean` (sync) | `boolean` (sync, 仅检查缓存) 或 `Promise<boolean>` (async, 检查文件) |

### 5.2 受影响的调用点

| 位置 | 当前代码 | 需改为 |
|------|----------|--------|
| `CmdTable.ts:393` | `const defscene = threadStatus.getCH().getScene();` | `const defscene = await threadStatus.getCH().getScene();` |
| `CmdTable.ts:397` | `const scene = threadStatus.getCH().getScene(sceneName);` | `const scene = await threadStatus.getCH().getScene(sceneName);` |
| `ThreadStatus.ts:211` | `const scene = this.getCH().getScene();` | `const scene = await this.getCH().getScene();` |

### 5.3 CharConfig.create 简化

`CharConfig.create` 中移除 `loadScenes` 和 `parseDefine('define', ...)` 调用，
仅保留 `fromJSON` 配置初始化。scene 解析推迟到 `getScene`/`getDefine` 时。

### 5.4 CharAccesser.loadChar 简化

`loadChar` 中移除 scene 文件扫描和读取逻辑（glob + readFile），
也移除 define 文件读取。仅保留 config.json 的加载。

scene 文件的读取职责转移到 `CharConfig` 内部（或通过 `CharAccesser` 提供的路径方法）。

### 5.5 不受影响的部分

- `CharConfig` 中的非 scene 方法（`getCharDisplayName`, `transReplace`, `getLogitBias` 等）不受影响
- `CharAccesser` 的音频/收藏夹功能不受影响
- `CharProfile` 的缓存机制 (`charTable`) 不受影响
- `CharConfigMixinOpt.fieldList` 需要更新（`getScene`/`getDefine` 的类型签名变化）

## 6. 关键设计决策点

### 6.1 Scene 文件读取职责归属

**选项 A**：CharConfig 自己持有路径，自行读取文件
- 优点：内聚，CharConfig 自包含
- 缺点：CharConfig 当前不持有文件路径，需要新增

**选项 B**：通过 CharAccesser 提供读取方法，CharConfig 调用
- 优点：文件 I/O 统一在 Accesser 层
- 缺点：CharConfig 依赖 CharAccesser，当前架构中两者通过 Composer 组合，不直接引用

**选项 C**：CharAccesser.loadChar 时传入必要的路径信息（sceneDir, definePath），CharConfig 内部用时自行读取
- 优点：路径信息在初始化时确定，I/O 时机由 CharConfig 控制
- 缺点：CharConfig 需要新增文件 I/O 逻辑

### 6.2 hasScene 的语义

**选项 A**：仅检查内存缓存（同步），未加载的 scene 返回 false
- 缺点：语义不准确，scene 文件存在但未加载时返回 false

**选项 B**：异步检查文件是否存在
- 缺点：需 I/O

**选项 C**：移除 hasScene，外部未使用
- 最简方案

### 6.3 default scene 的处理

default scene 当前在 `loadScenes` 中有 fallback 逻辑（缺少时创建 greeting scene）。
懒加载后，default scene 的 fallback 逻辑需保留在 `getScene("default")` 中。

### 6.4 reloadChar 的影响

`CharProfile.reloadChar()` 会重新调用 `loadChar()` 并重定向组合。
懒加载后，`reloadChar` 需要同时清空 scene 缓存。

## 7. 建议方案概述

### 推荐方案：CharConfig 持有路径，内部懒加载

1. **CharConfig.create** 接收 `sceneDir` 和 `definePath` 参数（而非 `sceneTextTable` 和 `defineText`）
2. **CharConfig** 内部维护 `sceneCache: Record<string, CharScene>` 和 `defineCache: CharScene | null`
3. **getScene(name)** 变为 async，首次调用时：
   - 检查缓存 → 命中则返回
   - 未命中 → 读取 `{sceneDir}/{name}.hbs` → parseDefine → 缓存 → 返回
   - default scene 缺失时使用 fallback
4. **getDefine()** 变为 async，首次调用时：
   - 检查缓存 → 命中则返回
   - 未命中 → 读取 `{definePath}` → parseDefine → 缓存 → 返回
5. **CharAccesser.loadChar** 不再扫描/读取 scene 文件，仅传路径给 CharConfig
6. **reloadChar** 清空 scene 缓存

### 优势
- 最小化 I/O：未使用的 scene 永远不会被读取
- 缓存自然失效：reloadChar 时清空
- 外部调用点改动小：仅需 await

### 代价
- getScene/getDefine 变为 async（breaking change）
- CharConfig 新增文件 I/O 职责

## 8. 风险点

1. **Modular Mixer 类型同步**：`fieldList` 中的方法签名变化可能导致 Composer 类型推断异常，需验证 modular-mixer 对 async 方法的支持
2. **define scene 未被外部调用**：如果确认 getDefine 确实无生产调用，可考虑是否需要保留
3. **并发调用**：同一 scene 被并发请求时需避免重复解析（可用 in-flight Promise 缓存）
4. **测试更新**：现有测试直接调用 `config.getScene()` / `config.getDefine()` 不带 await，需全部更新

## 9. 待确认决策

1. **Scene 文件读取职责**归 CharConfig 还是 CharAccesser？（见 6.1）
2. **hasScene** 保留还是移除？（见 6.2）
3. **getDefine** 是否保留？生产代码中未被调用，是否标记 deprecated 或直接移除？
4. **并发安全**：是否需要 in-flight Promise 去重（同一 scene 并发请求只解析一次）？
5. **define scene** 是否也懒加载，还是作为基础信息在初始化时解析（因为 define scene 含有角色核心设定，且每次只解析一个文件开销可控）？

---

*分析时间: 2026-08-03*
*分析者: Akaset*
