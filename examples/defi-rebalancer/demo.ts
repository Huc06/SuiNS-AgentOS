/**
 * Trading Agent Demo
 *
 * This example demonstrates:
 * 1. Creating an agent wallet with spending limits
 * 2. Proposing trades within those limits
 * 3. Approving trades (hybrid control)
 * 4. Executing trades via PTB
 * 5. Tracking agent memory and audit trails
 *
 * To run on testnet, you need:
 * - A Sui keypair (for the agent)
 * - A funded Sui address
 * - Published move contracts (trading_agent module)
 * - A portfolio object on-chain
 */

import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Signer } from "@mysten/sui/signers";
import {
  AgentWallet,
  TradingAgent,
  type SpendingLimits,
} from "@agentos/sdk";

// Initialize Sui client (testnet)
const client = new SuiClient({
  url: getFullnodeUrl("testnet"),
});

/**
 * Example 1: Set up agent wallet with spending limits
 */
async function setupAgentWallet() {
  // In production, load from env: const keypair = Ed25519Keypair.fromSecretKey(process.env.AGENT_KEYPAIR!);
  const keypair = Ed25519Keypair.generate();
  const signer: Signer = {
    getPublicKey: async () => keypair.getPublicKey(),
    signTransaction: async (tx) => keypair.signTransaction(tx),
    signAndExecuteTransaction: async ({ transaction }) => {
      const signedTx = await keypair.signTransaction(transaction);
      return client.executeTransactionBlock({
        transactionBlock: signedTx.transactionBlockBytes,
        signature: signedTx.signature,
        options: { showEffects: true },
      });
    },
  };

  // Define spending limits
  const limits: SpendingLimits = {
    perTradeLimitSui: 10, // Max 10 SUI per trade
    dailyLimitSui: 100, // Max 100 SUI per day
  };

  const wallet = new AgentWallet(signer, limits);

  console.log("✅ Agent wallet created with:");
  console.log(`   - Per-trade limit: ${limits.perTradeLimitSui} SUI`);
  console.log(`   - Daily limit: ${limits.dailyLimitSui} SUI`);

  return { wallet, signer };
}

/**
 * Example 2: Propose and approve trades
 */
async function executeTradingWorkflow() {
  const { wallet, signer } = await setupAgentWallet();

  // Create trading agent for a portfolio
  const portfolioId = "0xportfolio_example"; // Replace with real portfolio object ID
  const agent = new TradingAgent(client, wallet, portfolioId, true); // Hybrid = requires approval

  // Set target allocation (e.g., 40% ETH, 30% BTC, 30% USDC)
  agent.setTargetAllocation({
    ETH: 0.4,
    BTC: 0.3,
    USDC: 0.3,
  });

  console.log(
    "\n📊 Portfolio target allocation set: 40% ETH, 30% BTC, 30% USDC"
  );

  // Agent proposes trades to reach target allocation
  console.log("\n🤖 Agent proposing trades:");

  // Trade 1: Buy ETH with USDC
  const trade1 = await agent.proposeTrade("USDC", "ETH", 5, 3); // 5 USDC → 3 ETH
  console.log(`   [1] Pending: USDC → ETH (5 → 3)`);

  // Trade 2: Buy BTC with USDC
  const trade2 = await agent.proposeTrade("USDC", "BTC", 3, 0.1); // 3 USDC → 0.1 BTC
  console.log(`   [2] Pending: USDC → BTC (3 → 0.1)`);

  // Check pending trades
  const pending = agent.getPendingTrades();
  console.log(`\n⏳ Pending approval: ${pending.length} trades`);
  pending.forEach((trade, idx) => {
    console.log(
      `   [${idx + 1}] ${trade.assetFrom} → ${trade.assetTo} (${trade.amountFrom} → ${trade.amountTo})`
    );
  });

  // User approves trades
  console.log("\n👤 User approving trades:");
  agent.approveTrade(0);
  console.log(`   ✓ Approved trade 1`);
  agent.approveTrade(1);
  console.log(`   ✓ Approved trade 2`);

  // Execute approved trades (would execute on-chain if objects exist)
  console.log("\n⚙️  Executing trades via PTB:");
  const packageId = "0xpackage_example"; // Replace with published package ID

  try {
    // This will succeed in test but fail on-chain without real objects
    const result1 = await agent.executeTrade(0, packageId, portfolioId);
    console.log(`   ✓ Trade 1 executed: ${result1.digest.slice(0, 10)}...`);
  } catch (e) {
    console.log(`   ⚠️  Trade 1 execution failed (expected without real objects)`);
  }

  try {
    const result2 = await agent.executeTrade(1, packageId, portfolioId);
    console.log(`   ✓ Trade 2 executed: ${result2.digest.slice(0, 10)}...`);
  } catch (e) {
    console.log(`   ⚠️  Trade 2 execution failed (expected without real objects)`);
  }

  // Check agent memory and audit trail
  console.log("\n📝 Agent Memory & Audit Trail:");
  const memory = agent.getMemory();
  console.log(`   - Portfolio ID: ${memory.portfolioId}`);
  console.log(`   - Risk profile: ${memory.riskProfile}`);
  console.log(`   - Target allocation: ${JSON.stringify(memory.targetAllocation)}`);
  console.log(`   - Total trades: ${memory.tradingHistory.length}`);

  const executed = agent.getExecutedTrades();
  console.log(`   - Executed trades: ${executed.length}`);

  // Check spending limits
  console.log("\n💰 Spending Limits:");
  console.log(`   - Remaining daily budget: ${agent.getRemainingBudget()} SUI`);
  console.log(`   - Wallet public key: ${signer}`);
}

/**
 * Example 3: Handle spending limit violations
 */
async function demonstirateSpendingLimits() {
  const { wallet } = await setupAgentWallet();
  const agent = new TradingAgent(
    client,
    wallet,
    "0xportfolio_example",
    true
  );

  console.log("\n\n=== Spending Limit Enforcement ===");

  // Within limit - succeeds
  console.log("\n✅ Trade within limit (5 SUI):");
  try {
    const trade = await agent.proposeTrade("USDC", "ETH", 5, 3);
    console.log(`   Proposed successfully`);
  } catch (e) {
    console.log(`   Failed: ${e}`);
  }

  // Exceeds per-trade limit - fails
  console.log("\n❌ Trade exceeding per-trade limit (20 SUI > 10 SUI limit):");
  try {
    const trade = await agent.proposeTrade("USDC", "ETH", 20, 12);
    console.log(`   Proposed successfully`);
  } catch (e) {
    console.log(`   Failed: ${(e as Error).message.substring(0, 60)}...`);
  }

  // Exceeds daily limit - fails
  console.log("\n❌ Trade exceeding daily limit (110 SUI > 100 SUI limit):");
  // First fill up the daily budget
  const agent2 = new TradingAgent(
    client,
    wallet,
    "0xportfolio_example2",
    true
  );
  wallet.recordTrade(95);
  console.log(`   (Daily budget used: 95 SUI)`);

  try {
    const trade = await agent2.proposeTrade("USDC", "ETH", 10, 6);
    console.log(`   Proposed successfully`);
  } catch (e) {
    console.log(`   Failed: ${(e as Error).message.substring(0, 60)}...`);
  }
}

// Run the demos
async function main() {
  try {
    console.log("====================================");
    console.log("   Trading Agent on Sui - Demo");
    console.log("====================================");

    await executeTradingWorkflow();
    await demonstirateSpendingLimits();

    console.log("\n\n✨ Trading Agent Demo Complete!");
    console.log("\nTo deploy to testnet:");
    console.log("1. Publish trading_agent.move module");
    console.log("2. Create a Portfolio on-chain");
    console.log("3. Set real packageId and portfolioId in this example");
    console.log("4. Fund the agent wallet with SUI for gas");
  } catch (error) {
    console.error("Error running demo:", error);
  }
}

main();
