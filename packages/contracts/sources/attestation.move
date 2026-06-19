module agentos::attestation;

use agentos::agent_passport::AgentPassport;
use sui::clock::Clock;
use sui::event;

// ===== Error Constants =====

const E_SCORE_OUT_OF_RANGE: u64 = 1;

// ===== Objects =====

/// A typed, owned attestation referencing an AgentPassport subject.
/// Anyone can attest — the attester is recorded as ctx.sender().
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
/// Score must be 0..=100. The attester is the transaction sender.
public fun attest(
    subject: &AgentPassport,
    kind: vector<u8>,
    score: u8,
    uri: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): Attestation {
    assert!(score <= 100, E_SCORE_OUT_OF_RANGE);

    let attestation = Attestation {
        id: object::new(ctx),
        subject: object::id(subject),
        attester: ctx.sender(),
        kind,
        score,
        uri,
        timestamp_ms: clock.timestamp_ms(),
    };

    event::emit(Attested {
        attestation_id: object::id(&attestation),
        subject: object::id(subject),
        attester: ctx.sender(),
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
