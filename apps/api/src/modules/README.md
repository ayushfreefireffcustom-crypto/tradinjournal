# Feature modules

Each feature is a self-contained module with a fixed internal shape:

```
<module>/
├─ <module>.routes.ts        Router: path -> middleware -> controller
├─ <module>.controller.ts    Parse request -> call service -> shape response (no logic)
├─ <module>.service.ts       Business rules, orchestration, enqueue jobs (no req/res)
├─ <module>.repository.ts     The ONLY place Prisma is used for this module
├─ <module>.schema.ts        Zod request schemas
└─ <module>.types.ts
```

Planned modules: `accounts`, `sync`, `executions`, `trades`, `metrics`, `journal`,
`playbooks`, `ai`, `health`.

Layer direction is one-way: **Controller → Service → Repository → Prisma.**
