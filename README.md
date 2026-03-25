# CharProfile-Domain

角色档案域模块，管理角色配置、场景渲染与模板上下文。

---

## 📋 实施计划

- [[plan/README|查看所有计划]]

---

## 功能概述

- **角色配置**：支持角色名、ID、默认用户名等配置
- **场景渲染**：基于 Handlebars 模板渲染场景定义
- **术语映射**：支持音频翻译术语映射表
- **TTS 集成**：关联 TTS 实例与角色语音

## 目录结构

```
src/
├── CharProfile.ts     # 角色档案核心
├── Accesser.ts        # 数据访问层
├── Config.ts          # 配置解析
├── Interface.ts       # 类型定义
└── Mock/              # 测试 Mock 工具
```

---

*最后更新: 2026-03-25*
