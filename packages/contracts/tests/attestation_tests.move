#[test_only]
module agentos::attestation_tests;

use agentos::agent_passport;
use agentos::attestation;
use std::unit_test::destroy;
use sui::clock;
use sui::test_scenario;

#[test]
fun test_attest_happy_path() {
    let owner = @0xA;
    let attester_owner = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut subject = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    // Switch to the attester and mint THEIR own passport (proving they're a
    // registered agent, not just any address).
    scenario.next_tx(attester_owner);
    let attester_passport = agent_passport::create(
        b"beta-agent",
        @0xD,
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(42_000);

    let att = attestation::attest(
        &mut subject,
        &attester_passport,
        b"skill-run",
        85,
        b"walrus://blob/evidence",
        &test_clock,
        scenario.ctx(),
    );

    assert!(attestation::attester(&att) == attester_owner, 0);
    assert!(attestation::kind(&att) == b"skill-run", 1);
    assert!(attestation::score(&att) == 85, 2);
    assert!(attestation::uri(&att) == b"walrus://blob/evidence", 3);
    assert!(attestation::timestamp_ms(&att) == 42_000, 4);

    // The subject's on-chain aggregate is updated atomically.
    assert!(agent_passport::attestation_count(&subject) == 1, 5);
    assert!(agent_passport::reputation_score_sum(&subject) == 85, 6);

    destroy(test_clock);
    destroy(att);
    destroy(subject);
    destroy(attester_passport);
    scenario.end();
}

#[test]
fun test_attest_by_attester_runtime_wallet() {
    let owner = @0xA;
    let attester_owner = @0xC;
    let attester_runtime = @0xE;
    let mut scenario = test_scenario::begin(owner);

    let mut subject = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    scenario.next_tx(attester_owner);
    let attester_passport = agent_passport::create(
        b"beta-agent",
        attester_runtime,
        scenario.ctx(),
    );

    // The attester's RUNTIME WALLET (not owner) sends the attest tx — allowed,
    // mirrors agent_passport::record_execution's owner-||-runtime_wallet rule.
    scenario.next_tx(attester_runtime);
    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(1_000);

    let att = attestation::attest(
        &mut subject,
        &attester_passport,
        b"endorsement",
        70,
        vector[],
        &test_clock,
        scenario.ctx(),
    );

    assert!(attestation::attester(&att) == attester_runtime, 0);

    destroy(test_clock);
    destroy(att);
    destroy(subject);
    destroy(attester_passport);
    scenario.end();
}

#[test]
fun test_attest_aggregates_multiple_scores() {
    let owner = @0xA;
    let attester_owner = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut subject = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    scenario.next_tx(attester_owner);
    let attester_passport = agent_passport::create(
        b"beta-agent",
        @0xD,
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(1_000);

    let att1 = attestation::attest(
        &mut subject,
        &attester_passport,
        b"skill-run",
        80,
        vector[],
        &test_clock,
        scenario.ctx(),
    );
    let att2 = attestation::attest(
        &mut subject,
        &attester_passport,
        b"endorsement",
        60,
        vector[],
        &test_clock,
        scenario.ctx(),
    );

    assert!(agent_passport::attestation_count(&subject) == 2, 0);
    assert!(agent_passport::reputation_score_sum(&subject) == 140, 1);

    destroy(test_clock);
    destroy(att1);
    destroy(att2);
    destroy(subject);
    destroy(attester_passport);
    scenario.end();
}

#[test]
fun test_attest_zero_score() {
    let owner = @0xA;
    let attester_owner = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut subject = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    scenario.next_tx(attester_owner);
    let attester_passport = agent_passport::create(
        b"beta-agent",
        @0xD,
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(1_000);

    let att = attestation::attest(
        &mut subject,
        &attester_passport,
        b"endorsement",
        0,
        vector[],
        &test_clock,
        scenario.ctx(),
    );

    assert!(attestation::score(&att) == 0, 0);
    assert!(agent_passport::reputation_score_sum(&subject) == 0, 1);

    destroy(test_clock);
    destroy(att);
    destroy(subject);
    destroy(attester_passport);
    scenario.end();
}

#[test]
fun test_attest_max_score() {
    let owner = @0xA;
    let attester_owner = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut subject = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    scenario.next_tx(attester_owner);
    let attester_passport = agent_passport::create(
        b"beta-agent",
        @0xD,
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(1_000);

    let att = attestation::attest(
        &mut subject,
        &attester_passport,
        b"endorsement",
        100,
        vector[],
        &test_clock,
        scenario.ctx(),
    );

    assert!(attestation::score(&att) == 100, 0);

    destroy(test_clock);
    destroy(att);
    destroy(subject);
    destroy(attester_passport);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = attestation::E_SCORE_OUT_OF_RANGE)]
fun test_attest_score_over_100_aborts() {
    let owner = @0xA;
    let attester_owner = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut subject = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    scenario.next_tx(attester_owner);
    let attester_passport = agent_passport::create(
        b"beta-agent",
        @0xD,
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(1_000);

    let att = attestation::attest(
        &mut subject,
        &attester_passport,
        b"endorsement",
        101, // invalid
        vector[],
        &test_clock,
        scenario.ctx(),
    );

    destroy(test_clock);
    destroy(att);
    destroy(subject);
    destroy(attester_passport);
    scenario.end();
}

#[test]
fun test_attest_subject_matches_passport_id() {
    let owner = @0xA;
    let attester_owner = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut subject = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );
    let subject_id = object::id(&subject);

    scenario.next_tx(attester_owner);
    let attester_passport = agent_passport::create(
        b"beta-agent",
        @0xD,
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(1_000);

    let att = attestation::attest(
        &mut subject,
        &attester_passport,
        b"endorsement",
        50,
        vector[],
        &test_clock,
        scenario.ctx(),
    );

    assert!(attestation::subject(&att) == subject_id, 0);

    destroy(test_clock);
    destroy(att);
    destroy(subject);
    destroy(attester_passport);
    scenario.end();
}

/// PERMISSION: the transaction sender must be the attester passport's owner
/// or runtime_wallet — a stranger holding neither may not attest, even with a
/// valid attester_passport reference in hand.
#[test]
#[expected_failure(abort_code = attestation::E_NOT_AUTHORIZED)]
fun test_attest_by_stranger_aborts() {
    let owner = @0xA;
    let attester_owner = @0xC;
    let stranger = @0xF;
    let mut scenario = test_scenario::begin(owner);

    let mut subject = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    scenario.next_tx(attester_owner);
    let attester_passport = agent_passport::create(
        b"beta-agent",
        @0xD,
        scenario.ctx(),
    );

    scenario.next_tx(stranger);
    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(1_000);

    let att = attestation::attest(
        &mut subject,
        &attester_passport,
        b"endorsement",
        50,
        vector[],
        &test_clock,
        scenario.ctx(),
    );

    destroy(test_clock);
    destroy(att);
    destroy(subject);
    destroy(attester_passport);
    scenario.end();
}

/// PERMISSION: a revoked attester passport cannot be used to attest.
#[test]
#[expected_failure(abort_code = attestation::E_ATTESTER_NOT_ACTIVE)]
fun test_attest_by_revoked_attester_aborts() {
    let owner = @0xA;
    let attester_owner = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut subject = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    scenario.next_tx(attester_owner);
    let mut attester_passport = agent_passport::create(
        b"beta-agent",
        @0xD,
        scenario.ctx(),
    );
    agent_passport::revoke(&mut attester_passport, scenario.ctx());

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(1_000);

    let att = attestation::attest(
        &mut subject,
        &attester_passport,
        b"endorsement",
        50,
        vector[],
        &test_clock,
        scenario.ctx(),
    );

    destroy(test_clock);
    destroy(att);
    destroy(subject);
    destroy(attester_passport);
    scenario.end();
}

// PERMISSION: an agent cannot attest to its own passport (self-attestation).
//
// NOTE: this is enforced defense-in-depth by `E_CANNOT_SELF_ATTEST` inside
// `attest`, but it is ALSO structurally impossible to even construct the call
// that would trigger it: Move's borrow checker rejects passing the same
// object as both `&mut subject` and `&attester_passport` in one call (an
// aliasing violation caught at compile time, before any runtime assert
// would run). There is therefore no way to write a compiling test that
// reaches `E_CANNOT_SELF_ATTEST` through the public `attest` entry point —
// the borrow checker itself is the enforcement for this specific path.
