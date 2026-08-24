module agentos::attestation;

use agentos::agent_passport::AgentPassport;
use sui::clock::Clock;
use sui::event;

// ===== Error Constants =====

const E_SCORE_OUT_OF_RANGE: u64 = 1;
/// The transaction sender is neither the attester passport's `owner` nor its
/// `runtime_wallet` — mirrors `agent_passport::record_execution`'s rule.
const E_NOT_AUTHORIZED: u64 = 2;
/// The attester's own passport has been revoked (`is_active == false`).
const E_ATTESTER_NOT_ACTIVE: u64 = 3;
/// An agent may not attest to its own passport (self-attestation would let an
/// agent inflate its own reputation for free).
const E_CANNOT_SELF_ATTEST: u64 = 4;

// ===== Objects =====

/// A typed, owned attestation referencing an AgentPassport subject.
/// The attester must hold their OWN active AgentPassport (passed as
/// `attester_passport`) — attesting requires being a registered agent, not
/// just any address. The attester is recorded as ctx.sender().
public struct Attestation has key, store {
    id: UID,
    subject: ID,
    attester: address,
    kind: vector<u8>,
    score: u8,
    uri: vector<u8>,
    timestamp_ms: u64,
}

// ===== Events =====

public struct Attested has copy, drop {
    attestation_id: ID,
    subject: ID,
    attester: address,
    kind: vector<u8>,
    score: u8,
}

// ===== Public Functions =====

/// Create an attestation for an AgentPassport subject.
///
/// Score must be 0..=100. The caller must be the `owner` or `runtime_wallet`
/// of `attester_passport` (their OWN passport, proving they are a registered
/// agent — not just any address), and that passport must be active. An agent
/// cannot attest to itself. On success, `subject`'s on-chain
/// `attestation_count`/`reputation_score_sum` are updated atomically via
/// `agent_passport::record_attestation_internal`, so reputation is readable
/// directly off `subject` without an indexer.
public fun attest(
    subject: &mut AgentPassport,
    attester_passport: &AgentPassport,
    kind: vector<u8>,
    score: u8,
    uri: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): Attestation {
    assert!(score <= 100, E_SCORE_OUT_OF_RANGE);

    let sender = ctx.sender();
    assert!(
        sender == agentos::agent_passport::owner(attester_passport)
            || sender == agentos::agent_passport::runtime_wallet(attester_passport),
        E_NOT_AUTHORIZED,
    );
    assert!(agentos::agent_passport::is_active(attester_passport), E_ATTESTER_NOT_ACTIVE);
    assert!(
        object::id(attester_passport) != object::id(subject),
        E_CANNOT_SELF_ATTEST,
    );

    let attestation = Attestation {
        id: object::new(ctx),
        subject: object::id(subject),
        attester: sender,
        kind,
        score,
        uri,
        timestamp_ms: clock.timestamp_ms(),
    };

    agentos::agent_passport::record_attestation_internal(subject, score);

    event::emit(Attested {
        attestation_id: object::id(&attestation),
        subject: object::id(subject),
        attester: sender,
        kind,
        score,
    });

    attestation
}

// ===== Getters =====

public fun subject(attestation: &Attestation): ID {
    attestation.subject
}

public fun attester(attestation: &Attestation): address {
    attestation.attester
}

public fun kind(attestation: &Attestation): vector<u8> {
    attestation.kind
}

public fun score(attestation: &Attestation): u8 {
    attestation.score
}

public fun uri(attestation: &Attestation): vector<u8> {
    attestation.uri
}

public fun timestamp_ms(attestation: &Attestation): u64 {
    attestation.timestamp_ms
}
