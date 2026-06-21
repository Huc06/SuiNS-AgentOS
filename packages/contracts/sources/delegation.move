module agentos::delegation;

use sui::clock::Clock;
use sui::event;

// ===== Error Constants =====

const E_NOT_PARENT_OWNER: u64 = 1;
const E_PASSPORT_NOT_ACTIVE: u64 = 2;
const E_REVOKED: u64 = 3;
const E_EXPIRED: u64 = 4;
const E_OVER_SPEND_LIMIT: u64 = 5;
const E_SKILL_NOT_ALLOWED: u64 = 6;
/// The transaction sender is not the cap's bound `child_agent`.
const E_NOT_CHILD_AGENT: u64 = 7;
/// The supplied passport is not the cap's `parent_passport`.
const E_PASSPORT_MISMATCH: u64 = 8;

// ===== Objects =====

/// A transferable capability object scoping what a child/sub-agent may do
/// on behalf of a parent AgentPassport.
public struct DelegationCap has key, store {
    id: UID,
    parent_passport: ID,
    /// The parent passport's `owner` at grant time.
    parent_owner: address,
    /// The parent passport's `runtime_wallet` at grant time. Stored alongside
    /// `parent_owner` so that downstream authorization checks (revoke, …) can
    /// accept the sponsored RUNTIME wallet as well as the owner — consistent
    /// with `agent_passport::record_execution` (sender == owner || runtime_wallet).
    parent_runtime: address,
    child_agent: address,
    allowed_skills: vector<vector<u8>>,
    allowed_capabilities: vector<vector<u8>>,
    spend_limit: u64,
    spent: u64,
    expiry_ms: u64,
    revoked: bool,
}

// ===== Events =====

public struct DelegationGranted has copy, drop {
    cap_id: ID,
    parent_passport: ID,
    parent_owner: address,
    child_agent: address,
    spend_limit: u64,
    expiry_ms: u64,
}

public struct DelegationRevoked has copy, drop {
    cap_id: ID,
    parent_owner: address,
    child_agent: address,
}

public struct DelegationConsumed has copy, drop {
    cap_id: ID,
    amount: u64,
    new_spent: u64,
}

// ===== Public Functions =====

/// Grant a delegation capability from a parent passport to a child agent address.
/// The caller must be the passport's owner OR its `runtime_wallet`, and the
/// passport must be active.
///
/// Accepting the `runtime_wallet` (not just the owner) is what makes the
/// Import->Delegate->Call->Attest flow work under Enoki-sponsored execution,
/// where the server signs as the agent's runtime wallet rather than the minter
/// — mirroring `agent_passport::record_execution`'s authorization rule.
public fun grant(
    parent: &agentos::agent_passport::AgentPassport,
    child: address,
    allowed_skills: vector<vector<u8>>,
    allowed_capabilities: vector<vector<u8>>,
    spend_limit: u64,
    expiry_ms: u64,
    ctx: &mut TxContext,
): DelegationCap {
    let parent_owner = agentos::agent_passport::owner(parent);
    let parent_runtime = agentos::agent_passport::runtime_wallet(parent);
    let sender = ctx.sender();
    assert!(sender == parent_owner || sender == parent_runtime, E_NOT_PARENT_OWNER);
    assert!(agentos::agent_passport::is_active(parent), E_PASSPORT_NOT_ACTIVE);

    let cap = DelegationCap {
        id: object::new(ctx),
        parent_passport: object::id(parent),
        parent_owner,
        parent_runtime,
        child_agent: child,
        allowed_skills,
        allowed_capabilities,
        spend_limit,
        spent: 0,
        expiry_ms,
        revoked: false,
    };

    event::emit(DelegationGranted {
        cap_id: object::id(&cap),
        parent_passport: object::id(parent),
        parent_owner,
        child_agent: child,
        spend_limit,
        expiry_ms,
    });

    cap
}

/// Validate that a delegation cap is still usable: not revoked, not expired,
/// and (if allowed_skills is non-empty) the skill_id is in the allowlist.
public fun assert_valid(
    cap: &DelegationCap,
    clock: &Clock,
    skill_id: vector<u8>,
) {
    assert!(!cap.revoked, E_REVOKED);
    assert!(clock.timestamp_ms() <= cap.expiry_ms, E_EXPIRED);

    // If allowed_skills is non-empty, the skill must be in the list
    if (!cap.allowed_skills.is_empty()) {
        let mut found = false;
        let len = cap.allowed_skills.length();
        let mut i = 0;
        while (i < len) {
            if (cap.allowed_skills[i] == skill_id) {
                found = true;
                break
            };
            i = i + 1;
        };
        assert!(found, E_SKILL_NOT_ALLOWED);
    };
}

/// Consume spend from the delegation cap. The caller (`ctx.sender()`) MUST be
/// the cap's bound `child_agent` (FIX-2: previously this had no caller auth, so
/// anyone holding a reference could draw down the budget). Aborts if revoked,
/// if the caller is not the child, or if spent + amount > spend_limit.
public fun consume(cap: &mut DelegationCap, amount: u64, ctx: &TxContext) {
    assert!(!cap.revoked, E_REVOKED);
    assert!(cap.child_agent == ctx.sender(), E_NOT_CHILD_AGENT);
    assert!(cap.spent + amount <= cap.spend_limit, E_OVER_SPEND_LIMIT);
    cap.spent = cap.spent + amount;

    event::emit(DelegationConsumed {
        cap_id: object::id(cap),
        amount,
        new_spent: cap.spent,
    });
}

/// Record a sub-agent execution against the cap's `parent_passport`, authorized
/// by a `DelegationCap` instead of passport ownership (FIX-1).
///
/// The transaction sender MUST be the cap's bound `child_agent` (the delegated
/// runtime), the cap must not be revoked or expired (mirrors `assert_valid`'s
/// liveness checks), and `passport` MUST be the cap's `parent_passport`. This
/// lets a delegated runtime atomically bump a passport's `exec_count` inside an
/// import/run PTB without holding owner or `runtime_wallet` authority — the case
/// where the existing `agent_passport::record_execution` (sender == owner ||
/// runtime_wallet) would abort and unwind the whole atomic chain.
public fun record_subagent_execution(
    passport: &mut agentos::agent_passport::AgentPassport,
    cap: &DelegationCap,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(!cap.revoked, E_REVOKED);
    assert!(clock.timestamp_ms() <= cap.expiry_ms, E_EXPIRED);
    assert!(cap.child_agent == ctx.sender(), E_NOT_CHILD_AGENT);
    assert!(cap.parent_passport == object::id(passport), E_PASSPORT_MISMATCH);

    agentos::agent_passport::record_execution_internal(passport);
}

/// Revoke a delegation cap. The parent owner OR the parent's `runtime_wallet`
/// (both recorded on the cap at grant time) can revoke — this is the agent's
/// own delegation lifecycle, which a sponsored runtime manages during execution,
/// so it follows the same owner-||-runtime_wallet rule as `grant`.
public fun revoke(cap: &mut DelegationCap, ctx: &TxContext) {
    let sender = ctx.sender();
    assert!(
        sender == cap.parent_owner || sender == cap.parent_runtime,
        E_NOT_PARENT_OWNER,
    );
    cap.revoked = true;

    event::emit(DelegationRevoked {
        cap_id: object::id(cap),
        parent_owner: cap.parent_owner,
        child_agent: cap.child_agent,
    });
}

// ===== Getters =====

public fun parent_passport(cap: &DelegationCap): ID {
    cap.parent_passport
}

public fun parent_owner(cap: &DelegationCap): address {
    cap.parent_owner
}

public fun parent_runtime(cap: &DelegationCap): address {
    cap.parent_runtime
}

public fun child_agent(cap: &DelegationCap): address {
    cap.child_agent
}

public fun allowed_skills(cap: &DelegationCap): vector<vector<u8>> {
    cap.allowed_skills
}

public fun allowed_capabilities(cap: &DelegationCap): vector<vector<u8>> {
    cap.allowed_capabilities
}

public fun spend_limit(cap: &DelegationCap): u64 {
    cap.spend_limit
}

public fun spent(cap: &DelegationCap): u64 {
    cap.spent
}

public fun expiry_ms(cap: &DelegationCap): u64 {
    cap.expiry_ms
}

public fun is_revoked(cap: &DelegationCap): bool {
    cap.revoked
}

/// True if `clock` is past the cap's expiry. Convenience for off-chain callers
/// and the `record_subagent_execution` / `assert_valid` liveness checks.
public fun is_expired(cap: &DelegationCap, clock: &Clock): bool {
    clock.timestamp_ms() > cap.expiry_ms
}
