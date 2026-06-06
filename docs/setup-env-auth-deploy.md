# Setup: env, Enoki, auth, deploy

**Trạng thái repo:** Frontend wire Enoki + sponsor API + registry `/create`. Cần env keys + `packageId` cho mint on-chain. UX SuiNS (hai nhánh, bind trên web): [create-agent-ux.md](./create-agent-ux.md).

---

## 1. Cần setup env chưa?

| Môi trường | Bắt buộc hôm nay? | Ghi chú |
|------------|-------------------|---------|
| Local `pnpm dev` | Không | Wallet Connect + mock registry đủ demo |
| GitHub Actions CI | Không thêm secret | CI chỉ build/test |
| GitHub `testnet` env | Có (khi publish Move) | `SUI_PRIVATE_KEY`, `SUI_RPC_URL` |
| Enoki + auth | Có (khi làm #11) | 2 API key Enoki + biến frontend |
| Cloudflare Pages | Có (khi deploy UI) | Env + domain |

---

## 2. Enoki + auth (Passkey / zkLogin + sponsor gas)

Tạo project tại [Enoki Portal](https://portal.enoki.mystenlabs.com) (Mysten).

### Hai loại API key (bắt buộc tách)

| Key | Loại | Feature | Dùng ở đâu |
|-----|------|---------|------------|
| **Public** | Public | zkLogin, network **Testnet** | Frontend `NEXT_PUBLIC_ENOKI_API_KEY` |
| **Private** | Private | Sponsored transactions, Testnet | Backend / API route `ENOKI_SECRET_KEY` — **không** đưa vào browser |

### Enoki Portal — Sponsored transactions (sau khi có `packageId`)

Trong project → **Sponsored Transactions**, allowlist:

- **Move call targets** (sau publish testnet):
  - `0xYOUR_PACKAGE_ID::agent_passport::create`
  - (hex package id từ [publish-testnet.md](./publish-testnet.md))
- **Addresses** (tuỳ chính sách): địa chỉ sponsor hoặc để trống theo doc Enoki.

### Auth flow

1. User **Sign in with Google** (Enoki zkLogin / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` override).
2. (Optional) Enoki **sponsor** mint `agent_passport::create`.
3. **SuiNS bind** trên `/create` — ví browser ký; xem [create-agent-ux.md](./create-agent-ux.md). Phí mua name trên suins.io do user trả, không sponsor được.

Tham khảo: [Enoki sponsored transactions](https://docs.enoki.mystenlabs.com/ts-sdk/sponsored-transactions), [example app](https://github.com/sui-foundation/enoki-example-app).

---

## 3. Google — gửi anh gì để add Console?

**Trường hợp A — Enoki quản lý OAuth (thường gặp):**

1. Em tạo app trên **Enoki Portal**, bật provider **Google**.
2. Portal hiện **Redirect URI** / hướng dẫn — copy URI đó.
3. Gửi anh (admin Google Cloud):
   - **Authorized redirect URIs** = URI từ Enoki (từng môi trường: local + staging + production).
   - **Authorized JavaScript origins** (nếu Console yêu cầu):
     - `http://localhost:3000`
     - `https://<domain-production>.pages.dev` hoặc custom domain
4. Sau khi anh tạo **OAuth 2.0 Client ID (Web application)**:
   - Anh gửi lại em: **Client ID** (và **Client secret** nếu Enoki Portal yêu cầu nhập tay).
   - Em paste vào **Enoki Portal** (mục Google provider), **không** commit secret vào git.

**Trường hợp B — Chỉ dùng `@mysten/dapp-kit` zkLogin không qua Enoki:** cần OAuth client riêng theo [Sui zkLogin doc](https://docs.sui.io/concepts/cryptography/zklogin-integration) — team nên thống nhất **một** hướng (khuyến nghị Enoki cho sponsor + login).

**Email gửi anh (mẫu):**

> Anh add giúp OAuth Web client cho AgentOS zkLogin.  
> Redirect URIs: `<paste từ Enoki Portal>`  
> Origins: `http://localhost:3000`, `https://<staging-domain>`  
> Sau khi tạo xong gửi em Client ID (Web) để em nhập Enoki Portal.

---

## 4. Cloudflare — email em gửi anh

Anh (owner Cloudflare) **invite member** → em login deploy Pages.

**Em gửi anh:**

- Email đăng nhập Cloudflare (email công ty / email em dùng nhận invite).
- GitHub account em dùng (nếu connect repo qua GitHub).

**Quyền đề xuất:** *Cloudflare Pages* — **Edit** (đủ deploy preview + production; không cần Super Admin).

**Sau khi được add — env trên Cloudflare Pages (Production + Preview):**

| Variable | Secret? | Ghi chú |
|----------|---------|---------|
| `NEXT_PUBLIC_ENOKI_API_KEY` | No (public key) | Enoki public |
| `ENOKI_SECRET_KEY` | **Yes** | Enoki private |
| `NEXT_PUBLIC_SUI_NETWORK` | No | `testnet` |
| `AGENTOS_PACKAGE_ID` | No | Sau publish #6 |
| `AGENTOS_REGISTRY_PATH` | No | Tuỳ chọn nếu server đọc registry |

Build command (gợi ý): `cd ../.. && pnpm install && pnpm build --filter=@agentos/frontend`  
Root directory: `packages/frontend`  
Framework preset: Next.js

---

## 5. GitHub Secrets (environment `testnet`)

Cho workflow `cd.yml` → publish contracts:

| Secret | Mô tả |
|--------|--------|
| `SUI_PRIVATE_KEY` | `suiprivkey1...` — ví deploy testnet |
| `SUI_RPC_URL` | `https://fullnode.testnet.sui.io:443` (hoặc RPC riêng) |

---

## 6. Thứ tự làm việc đề xuất

1. Anh add em vào **Cloudflare** + connect repo `SuiNS-AgentOS`.
2. Team publish contracts → lấy `packageId` → Enoki allowlist move targets.
3. Enoki Portal: public + private keys → Cloudflare env.
4. Google OAuth (nếu Enoki yêu cầu) — redirect URIs ↔ Client ID.
5. Implement #11 trên frontend `/create` + API sponsor route.

---

## 7. Chưa cần ngay

- Mainnet Enoki billing
- Production sponsor budget / rate limits ops
- In-app SuiNS pricing (v1 redirect suins.io — [create-agent-ux.md](./create-agent-ux.md))
