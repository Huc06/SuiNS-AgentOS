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

// ===== Objects =====

/// A transferable capability object scoping what a child/sub-agent may do
/// on behalf of a parent AgentPassport.
public struct DelegationCap has key, store {
    id: UID,
    parent_passport: ID,
    parent_owner: address,
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
/// The caller must be the passport owner and the passport must be active.
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
    assert!(parent_owner == ctx.sender(), E_NOT_PARENT_OWNER);
    assert!(agentos::agent_passport::is_active(parent), E_PASSPORT_NOT_ACTIVE);

    let cap = DelegationCap {
        id: object::new(ctx),
        parent_passport: object::id(parent),
        parent_owner,
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

/// Consume spend from the delegation cap. Aborts if spent + amount > spend_limit.
public fun consume(cap: &mut DelegationCap, amount: u64) {
    assert!(!cap.revoked, E_REVOKED);
    assert!(cap.spent + amount <= cap.spend_limit, E_OVER_SPEND_LIMIT);
    cap.spent = cap.spent + amount;

    event::emit(DelegationConsumed {
        cap_id: object::id(cap),
        amount,
        new_spent: cap.spent,
    });
}

/// Revoke a delegation cap. Only the parent owner can revoke.
public fun revoke(cap: &mut DelegationCap, ctx: &TxContext) {
    assert!(cap.parent_owner == ctx.sender(), E_NOT_PARENT_OWNER);
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
