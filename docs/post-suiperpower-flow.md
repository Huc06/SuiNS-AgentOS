# Pipeline sau Suiperpower build

Kỹ thuật: từ output Suiperpower → agent discover được trên dashboard.

- **UX tạo agent + SuiNS:** [create-agent-ux.md](./create-agent-ux.md)
- **Suiperpower ↔ AgentOS:** [suiperpower.md](./suiperpower.md)
- **Publish contracts:** [publish-testnet.md](./publish-testnet.md)

---

## Ba lớp

| Lớp | Tool | Trạng thái |
|-----|------|------------|
| Build Move + skill | Suiperpower | Ngoài repo |
| Register metadata | `agentos` CLI / MCP / `/api/*` | ✅ `.agentos/registry.json` |
| On-chain + Walrus + MVR | Contracts + wallet | ⏳ một phần |

```mermaid
flowchart TD
  A[Suiperpower: Move + manifest] --> B[Publish contracts → packageId]
  B --> C[agentos init + config]
  C --> D[SuiNS bind trên web /create]
  D --> E[Mint AgentPassport]
  E --> F[Walrus manifest + skill publish]
  F --> G[MVR @org/pkg → packageId]
  G --> H[/api/resolve + /agent/slug]
```

---

## 1. Suiperpower output

1. `build-with-move` — package agent.
2. `deploy-to-testnet` — `packageId`.
3. `verify-against-intent` — nếu có `.suiperpower/intent.md`.

Giữ: `packageId`, `skill.manifest.json` (`publisher: "@org/pkg"`), (optional) Walrus blob id.

---

## 2. Cấu hình AgentOS

```bash
pnpm exec agentos init
```

`.agentos/config.json`:

```json
{
  "network": "testnet",
  "packageId": "0xYOUR_PACKAGE_ID",
  "registryPath": ".agentos/registry.json",
  "dashboardUrl": "http://localhost:3000"
}
```

Frontend: `NEXT_PUBLIC_AGENTOS_PACKAGE_ID=0x...` — xem [publish-testnet.md](./publish-testnet.md).

---

## 3. SuiNS + passport

**UX:** [create-agent-ux.md](./create-agent-ux.md) — Nhánh A (suins.io) / Nhánh B (bind trên web) / handoff terminal→browser.

**On-chain + UI (testnet):**

- `agent_passport::create` + `transferObjects` về ví signer ✅
- SuiNS `setTargetAddress` khi target ≠ runtime ✅
- Registry `POST /api/agents` ✅ (server validate ⏳)
- Xóa registry: `DELETE /api/agents/[slug]`, `agentos agent delete` ✅

CLI (không thay web cho bind SuiNS):

```bash
agentos agent create my-agent.sui --wallet 0xRUNTIME
agentos agent create my-agent.sui --wallet 0xRUNTIME --on-chain   # + SUI_PRIVATE_KEY
```

---

## 4. MVR

`publisher` trong manifest = tên MVR (`@my-agent/web-search`); `sui.movePackage` = hex sau deploy.

| Field | Vai trò |
|-------|---------|
| `mvrPackage` / `publisher` | Metadata + `SkillDescriptor.mvr_package_name` |
| `sui.movePackage` | Package Move thật |

Đăng ký tên trên MVR registry — **chưa wire**; dùng Suiperpower `suins-integration` (phần MVR) sau publish.

---

## 5. Publish skill (3 nghĩa)

| Loại | Lệnh / UI | Trạng thái |
|------|-----------|------------|
| **Registry** | `agentos skill publish manifest.json --agent name.sui` | ✅ |
| **Walrus** | `--walrus <blobId>` | ⏳ upload thủ công |
| **On-chain** | `skill_descriptor::create` | ⏳ `--dry-run` only |

```bash
agentos skill publish ./examples/skill.manifest.json --agent my-agent.sui
```

---

## 6. Discover

| Kênh | Entry |
|------|--------|
| API | `GET /api/resolve?name=…` |
| Web | `/agent/{slug}` |
| CLI | `agentos agent resolve …` |
| MCP | `agentos_resolve`, `agentos_dashboard_url` |

---

## Trạng thái & thứ tự implement

| Hạng mục | Status |
|----------|--------|
| Registry agent/skill | ✅ |
| packageId + publish testnet | ✅ (team local / CD) |
| SuiNS bind + mint UI | ✅ [create-agent-ux.md](./create-agent-ux.md) |
| Delete agent | ✅ |
| Walrus + SkillDescriptor on-chain | ⏳ |
| MVR register | ⏳ |
| Enoki sponsor | scaffold; cần `NEXT_PUBLIC_ENOKI_API_KEY` |

**Tiếp theo:** Walrus + on-chain skill → MVR → Enoki public key → Suiperpower skill demo E2E.

---

## Lệnh nhanh

```bash
pnpm exec agentos init
# packageId trong .agentos/config.json

# Terminal: chuẩn bị runtime, mở web bind (xem create-agent-ux.md)
open "http://localhost:3000/create?bind=suins&runtime=0xRUNTIME"

# Sau bind trên web:
agentos skill publish ./examples/skill.manifest.json --agent my-agent.sui
agentos agent resolve my-agent.sui
```
