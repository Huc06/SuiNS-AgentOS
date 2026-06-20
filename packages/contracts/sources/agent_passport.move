module agentos::agent_passport;

use sui::event;

// ===== Error Constants =====

const E_NOT_OWNER: u64 = 1;
const E_NOT_AUTHORIZED: u64 = 2;

// ===== Objects =====

public struct AgentPassport has key, store {
    id: UID,
    owner: address,
    suins_name: vector<u8>,
    runtime_wallet: address,
    policy_root: address,
    skill_root: address,
    memory_namespace: vector<u8>,
    is_active: bool,
    exec_count: u64,
}

// ===== Events =====

public struct AgentCreated has copy, drop {
    passport: ID,
    owner: address,
    suins_name: vector<u8>,
    runtime_wallet: address,
}

public struct AgentRevoked has copy, drop {
    passport: ID,
    owner: address,
}

public struct ExecutionRecorded has copy, drop {
    passport: ID,
    exec_count: u64,
}

// ===== Public Functions =====

/// Create a new AgentPassport. The caller becomes the owner.
public fun create(
    suins_name: vector<u8>,
    runtime_wallet: address,
    ctx: &mut TxContext,
): AgentPassport {
    let passport = AgentPassport {
        id: object::new(ctx),
        owner: ctx.sender(),
        suins_name,
        runtime_wallet,
        policy_root: @0x0,
        skill_root: @0x0,
        // Anchor the memory namespace to the `.sui` name by default; the owner
        // can rebind it later via `set_memory_namespace`.
        memory_namespace: suins_name,
        is_active: true,
        exec_count: 0,
    };

    event::emit(AgentCreated {
        passport: object::id(&passport),
        owner: ctx.sender(),
        suins_name,
        runtime_wallet,
    });

    passport
}

/// Record a skill execution. Only the passport owner or runtime_wallet can call this.
public fun record_execution(passport: &mut AgentPassport, ctx: &TxContext) {
    let sender = ctx.sender();
    assert!(sender == passport.owner || sender == passport.runtime_wallet, E_NOT_AUTHORIZED);
    record_execution_internal(passport);
}

/// Increment the execution counter and emit `ExecutionRecorded`.
///
/// Authorization is the CALLER's responsibility — this is `public(package)`, so
/// only sibling modules in `agentos` may invoke it. It exists so that
/// `delegation::record_subagent_execution`, after validating a `DelegationCap`,
/// can bump the counter for a delegated runtime that is neither the owner nor
/// the `runtime_wallet` (avoiding a circular module dependency between
/// `agent_passport` and `delegation`).
public(package) fun record_execution_internal(passport: &mut AgentPassport) {
    passport.exec_count = passport.exec_count + 1;

    event::emit(ExecutionRecorded {
        passport: object::id(passport),
        exec_count: passport.exec_count,
    });
}

/// Revoke a passport. Only the owner can revoke.
public fun revoke(passport: &mut AgentPassport, ctx: &TxContext) {
    assert!(passport.owner == ctx.sender(), E_NOT_OWNER);
    passport.is_active = false;

    event::emit(AgentRevoked {
        passport: object::id(passport),
        owner: passport.owner,
    });
}

/// Bind the agent's memory namespace (the key under which its Walrus memory
/// is stored). Only the passport owner may change it.
public fun set_memory_namespace(
    passport: &mut AgentPassport,
    namespace: vector<u8>,
    ctx: &TxContext,
) {
    assert!(passport.owner == ctx.sender(), E_NOT_OWNER);
    passport.memory_namespace = namespace;
}

// ===== Getters =====

public fun owner(passport: &AgentPassport): address {
    passport.owner
}

public fun suins_name(passport: &AgentPassport): vector<u8> {
    passport.suins_name
}

public fun runtime_wallet(passport: &AgentPassport): address {
    passport.runtime_wallet
}

public fun memory_namespace(passport: &AgentPassport): vector<u8> {
    passport.memory_namespace
}

public fun is_active(passport: &AgentPassport): bool {
    passport.is_active
}

public fun exec_count(passport: &AgentPassport): u64 {
    passport.exec_count
}
