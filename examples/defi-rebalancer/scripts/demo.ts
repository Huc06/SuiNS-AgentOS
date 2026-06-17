/**
 * DeFi Rebalancer — Demo Runner
 *
 * This script demonstrates the full lifecycle of the trading agent skill:
 * 1. Create a portfolio with spending limits
 * 2. Agent proposes a rebalancing trade
 * 3. User approves the trade proposal
 * 4. Trade is executed on-chain
 *
 * NOTE: In a real deployment, the import below would be:
 *   import { AgentOSClient } from "@agentos/sdk";
 * This demo is provided as documentation for the expected integration flow.
 */

// import { AgentOSClient } from "@agentos/sdk";
// ^^^ Uncomment and install @agentos/sdk when using in a real project

interface TradeProposal {
  portfolioId: string;
  assetFrom: string;
  assetTo: string;
  amountFrom: number;
  estimatedAmountTo: number;
}

interface Portfolio {
  id: string;
  agentOwner: string;
  userOwner: string;
  dailyLimit: number;
  perTradeLimit: number;
  dailySpent: number;
  isActive: boolean;
}

async function main() {
  console.log("=== DeFi Rebalancer Agent Demo ===\n");

  // Step 1: Initialize agent client (would connect to Sui network)
  console.log("1. Initializing agent client...");
  // const client = new AgentOSClient({ network: "testnet" });

  // Step 2: Create a portfolio with limits
  console.log("2. Creating portfolio with spending limits...");
  const portfolioConfig = {
    agentOwner: "0xAGENT_ADDRESS",
    dailyLimit: 10_000_000, // 10 SUI in MIST
    perTradeLimit: 2_000_000, // 2 SUI max per trade
  };
  console.log(`   Daily limit: ${portfolioConfig.dailyLimit} MIST`);
  console.log(`   Per-trade limit: ${portfolioConfig.perTradeLimit} MIST`);

  // Step 3: Agent proposes a rebalance trade
  console.log("\n3. Agent proposing rebalance trade...");
  const proposal: TradeProposal = {
    portfolioId: "0xPORTFOLIO_ID",
    assetFrom: "SUI",
    assetTo: "USDC",
    amountFrom: 1_500_000,
    estimatedAmountTo: 500_000,
  };
  console.log(
    `   Swap ${proposal.amountFrom} ${proposal.assetFrom} → ~${proposal.estimatedAmountTo} ${proposal.assetTo}`,
  );

  // Step 4: User (or automated policy) approves
  console.log("\n4. User approving trade proposal...");
  console.log("   ✓ Proposal approved");

  // Step 5: Execute the trade
  console.log("\n5. Executing trade on-chain...");
  console.log("   ✓ Trade executed successfully");
  console.log(
    `   Final: ${proposal.amountFrom} ${proposal.assetFrom} → ${proposal.estimatedAmountTo} ${proposal.assetTo}`,
  );

  // Step 6: Demonstrate kill switch
  console.log("\n6. Demonstrating kill switch...");
  console.log("   ✓ Portfolio deactivated by user");
  console.log("   ✗ Agent can no longer propose trades");

  console.log("\n=== Demo Complete ===");
}

main().catch(console.error);
