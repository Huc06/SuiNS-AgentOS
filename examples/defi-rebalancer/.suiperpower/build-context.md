# AgentOS Trading Agent Build Context

## build-ai-agent Session, 2026-06-14

### Agent Purpose
Autonomous portfolio management and trading agent that executes rebalancing trades with hybrid approval control (agent proposes, user approves execution).

### Architecture Decisions

**Wallet Pattern:** Hybrid (server keypair + user approval)
- Agent holds Ed25519 keypair in environment variable (never hardcoded)
- Spending limits enforce per-trade and daily caps (kill switch)
- User retains approval authority for all trades

**Compute:** Local/standard LLM API
- No TEE requirement; agent uses local inference or standard API
- Ready to integrate with Atoma or Nautilus if future versions need verifiable inference

**Memory:** MemWal integration planned
- Agent stores trading history, target allocations, risk profile
- Persistent state enables multi-session decision-making
- Trade audit trail for compliance and analysis

**Coordination:** Events + shared objects
- Trades emit `TradeExecuted` events for listeners
- Portfolio state stored as Shared Object on-chain
- Multi-agent swarms could coordinate via shared objects or event streams

**PTB Pattern:** Atomic multi-call transactions
- Each trade = single PTB: [check balance → execute swap → update portfolio → emit event]
- No partial failures; either entire trade succeeds or rolls back

---

## Implementation Summary

### Move Contracts
**File:** `packages/contracts/sources/trading_agent.move`

Defines:
- `Portfolio` - on-chain portfolio state (assets, trading history, daily spent, limits)
- `TradeProposal` - proposal struct with approval/execution flags
- `TradeExecuted` - event emitted on successful trade
- `PendingApproval` - event emitted when trade awaits user approval

Functions:
- `create_portfolio()` - initialize portfolio with daily and per-trade limits
- `propose_trade()` - agent proposes trade, checks limits, emits `PendingApproval`
- `approve_proposal()` - user signs to approve a pending trade
- `execute_trade()` - atomic execution via PTB (requires approved proposal)
- `deactivate()` - user can kill-switch the agent

Safety:
- Enforces spending limits before proposal (prevents DoS via limit checks)
- Requires explicit approval flag before execution (hybrid control)
- Tracks daily spending with epoch-based reset

### TypeScript SDK
**File:** `packages/sdk/src/trading-agent.ts`

Classes:
- `AgentWallet` - client-side wallet with spending limit enforcement
  - `canExecuteTrade()` - check per-trade and daily limits
  - `recordTrade()` - update daily spending
  - `getRemainingDailyBudget()` - query remaining budget
  
- `TradingAgent` - autonomy layer that orchestrates trades
  - `proposeTrade()` - propose trade if within limits
  - `approveTrade()` - user approval (pending → approved state)
  - `executeTrade()` - compose PTB and sign/submit
  - `setTargetAllocation()` - portfolio rebalancing goal
  - `getPendingTrades()` - audit pending approvals
  - `getExecutedTrades()` - audit trail of executed trades
  - `getMemory()` - snapshot of agent decision state

State:
- `TradeMemory` - persistent agent memory (portfolio, history, allocation, risk profile)
- `TradeRecord` - individual trade with timestamps and approval status

Exports:
- `AgentWallet`, `TradingAgent`, `TradeMemoryCodec` from main SDK (see `index.ts`)

### Tests
**File:** `packages/sdk/src/trading-agent.test.ts`

Coverage: 19 tests, 100% pass
- AgentWallet: per-trade limits, daily limits, reset logic
- TradingAgent: proposal, approval, execution, audit trail
- Spending limits: enforcement, edge cases, daily budget tracking
- Portfolio management: target allocation, risk profile
- Errors: double-approval, execution before approval, invalid allocation

All tests pass ✅

### Example
**File:** `examples/trading-agent-demo.ts`

Demonstrates:
1. **Setup:** Create agent wallet with spending limits
2. **Target allocation:** 40% ETH, 30% BTC, 30% USDC
3. **Proposal:** Agent proposes 2 trades to rebalance
4. **Approval:** User approves trades
5. **Execution:** PTB execution (fails gracefully without on-chain objects)
6. **Audit:** Query trading history, memory, remaining budget
7. **Limits:** Show enforcement of spending limits with error handling

Ready to run against testnet portfolio.

---

## Deployment Checklist

### Move Contracts
- [x] `trading_agent.move` compiles without errors
- [ ] Publish to testnet: `sui client publish packages/contracts --gas-budget 200000000`
- [ ] Note package ID and use in example

### Walrus/MemWal (Optional)
- [ ] Initialize MemWal with delegate key, account ID, namespace
- [ ] Update `TradingAgent` to call `mw.remember()` after each trade
- [ ] Update `TradingAgent` to call `mw.recall()` on initialization

### Testnet Validation
- [ ] Fund agent wallet with ~100 SUI for gas
- [ ] Create Portfolio object on testnet
- [ ] Run demo against real objects
- [ ] Verify:
  - Trade proposal succeeds
  - Spending limits enforced
  - Approval gate works
  - PTB executes atomic swap
  - Events emitted correctly

### Custody & Risk
- [x] Spending limits configured (per-trade + daily)
- [x] User approval gate (hybrid model)
- [x] Kill-switch (`deactivate()`) available
- [ ] Private keys stored in env var `AGENT_KEYPAIR` (not hardcoded)
- [ ] Daily limit set conservatively during beta
- [ ] Monitoring/alerting on approaching limits (future)

### Production Readiness
- [ ] Move to DEX integration (DeepBook, Cetus, etc.) instead of placeholder
- [ ] Integrate real MemWal for persistent strategy storage
- [ ] Add event listener for rebalance triggers
- [ ] Implement `recall()` to restore strategy from MemWal on startup
- [ ] Add rate limiting to prevent rapid fire trades
- [ ] Comprehensive error handling for on-chain failures
- [ ] Multi-signature approval for large trades (>10% of portfolio)

---

## Open Issues

1. **DEX Integration:** Currently placeholder PTB calls to `execute_trade()`. Replace with real DeepBook or Cetus swap logic.

2. **MemWal Integration:** Add `@mysten-incubation/memwal` dependency and wire up:
   - `mw.remember('portfolio_decisions', agent.getMemory())`
   - `const memory = await mw.recall('portfolio_decisions')`

3. **Event Listener:** Poll `queryEvents()` to listen for rebalance signals or schedule-based triggers:
   ```typescript
   const events = await client.queryEvents({
     query: { MoveEventType: `${packageId}::trading_agent::TradeExecuted` }
   });
   ```

4. **Rate Limiting:** Add cooldown between trade proposals to prevent DOS.

5. **Multi-Sig Approval:** For trades >10% of portfolio value, require 2-of-2 or 3-of-5 approvals.

6. **Failure Recovery:** Handle partial PTB failures (e.g., insufficient liquidity). Current design rolls back; may want retry logic.

7. **Gas Optimization:** Profile Move contract; consider batch operations for multiple trades.

---

## Files Changed
- `packages/contracts/sources/trading_agent.move` (new, 220 lines)
- `packages/sdk/src/trading-agent.ts` (new, 300 lines)
- `packages/sdk/src/trading-agent.test.ts` (new, 250 lines)
- `packages/sdk/src/index.ts` (modified, added exports)
- `examples/trading-agent-demo.ts` (new, 200 lines)

## Next Steps
1. Publish Move contracts to testnet
2. Run `trading-agent-demo.ts` against real testnet portfolio
3. Implement DEX integration (swap logic)
4. Add MemWal for persistent memory
5. Deploy to mainnet with conservative spending limits

---

## Quality Gate Results
- ✅ Tests pass (19/19)
- ✅ Move contracts compile
- ✅ Spending limits enforced (per-trade + daily)
- ✅ Hybrid approval model (agent proposes, user approves)
- ✅ Kill-switch available (`deactivate()`)
- ✅ Audit trail captured (TradeMemory + events)
- ⏳ PTB execution (ready, awaits on-chain objects)
- ⏳ MemWal integration (planned, not yet wired)

**Status:** Ready for testnet validation.
