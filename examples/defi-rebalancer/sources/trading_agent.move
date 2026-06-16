module defi_rebalancer::trading_agent;

use std::string::String;
use std::vector;
use sui::event;
use sui::object;
use sui::table::{Self, Table};
use sui::tx_context::{Self, TxContext};

const ERROR_UNAUTHORIZED: u64 = 0;
const ERROR_SPENDING_LIMIT_EXCEEDED: u64 = 2;
const ERROR_APPROVAL_PENDING: u64 = 3;
const ERROR_NOT_APPROVED: u64 = 4;

public struct Portfolio has key, store {
    id: object::UID,
    agent_owner: address,
    user_owner: address,
    assets: Table<String, u64>,
    total_value: u64,
    trading_history: vector<TradeRecord>,
    daily_spent: u64,
    last_reset: u64,
    daily_limit: u64,
    per_trade_limit: u64,
    is_active: bool,
}

public struct TradeRecord has drop, store {
    timestamp: u64,
    asset_from: String,
    asset_to: String,
    amount_from: u64,
    amount_to: u64,
    approved_by: address,
}

public struct TradeProposal has key {
    id: object::UID,
    portfolio_id: object::ID,
    proposer: address,
    asset_from: String,
    asset_to: String,
    amount_from: u64,
    estimated_amount_to: u64,
    created_at: u64,
    approved: bool,
    executed: bool,
}

public struct TradeExecuted has copy, drop {
    portfolio_id: object::ID,
    asset_from: String,
    asset_to: String,
    amount_from: u64,
    amount_to: u64,
    executor: address,
    timestamp: u64,
}

public struct PendingApproval has copy, drop {
    portfolio_id: object::ID,
    proposal_id: object::ID,
    proposer: address,
    asset_from: String,
    asset_to: String,
    amount_from: u64,
    timestamp: u64,
}

public fun create_portfolio(
    agent_owner: address,
    daily_limit: u64,
    per_trade_limit: u64,
    ctx: &mut TxContext,
): Portfolio {
    assert!(daily_limit >= per_trade_limit, ERROR_SPENDING_LIMIT_EXCEEDED);
    Portfolio {
        id: object::new(ctx),
        agent_owner,
        user_owner: tx_context::sender(ctx),
        assets: table::new(ctx),
        total_value: 0,
        trading_history: vector[],
        daily_spent: 0,
        last_reset: tx_context::epoch(ctx),
        daily_limit,
        per_trade_limit,
        is_active: true,
    }
}

public fun propose_trade(
    portfolio: &mut Portfolio,
    asset_from: String,
    asset_to: String,
    amount_from: u64,
    estimated_amount_to: u64,
    ctx: &mut TxContext,
): TradeProposal {
    assert!(portfolio.is_active, ERROR_UNAUTHORIZED);
    let sender = tx_context::sender(ctx);
    assert!(sender == portfolio.agent_owner, ERROR_UNAUTHORIZED);
    assert!(amount_from <= portfolio.per_trade_limit, ERROR_SPENDING_LIMIT_EXCEEDED);
    assert!(
        portfolio.daily_spent + amount_from <= portfolio.daily_limit,
        ERROR_SPENDING_LIMIT_EXCEEDED,
    );

    let proposal = TradeProposal {
        id: object::new(ctx),
        portfolio_id: object::id(portfolio),
        proposer: sender,
        asset_from,
        asset_to,
        amount_from,
        estimated_amount_to,
        created_at: tx_context::epoch(ctx),
        approved: false,
        executed: false,
    };

    event::emit(PendingApproval {
        portfolio_id: object::id(portfolio),
        proposal_id: object::id(&proposal),
        proposer: sender,
        asset_from,
        asset_to,
        amount_from,
        timestamp: tx_context::epoch(ctx),
    });

    proposal
}

public fun approve_proposal(proposal: &mut TradeProposal, _ctx: &TxContext) {
    assert!(!proposal.executed, ERROR_APPROVAL_PENDING);
    proposal.approved = true;
}

public fun execute_trade(
    portfolio: &mut Portfolio,
    proposal: &mut TradeProposal,
    amount_to: u64,
    ctx: &mut TxContext,
) {
    let sender = tx_context::sender(ctx);
    assert!(portfolio.user_owner == sender || portfolio.agent_owner == sender, ERROR_UNAUTHORIZED);
    assert!(proposal.approved, ERROR_NOT_APPROVED);
    assert!(!proposal.executed, ERROR_APPROVAL_PENDING);

    portfolio.daily_spent = portfolio.daily_spent + proposal.amount_from;

    let record = TradeRecord {
        timestamp: tx_context::epoch(ctx),
        asset_from: proposal.asset_from,
        asset_to: proposal.asset_to,
        amount_from: proposal.amount_from,
        amount_to,
        approved_by: sender,
    };

    vector::push_back(&mut portfolio.trading_history, record);
    proposal.executed = true;

    event::emit(TradeExecuted {
        portfolio_id: object::id(portfolio),
        asset_from: proposal.asset_from,
        asset_to: proposal.asset_to,
        amount_from: proposal.amount_from,
        amount_to,
        executor: sender,
        timestamp: tx_context::epoch(ctx),
    });
}

public fun deactivate(portfolio: &mut Portfolio, ctx: &TxContext) {
    let sender = tx_context::sender(ctx);
    assert!(sender == portfolio.user_owner, ERROR_UNAUTHORIZED);
    portfolio.is_active = false;
}
