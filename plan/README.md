---
aliases: [CharProfile-Domain 计划索引]
---
# CharProfile-Domain 计划索引

> 本文档索引 CharProfile-Domain 模块的所有计划文档

---

## 📋 计划列表
```base
filters:
  and:
    - file.folder == "LaMDA-Module/Business-Domain/CharProfile-Domain/plan"
    - file.name != "README"
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

*最后更新: 2026-03-25*
