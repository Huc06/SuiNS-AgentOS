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
    let attester_addr = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    // Switch to attester
    scenario.next_tx(attester_addr);
    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(42_000);

    let att = attestation::attest(
        &passport,
        b"skill-run",
        85,
        b"walrus://blob/evidence",
        &test_clock,
        scenario.ctx(),
    );

    assert!(attestation::attester(&att) == attester_addr, 0);
    assert!(attestation::kind(&att) == b"skill-run", 1);
    assert!(attestation::score(&att) == 85, 2);
    assert!(attestation::uri(&att) == b"walrus://blob/evidence", 3);
    assert!(attestation::timestamp_ms(&att) == 42_000, 4);

    destroy(test_clock);
    destroy(att);
    destroy(passport);
    scenario.end();
}

#[test]
fun test_attest_zero_score() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );

        let mut test_clock = clock::create_for_testing(scenario.ctx());
        test_clock.set_for_testing(1_000);

        let att = attestation::attest(
            &passport,
            b"endorsement",
            0,
            vector[],
            &test_clock,
            scenario.ctx(),
        );

        assert!(attestation::score(&att) == 0, 0);

        destroy(test_clock);
        destroy(att);
        destroy(passport);
    };
    scenario.end();
}

#[test]
fun test_attest_max_score() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );

        let mut test_clock = clock::create_for_testing(scenario.ctx());
        test_clock.set_for_testing(1_000);

        let att = attestation::attest(
            &passport,
            b"endorsement",
            100,
            vector[],
            &test_clock,
            scenario.ctx(),
        );

        assert!(attestation::score(&att) == 100, 0);

        destroy(test_clock);
        destroy(att);
        destroy(passport);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = attestation::E_SCORE_OUT_OF_RANGE)]
fun test_attest_score_over_100_aborts() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );

        let mut test_clock = clock::create_for_testing(scenario.ctx());
        test_clock.set_for_testing(1_000);

        let att = attestation::attest(
            &passport,
            b"endorsement",
            101, // invalid
            vector[],
            &test_clock,
            scenario.ctx(),
        );

        destroy(test_clock);
        destroy(att);
        destroy(passport);
    };
    scenario.end();
}

#[test]
fun test_attest_subject_matches_passport_id() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let passport_id = object::id(&passport);

        let mut test_clock = clock::create_for_testing(scenario.ctx());
        test_clock.set_for_testing(1_000);

        let att = attestation::attest(
            &passport,
            b"endorsement",
            50,
            vector[],
            &test_clock,
            scenario.ctx(),
        );

        assert!(attestation::subject(&att) == passport_id, 0);

        destroy(test_clock);
        destroy(att);
        destroy(passport);
    };
    scenario.end();
}
