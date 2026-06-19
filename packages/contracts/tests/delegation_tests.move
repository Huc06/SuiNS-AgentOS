#[test_only]
module agentos::delegation_tests;

use agentos::agent_passport;
use agentos::delegation;
use std::unit_test::destroy;
use sui::clock;
use sui::test_scenario;

#[test]
fun test_grant_and_getters() {
    let owner = @0xA;
    let child = @0xC;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let cap = delegation::grant(
            &passport,
            child,
            vector[b"trade", b"transfer"],
            vector[b"execute_skill"],
            1_000_000_000, // 1 SUI
            9_999_999_999, // expiry
            scenario.ctx(),
        );

        // Verify getters
        assert!(delegation::parent_owner(&cap) == owner, 0);
        assert!(delegation::child_agent(&cap) == child, 1);
        assert!(delegation::spend_limit(&cap) == 1_000_000_000, 2);
        assert!(delegation::spent(&cap) == 0, 3);
        assert!(delegation::expiry_ms(&cap) == 9_999_999_999, 4);
        assert!(!delegation::is_revoked(&cap), 5);
        assert!(delegation::allowed_skills(&cap) == vector[b"trade", b"transfer"], 6);
        assert!(delegation::allowed_capabilities(&cap) == vector[b"execute_skill"], 7);

        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

#[test]
fun test_assert_valid_happy_path() {
    let owner = @0xA;
    let child = @0xC;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let cap = delegation::grant(
            &passport,
            child,
            vector[b"trade"],
            vector[],
            1_000_000_000,
            10_000, // expiry at 10s
            scenario.ctx(),
        );

        let mut test_clock = clock::create_for_testing(scenario.ctx());
        test_clock.set_for_testing(5_000); // 5s < 10s expiry

        delegation::assert_valid(&cap, &test_clock, b"trade");

        destroy(test_clock);
        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

#[test]
fun test_assert_valid_empty_allowlist_allows_any_skill() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let cap = delegation::grant(
            &passport,
            @0xC,
            vector[], // empty = allow all
            vector[],
            1_000_000_000,
            10_000,
            scenario.ctx(),
        );

        let mut test_clock = clock::create_for_testing(scenario.ctx());
        test_clock.set_for_testing(5_000);

        delegation::assert_valid(&cap, &test_clock, b"any-skill-name");

        destroy(test_clock);
        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

#[test]
fun test_consume_happy_path() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let mut cap = delegation::grant(
            &passport,
            @0xC,
            vector[],
            vector[],
            1_000,
            99_999,
            scenario.ctx(),
        );

        delegation::consume(&mut cap, 400);
        assert!(delegation::spent(&cap) == 400, 0);

        delegation::consume(&mut cap, 600);
        assert!(delegation::spent(&cap) == 1_000, 1);

        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_OVER_SPEND_LIMIT)]
fun test_consume_over_limit_aborts() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let mut cap = delegation::grant(
            &passport,
            @0xC,
            vector[],
            vector[],
            1_000,
            99_999,
            scenario.ctx(),
        );

        delegation::consume(&mut cap, 1_001); // exceeds limit

        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_EXPIRED)]
fun test_assert_valid_expired_aborts() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let cap = delegation::grant(
            &passport,
            @0xC,
            vector[],
            vector[],
            1_000,
            5_000, // expires at 5s
            scenario.ctx(),
        );

        let mut test_clock = clock::create_for_testing(scenario.ctx());
        test_clock.set_for_testing(6_000); // 6s > 5s

        delegation::assert_valid(&cap, &test_clock, b"trade");

        destroy(test_clock);
        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_REVOKED)]
fun test_assert_valid_revoked_aborts() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let mut cap = delegation::grant(
            &passport,
            @0xC,
            vector[],
            vector[],
            1_000,
            99_999,
            scenario.ctx(),
        );

        delegation::revoke(&mut cap, scenario.ctx());

        let mut test_clock = clock::create_for_testing(scenario.ctx());
        test_clock.set_for_testing(1_000);

        delegation::assert_valid(&cap, &test_clock, b"trade");

        destroy(test_clock);
        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_SKILL_NOT_ALLOWED)]
fun test_assert_valid_skill_not_in_allowlist_aborts() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let cap = delegation::grant(
            &passport,
            @0xC,
            vector[b"trade", b"transfer"], // only these allowed
            vector[],
            1_000,
            99_999,
            scenario.ctx(),
        );

        let mut test_clock = clock::create_for_testing(scenario.ctx());
        test_clock.set_for_testing(1_000);

        delegation::assert_valid(&cap, &test_clock, b"unknown-skill");

        destroy(test_clock);
        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

#[test]
fun test_revoke_success() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let mut cap = delegation::grant(
            &passport,
            @0xC,
            vector[],
            vector[],
            1_000,
            99_999,
            scenario.ctx(),
        );

        assert!(!delegation::is_revoked(&cap), 0);
        delegation::revoke(&mut cap, scenario.ctx());
        assert!(delegation::is_revoked(&cap), 1);

        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_NOT_PARENT_OWNER)]
fun test_revoke_non_owner_aborts() {
    let owner = @0xA;
    let attacker = @0xD;
    let mut scenario = test_scenario::begin(owner);

    let passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );
    let mut cap = delegation::grant(
        &passport,
        @0xC,
        vector[],
        vector[],
        1_000,
        99_999,
        scenario.ctx(),
    );

    // Switch to attacker
    scenario.next_tx(attacker);
    delegation::revoke(&mut cap, scenario.ctx());

    destroy(cap);
    destroy(passport);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_NOT_PARENT_OWNER)]
fun test_grant_non_owner_aborts() {
    let owner = @0xA;
    let attacker = @0xD;
    let mut scenario = test_scenario::begin(owner);

    let passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    // Switch to attacker who is NOT the passport owner
    scenario.next_tx(attacker);
    let cap = delegation::grant(
        &passport,
        @0xC,
        vector[],
        vector[],
        1_000,
        99_999,
        scenario.ctx(),
    );

    destroy(cap);
    destroy(passport);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_PASSPORT_NOT_ACTIVE)]
fun test_grant_inactive_passport_aborts() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let mut passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        agent_passport::revoke(&mut passport, scenario.ctx());

        let cap = delegation::grant(
            &passport,
            @0xC,
            vector[],
            vector[],
            1_000,
            99_999,
            scenario.ctx(),
        );

        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_REVOKED)]
fun test_consume_after_revoke_aborts() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        let mut cap = delegation::grant(
            &passport,
            @0xC,
            vector[],
            vector[],
            1_000,
            99_999,
            scenario.ctx(),
        );

        delegation::revoke(&mut cap, scenario.ctx());
        delegation::consume(&mut cap, 100); // should abort

        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}
