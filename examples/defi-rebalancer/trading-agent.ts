import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

export interface Signer {
  getPublicKey: () => Promise<any>;
  signTransaction: (tx: Transaction) => Promise<{ transactionBlockBytes: string; signature: string }>;
  signAndExecuteTransaction: (options: { transaction: Transaction }) => Promise<{ digest: string; effects?: any }>;
}

/**
 * Spending limits for autonomous trading agent
 */
export interface SpendingLimits {
  perTradeLimitSui: number;
  dailyLimitSui: number;
}

/**
 * Agent wallet with spending limit enforcement
 */
export class AgentWallet {
  private signer: Signer;
  private spendingLimits: SpendingLimits;
  private dailySpent: number = 0;
  private lastReset: number = Date.now();

  constructor(signer: Signer, limits: SpendingLimits) {
    this.signer = signer;
    this.spendingLimits = limits;
  }

  /**
   * Check if a trade amount is within spending limits
   */
  canExecuteTrade(amountSui: number): boolean {
    if (amountSui > this.spendingLimits.perTradeLimitSui) {
      console.warn(
        `Trade amount ${amountSui} exceeds per-trade limit ${this.spendingLimits.perTradeLimitSui}`
      );
      return false;
    }

    // Reset daily counter if 24 hours have passed
    const now = Date.now();
    if (now - this.lastReset > 24 * 60 * 60 * 1000) {
      this.dailySpent = 0;
      this.lastReset = now;
    }

    if (this.dailySpent + amountSui > this.spendingLimits.dailyLimitSui) {
      console.warn(
        `Trade would exceed daily limit. Current: ${this.dailySpent}, Requested: ${amountSui}, Limit: ${this.spendingLimits.dailyLimitSui}`
      );
      return false;
    }

    return true;
  }

  /**
   * Record a trade execution for limit tracking
   */
  recordTrade(amountSui: number): void {
    this.dailySpent += amountSui;
  }

  /**
   * Get remaining daily budget
   */
  getRemainingDailyBudget(): number {
    return Math.max(0, this.spendingLimits.dailyLimitSui - this.dailySpent);
  }

  /**
   * Get signer for transaction signing
   */
  getSigner(): Signer {
    return this.signer;
  }
}

/**
 * Memory store for agent trading decisions (integrates with MemWal)
 */
export interface TradeMemory {
  portfolioId: string;
  targetAllocation: Record<string, number>;
  tradingHistory: TradeRecord[];
  lastRebalanceTime: number;
  riskProfile: "conservative" | "moderate" | "aggressive";
}

export interface TradeRecord {
  timestamp: number;
  assetFrom: string;
  assetTo: string;
  amountFrom: number;
  amountTo: number;
  approvalStatus: "pending" | "approved" | "executed";
}

/**
 * Autonomous trading agent that executes trades on behalf of a portfolio
 */
export class TradingAgent {
  private client: SuiClient;
  private wallet: AgentWallet;
  private memory: TradeMemory;
  private approvalRequired: boolean;

  constructor(
    client: SuiClient,
    wallet: AgentWallet,
    portfolioId: string,
    approvalRequired: boolean = true
  ) {
    this.client = client;
    this.wallet = wallet;
    this.approvalRequired = approvalRequired;
    this.memory = {
      portfolioId,
      targetAllocation: {},
      tradingHistory: [],
      lastRebalanceTime: Date.now(),
      riskProfile: "moderate",
    };
  }

  /**
   * Propose a trade within spending limits
   */
  async proposeTrade(
    assetFrom: string,
    assetTo: string,
    amountFrom: number,
    estimatedAmountTo: number
  ): Promise<TradeRecord> {
    if (!this.wallet.canExecuteTrade(amountFrom)) {
      throw new Error(
        `Trade amount ${amountFrom} violates spending limits. Remaining daily budget: ${this.wallet.getRemainingDailyBudget()}`
      );
    }

    const record: TradeRecord = {
      timestamp: Date.now(),
      assetFrom,
      assetTo,
      amountFrom,
      amountTo: estimatedAmountTo,
      approvalStatus: this.approvalRequired ? "pending" : "approved",
    };

    // Store in memory
    this.memory.tradingHistory.push(record);

    return record;
  }

  /**
   * Approve a pending trade (user action)
   */
  approveTrade(tradeIndex: number): void {
    if (tradeIndex < 0 || tradeIndex >= this.memory.tradingHistory.length) {
      throw new Error("Invalid trade index");
    }
    const trade = this.memory.tradingHistory[tradeIndex];
    if (trade.approvalStatus !== "pending") {
      throw new Error(
        `Trade already ${trade.approvalStatus}, cannot approve again`
      );
    }
    trade.approvalStatus = "approved";
  }

  /**
   * Execute an approved trade via PTB
   */
  async executeTrade(
    tradeIndex: number,
    packageId: string,
    portfolioObjectId: string
  ): Promise<{ digest: string; trade: TradeRecord }> {
    if (tradeIndex < 0 || tradeIndex >= this.memory.tradingHistory.length) {
      throw new Error("Invalid trade index");
    }

    const trade = this.memory.tradingHistory[tradeIndex];
    if (trade.approvalStatus !== "approved") {
      throw new Error(
        `Trade must be approved before execution. Current status: ${trade.approvalStatus}`
      );
    }

    // Build PTB for trade execution
    const tx = new Transaction();

    // Call the Move function to execute the trade
    // This is a placeholder - actual implementation depends on DeepBook or other DEX integration
    tx.moveCall({
      target: `${packageId}::trading_agent::execute_trade`,
      arguments: [
        tx.object(portfolioObjectId),
        tx.pure.string(trade.assetFrom),
        tx.pure.string(trade.assetTo),
        tx.pure.u64(BigInt(trade.amountFrom)),
        tx.pure.u64(BigInt(trade.amountTo)),
      ],
    });

    // Sign and execute
    const signer = this.wallet.getSigner();
    const result = await signer.signAndExecuteTransaction({ transaction: tx });

    // Update memory and spending limits
    this.wallet.recordTrade(trade.amountFrom);
    trade.approvalStatus = "executed";

    return {
      digest: result.digest,
      trade,
    };
  }

  /**
   * Update target allocation for portfolio rebalancing
   */
  setTargetAllocation(allocation: Record<string, number>): void {
    const total = Object.values(allocation).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1.0) > 0.01) {
      throw new Error(`Allocation must sum to 1.0, got ${total}`);
    }
    this.memory.targetAllocation = allocation;
  }

  /**
   * Get pending trades awaiting approval
   */
  getPendingTrades(): TradeRecord[] {
    return this.memory.tradingHistory.filter(
      (t) => t.approvalStatus === "pending"
    );
  }

  /**
   * Get executed trades (for audit trail)
   */
  getExecutedTrades(): TradeRecord[] {
    return this.memory.tradingHistory.filter(
      (t) => t.approvalStatus === "executed"
    );
  }

  /**
   * Get agent memory state
   */
  getMemory(): TradeMemory {
    return { ...this.memory };
  }

  /**
   * Set agent risk profile (for decision-making)
   */
  setRiskProfile(profile: "conservative" | "moderate" | "aggressive"): void {
    this.memory.riskProfile = profile;
  }

  /**
   * Get remaining daily budget
   */
  getRemainingBudget(): number {
    return this.wallet.getRemainingDailyBudget();
  }
}

/**
 * MemWal integration for persistent agent memory
 * Usage: initialize with MemWal credentials, use remember() and recall()
 */
export interface MemWalConfig {
  delegateKey: string;
  accountId: string;
  serverUrl: string;
  namespace: string;
}

/**
 * Helper to serialize/deserialize trade memory for MemWal
 */
export const TradeMemoryCodec = {
  encode: (memory: TradeMemory): string => JSON.stringify(memory),
  decode: (json: string): TradeMemory => JSON.parse(json),
};
