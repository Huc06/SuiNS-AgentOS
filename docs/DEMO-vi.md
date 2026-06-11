# Kịch bản Demo: SuiNS AgentOS — Vòng đời Skill đầy đủ

**Thời lượng:** ~10 phút  
**Mục tiêu:** Show AgentOS là hạ tầng agent-native đầu tiên trên Sui — nơi AI agents có danh tính on-chain, publish skills lên Walrus, và tìm thấy nhau bằng tên.

**Các tool hệ sinh thái (vai phụ hỗ trợ):**  
Suiperpower (build Move), Claude Code (AI coding), Cursor (IDE), Antigravity (deploy)

**Vai chính:** AgentOS (identity + skill registry + MCP tools)

---

## ACT 1 — Hook: "Nếu AI agent có CV on-chain thì sao?" (2 phút)

**[Màn hình: Claude Code terminal, font to, nền tối]**

**Narrator (chậm, tự tin):**

> Bạn dùng Claude Code hay Cursor mỗi ngày. AI giúp bạn code, debug, deploy. Nhưng thử tưởng tượng: nếu AI agent của bạn có thể **tự giới thiệu mình on-chain** — agent khác biết nó làm được gì, verify được, dùng lại được — giống như import một npm package bằng tên?

**[Gõ trong Claude Code — chậm, để camera theo kịp:]**

```
Tôi muốn tìm một AI agent trên Sui có khả năng rebalance DeFi portfolio.
Tên nó là "defi-rebalancer.alpha-fund.sui". Show tôi nó có skill gì.
```

**[Claude Code gọi MCP tool:]**

```
⏺ Called agentos (agentos_resolve_manifest)
  suinsName: "defi-rebalancer.alpha-fund.sui"

⏺ Result:
{
  "error": "Skill not found: defi-rebalancer.alpha-fund.sui"
}
```

**Narrator:**

> Chưa có agent nào tên "alpha-fund" trên chain. Vì trên Sui hôm nay, AI agents chưa có **identity layer**. Không ai biết agent nào làm được gì, không verify được, không compose được.

**[Dừng 2 giây]**

> AgentOS giải quyết đúng vấn đề này. Nó là **npm cho AI agents on-chain**: đăng ký identity, publish skills lên Walrus, discover bằng tên SuiNS, execute qua PTB. Từ bất kỳ IDE nào.

**[Gõ tiếp:]**

```
Show me all available agentos tools
```

**[Claude Code liệt kê full toolbox:]**

```
AgentOS MCP Tools (8):

  agentos_register_agent    — Tạo identity + passport cho agent
  agentos_publish_skill     — Upload skill lên Walrus + đăng ký on-chain
  agentos_resolve_manifest  — Tìm skill bất kỳ bằng tên SuiNS
  agentos_execute_skill     — Chạy skill on-chain qua PTB
  agentos_import_skill      — Import từ Sui Agent Skills catalog
  agentos_list_skills       — Liệt kê skills đã đăng ký của agent
  agentos_resolve           — Tra cứu agent bằng tên
  agentos_dashboard_url     — Link dashboard quản lý trực quan
```

**Narrator:**

> 8 operations. Đủ để một AI agent tự quản lý toàn bộ lifecycle — từ tạo danh tính đến publish, discover, và execute skill. Không hardcode address. Không centralized registry. Mọi thứ on-chain, verify được, composable.

> Giờ tôi sẽ show toàn bộ flow — từ zero đến agent có danh tính, có skill, discoverable bởi bất kỳ agent khác trên Sui.

---

## ACT 2 — Agent Identity: Passport + SuiNS Binding (2 phút)

**[Chia màn hình: Terminal trái + Browser phải]**

**Narrator:**

> Bước đầu: mọi agent cần tên. Trên Sui, đó là SuiNS name. Và một chứng chỉ — Agent Passport, mint on-chain.

### 2a — Terminal: Đăng ký agent, lấy link handoff

**[Claude Code:]**

```
Đăng ký agent mới "alpha-fund.sui" với runtime wallet 0xABC...
và mở dashboard để hoàn tất SuiNS binding.
```

**[MCP gọi `agentos_register_agent` → trả về:]**

```json
{
  "agent": {
    "slug": "alpha-fund",
    "suinsName": "alpha-fund.sui",
    "passportId": "0x...",
    "runtimeWallet": "0xABC..."
  },
  "dashboardUrl": "http://localhost:3000/create?bind=suins&runtime=0xABC&name=alpha-fund.sui"
}
```

**Narrator:**

> Terminal đăng ký locally và in ra link dashboard. Nhưng SuiNS binding cần chữ ký từ ví browser — bảo mật theo thiết kế.

### 2b — Browser: Connect ví, bind, mint passport

**[Mở dashboard URL — show wizard /create:]**

1. Connect ví (Sui Wallet / Enoki zkLogin)
2. "Use a name I already own" → chọn `alpha-fund.sui`
3. Verify: ✅ Tên tồn tại, ✅ NFT thuộc ví đang connect
4. Một giao dịch: `setTargetAddress(0xABC...)` + `agent_passport::create`
5. **Success modal**: link Suiscan + "Manage Skills →"

**Narrator:**

> Browser ký, chain ghi nhận. SuiNS `alpha-fund.sui` giờ resolve tới runtime wallet. Passport đã mint. Hai ví tách biệt theo thiết kế: owner (browser, giữ NFT) và runtime (máy agent, ký khi execute skill). Không bao giờ share private key.

---

## ACT 3 — Build Skill với Suiperpower (1 phút)

**[Màn hình: Claude Code]**

**Narrator:**

> Identity xong. Giờ agent cần khả năng — skills. Dùng Suiperpower để build Move skill package.

```
/build-ai-agent

Build Move skill "defi-rebalancer" cho agent alpha-fund.sui.
Entry function: rebalance(target: vector<u8>, slippage: u64)
Deploy lên testnet. Output ra .suiperpower/output/
```

**[Suiperpower generates → compiles → deploys → show packageId]**

**Narrator:**

> Move code built và deployed. Nhưng agent khác làm sao _tìm_ được skill này? Đó là lúc AgentOS vào cuộc.

---

## ACT 4 — Publish: Manifest → Walrus → On-chain → SuiNS (2 phút)

**[Màn hình: Claude Code — phần chính]**

**Narrator:**

> Một lệnh. Ba thứ xảy ra: manifest lên Walrus, SkillDescriptor đăng ký on-chain, SuiNS subname tạo.

**[Gõ:]**

```
Publish skill vừa build từ Suiperpower output cho agent alpha-fund.sui
```

**[Claude Code chạy:]**

```bash
$ agentos skill publish --agent alpha-fund.sui --from-suiperpower --json

Detected Suiperpower build
  packageId: 0x6568deb1...
  manifest generated: defi-rebalancer v1.0.0
  uploading to Walrus...
  registering on-chain...

{
  "blobId": "xK9mNp2qR7...",
  "manifestHash": "a3f7c2e190...",
  "objectId": "0x8a4b9c...",
  "suinsName": "defi-rebalancer.alpha-fund.sui"
}
```

**[Narrator chỉ từng field:]**

> - **blobId** — manifest giờ nằm trên Walrus. Phi tập trung. Content-addressed. Ai cũng fetch được.
> - **manifestHash** — SHA-256 của manifest. Lưu on-chain. Tamper-proof.
> - **objectId** — SkillDescriptor Move object. Owner-gated. Chỉ bạn update được.
> - **suinsName** — `defi-rebalancer.alpha-fund.sui`. Bất kỳ agent nào trên Sui đều tìm được skill này bằng tên. Như `npm install lodash`, nhưng cho agents, on-chain.

---

## ACT 5 — Discovery: Agent khác tìm và verify (1.5 phút)

**[Vẫn Claude Code]**

**Narrator:**

> Bây giờ tưởng tượng bạn là một agent _khác_. Bạn nghe có DeFi rebalancer ở alpha-fund. Bạn muốn dùng. Bạn chỉ biết tên.

**[Gõ:]**

```
Resolve skill "defi-rebalancer.alpha-fund.sui" —
show manifest và verify integrity
```

**[Claude Code gọi `agentos_resolve_manifest`:]**

```json
{
  "descriptor": {
    "skillId": "defi-rebalancer",
    "walrusManifestBlob": "xK9mNp2qR7...",
    "manifestHash": "a3f7c2e190...",
    "version": "1.0.0",
    "dependencies": []
  },
  "manifest": {
    "name": "defi-rebalancer",
    "publisher": "@alpha-fund/defi-rebalancer",
    "sui": {
      "movePackage": "0x6568deb1...",
      "entry": "rebalancer::rebalance"
    },
    "mcp": {
      "tools": [{ "name": "rebalance", "description": "..." }]
    }
  }
}
```

**Narrator:**

> Resolve bằng tên. Download từ Walrus. Hash verify với on-chain record. Agent giờ biết _chính xác_ Move function nào gọi, tham số gì, và tin tưởng manifest chưa bị sửa đổi. Zero trust assumptions ngoài chain.

---

## ACT 6 — Dashboard: Quản lý trực quan (1.5 phút)

**[Browser: localhost:3000/agent/alpha-fund/skills]**

**Show trên màn hình:**

- **Skill card**: tên, version, link Walrus (click → Walruscan), link Sui (click → SuiVision)
- **Source badge**: "Suiperpower" (vì skill đến từ Suiperpower output)
- **Status badge**: "ACTIVE" + chấm xanh
- **Dependency graph**: SVG visualization (nếu có dependencies)
- **Nút "Publish Upgrade"** → chọn manifest mới → ví ký → SuiNS name giữ nguyên, version mới
- **Nút "Import Skill"** → tab catalog (Sui Agent Skills) + tab upload

**Narrator:**

> Dashboard là bảng điều khiển cho owner. Upgrade skill mà không đổi identity — `defi-rebalancer.alpha-fund.sui` giữ nguyên, version bump. Agent đang dùng không bị break. Import skill từ community catalog bằng một click.

---

## ACT 7 — Cross-IDE: Chạy ở mọi nơi (30 giây)

**[Màn hình: Cursor IDE]**

```
Resolve skill defi-rebalancer.alpha-fund.sui
```

**[Cùng MCP tool, cùng kết quả, IDE khác]**

**Narrator:**

> Không lock-in. Claude Code, Cursor, bất kỳ MCP client — cùng tools, cùng data, cùng on-chain source of truth.

---

## ACT 8 — Closing: The Stack (30 giây)

**[Slide sạch:]**

```
┌─────────────────────────────────────────────────────────────┐
│  SuiNS Name       →  Danh tính human-readable               │
│  Agent Passport   →  Chứng chỉ on-chain (owner-gated)      │
│  Skills on Walrus →  Phi tập trung, content-addressed       │
│  SkillDescriptor  →  Pointer on-chain + integrity proof     │
│  MCP Tools        →  Agent nào cũng discover + execute      │
│  Dashboard        →  Quản lý trực quan + upgrade + import   │
└─────────────────────────────────────────────────────────────┘

Build với Suiperpower. Đăng ký với AgentOS.
Discover và execute từ bất kỳ IDE nào.
```

**Narrator:**

> AgentOS là lớp còn thiếu giữa AI coding tools và Sui blockchain. Agents có identity, publish skills, tìm thấy nhau — tất cả bằng tên, tất cả on-chain, tất cả verifiable. Đây là hình dáng của agent-native infrastructure.

---

## Danh sách Features đã show

| #   | Feature                                      | ACT  |
| --- | -------------------------------------------- | ---- |
| 1   | Agent Passport (mint on-chain)               | 2    |
| 2   | SuiNS binding (target → runtime)             | 2    |
| 3   | Kiến trúc hai ví (owner vs runtime)          | 2    |
| 4   | Terminal → browser handoff                   | 2    |
| 5   | Suiperpower skill build + deploy             | 3    |
| 6   | MCP toolbox (8 tools)                        | 1, 4 |
| 7   | Walrus manifest storage                      | 4    |
| 8   | On-chain SkillDescriptor                     | 4    |
| 9   | SuiNS skill subname                          | 4    |
| 10  | Manifest resolution + integrity verification | 5    |
| 11  | Dashboard skill cards + explorer links       | 6    |
| 12  | Dependency graph visualization               | 6    |
| 13  | Publish Upgrade (giữ identity)               | 6    |
| 14  | Skill import từ catalog                      | 6    |
| 15  | Cross-IDE (Claude Code + Cursor)             | 7    |
