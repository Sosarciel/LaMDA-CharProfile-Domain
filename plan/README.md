---
aliases: [CharProfile-Domain 计划索引]
---
# CharProfile-Domain 计划索引

> 本文档索引 CharProfile-Domain 模块的所有计划文档

---

## 📋 进行中计划
```base
filters:
  and:
    - file.name != "README"
    - file.folder == "LaMDA-Module/Business-Domain/CharProfile-Domain/plan"
views:
  - type: table
    name: 计划一览
    order:
      - file.name
      - aliases
      - file.mtime
    sort:
      - property: file.mtime
        direction: DESC

```

---

## 📁 已归档计划
```base
filters:
  and:
    - file.path.startsWith("LaMDA-Module/Business-Domain/CharProfile-Domain/plan/archive")
views:
  - type: table
    name: 归档一览
    order:
      - file.name
      - aliases
      - file.mtime
    sort:
      - property: file.mtime
        direction: DESC

```

---

*最后更新: 2026-04-09*
