import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentWallet, TradingAgent, type SpendingLimits, type Signer } from "./trading-agent";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";

describe("TradingAgent", () => {
  let mockSigner: Signer;
  let wallet: AgentWallet;
  let client: SuiClient;
  let agent: TradingAgent;

  const spendingLimits: SpendingLimits = {
    perTradeLimitSui: 10,
    dailyLimitSui: 100,
  };

  beforeEach(() => {
    // Create mock signer
    mockSigner = {
      getPublicKey: vi.fn(),
      signTransaction: vi.fn(),
      signAndExecuteTransaction: vi.fn().mockResolvedValue({
        digest: "0x123abc",
        effects: {},
      }),
    } as any;

    // Initialize client and wallet
    client = new SuiClient({
      url: getFullnodeUrl("testnet"),
    });

    wallet = new AgentWallet(mockSigner, spendingLimits);
    agent = new TradingAgent(client, wallet, "portfolio_0x123", true);
  });

  describe("AgentWallet - Spending Limits", () => {
    it("allows trade within per-trade limit", () => {
      const canExecute = wallet.canExecuteTrade(5);
      expect(canExecute).toBe(true);
    });

    it("rejects trade exceeding per-trade limit", () => {
      const canExecute = wallet.canExecuteTrade(15);
      expect(canExecute).toBe(false);
    });

    it("tracks daily spending", () => {
      wallet.canExecuteTrade(30); // under daily but over per-trade limit
      wallet.recordTrade(30);
      expect(wallet.getRemainingDailyBudget()).toBe(70);
    });

    it("enforces daily limit", () => {
      // Record trades that approach the daily limit
      wallet.recordTrade(50);
      wallet.recordTrade(40);

      const canExecute = wallet.canExecuteTrade(20); // Would exceed daily limit
      expect(canExecute).toBe(false);
    });

    it("allows trade at maximum daily limit", () => {
      wallet.recordTrade(90);
      const canExecute = wallet.canExecuteTrade(10);
      expect(canExecute).toBe(true);
    });
  });

  describe("TradingAgent - Trade Proposal", () => {
    it("creates a trade proposal with pending status", async () => {
      const trade = await agent.proposeTrade("ETH", "USDC", 5, 8000);

      expect(trade.assetFrom).toBe("ETH");
      expect(trade.assetTo).toBe("USDC");
      expect(trade.amountFrom).toBe(5);
      expect(trade.amountTo).toBe(8000);
      expect(trade.approvalStatus).toBe("pending");
    });

    it("rejects trade proposal exceeding spending limit", async () => {
      const promise = agent.proposeTrade("ETH", "USDC", 15, 24000);
      await expect(promise).rejects.toThrow("violates spending limits");
    });

    it("tracks trade history", async () => {
      await agent.proposeTrade("ETH", "USDC", 5, 8000);
      await agent.proposeTrade("BTC", "USDC", 2, 80000);

      const history = agent.getMemory().tradingHistory;
      expect(history).toHaveLength(2);
      expect(history[0].assetFrom).toBe("ETH");
      expect(history[1].assetFrom).toBe("BTC");
    });
  });

  describe("TradingAgent - Approval & Execution", () => {
    it("approves a pending trade", async () => {
      await agent.proposeTrade("ETH", "USDC", 5, 8000);

      agent.approveTrade(0);

      const approved = agent.getMemory().tradingHistory[0];
      expect(approved.approvalStatus).toBe("approved");
    });

    it("prevents double approval", async () => {
      await agent.proposeTrade("ETH", "USDC", 5, 8000);
      agent.approveTrade(0);

      expect(() => agent.approveTrade(0)).toThrow("already approved");
    });

    it("prevents execution of non-approved trade", async () => {
      await agent.proposeTrade("ETH", "USDC", 5, 8000);

      const promise = agent.executeTrade(0, "0xpkg", "0xportfolio");
      await expect(promise).rejects.toThrow("must be approved");
    });

    it("marks trade as executed after PTB execution", async () => {
      await agent.proposeTrade("ETH", "USDC", 5, 8000);
      agent.approveTrade(0);

      const result = await agent.executeTrade(0, "0xpkg", "0xportfolio");

      expect(result.digest).toBe("0x123abc");
      expect(result.trade.approvalStatus).toBe("executed");
    });

    it("records executed trade in history", async () => {
      await agent.proposeTrade("ETH", "USDC", 5, 8000);
      agent.approveTrade(0);
      await agent.executeTrade(0, "0xpkg", "0xportfolio");

      const executed = agent.getExecutedTrades();
      expect(executed).toHaveLength(1);
      expect(executed[0].assetFrom).toBe("ETH");
    });
  });

  describe("TradingAgent - Portfolio Management", () => {
    it("sets target allocation", () => {
      const allocation = { ETH: 0.4, BTC: 0.3, USDC: 0.3 };
      agent.setTargetAllocation(allocation);

      expect(agent.getMemory().targetAllocation).toEqual(allocation);
    });

    it("rejects invalid allocation (doesn't sum to 1)", () => {
      const allocation = { ETH: 0.4, BTC: 0.3 }; // Sum = 0.7
      expect(() => agent.setTargetAllocation(allocation)).toThrow(
        "must sum to 1.0"
      );
    });

    it("sets risk profile", () => {
      agent.setRiskProfile("aggressive");
      expect(agent.getMemory().riskProfile).toBe("aggressive");
    });
  });

  describe("TradingAgent - Pending Trades", () => {
    it("retrieves pending trades", async () => {
      await agent.proposeTrade("ETH", "USDC", 5, 8000);
      await agent.proposeTrade("BTC", "USDC", 2, 80000);
      agent.approveTrade(1); // Approve only the second one

      const pending = agent.getPendingTrades();
      expect(pending).toHaveLength(1);
      expect(pending[0].assetFrom).toBe("ETH");
    });

    it("returns empty array when no pending trades", async () => {
      await agent.proposeTrade("ETH", "USDC", 5, 8000);
      agent.approveTrade(0);

      const pending = agent.getPendingTrades();
      expect(pending).toHaveLength(0);
    });
  });

  describe("TradingAgent - Budget Tracking", () => {
    it("tracks remaining daily budget", async () => {
      await agent.proposeTrade("ETH", "USDC", 5, 8000);
      agent.approveTrade(0);
      await agent.executeTrade(0, "0xpkg", "0xportfolio");

      const remaining = agent.getRemainingBudget();
      expect(remaining).toBe(95); // 100 - 5
    });
  });
});
