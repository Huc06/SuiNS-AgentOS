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
        assert!(delegation::parent_runtime(&cap) == @0xB, 8);
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
    let child = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );
    let mut cap = delegation::grant(
        &passport,
        child,
        vector[],
        vector[],
        1_000,
        99_999,
        scenario.ctx(),
    );

    // FIX-2: only the bound child_agent runtime may draw down the budget.
    scenario.next_tx(child);
    delegation::consume(&mut cap, 400, scenario.ctx());
    assert!(delegation::spent(&cap) == 400, 0);

    delegation::consume(&mut cap, 600, scenario.ctx());
    assert!(delegation::spent(&cap) == 1_000, 1);

    destroy(cap);
    destroy(passport);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_NOT_CHILD_AGENT)]
fun test_consume_wrong_caller_aborts() {
    let owner = @0xA;
    let child = @0xC;
    let stranger = @0xD;
    let mut scenario = test_scenario::begin(owner);

    let passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );
    let mut cap = delegation::grant(
        &passport,
        child,
        vector[],
        vector[],
        1_000,
        99_999,
        scenario.ctx(),
    );

    // Not the child_agent → must abort.
    scenario.next_tx(stranger);
    delegation::consume(&mut cap, 100, scenario.ctx());

    destroy(cap);
    destroy(passport);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_OVER_SPEND_LIMIT)]
fun test_consume_over_limit_aborts() {
    let owner = @0xA;
    let child = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );
    let mut cap = delegation::grant(
        &passport,
        child,
        vector[],
        vector[],
        1_000,
        99_999,
        scenario.ctx(),
    );

    scenario.next_tx(child);
    delegation::consume(&mut cap, 1_001, scenario.ctx()); // exceeds limit

    destroy(cap);
    destroy(passport);
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
        // revoked is checked before the caller binding, so the owner sender here
        // still surfaces E_REVOKED.
        delegation::consume(&mut cap, 100, scenario.ctx()); // should abort

        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}

// ===== record_subagent_execution (FIX-1) =====

#[test]
fun test_record_subagent_execution_happy_path() {
    let owner = @0xA;
    let child = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );
    let cap = delegation::grant(
        &passport,
        child,
        vector[],
        vector[],
        1_000,
        10_000,
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(5_000); // before 10s expiry

    assert!(agent_passport::exec_count(&passport) == 0, 0);

    // The delegated child runtime — NOT the owner or runtime_wallet — records.
    scenario.next_tx(child);
    delegation::record_subagent_execution(&mut passport, &cap, &test_clock, scenario.ctx());
    assert!(agent_passport::exec_count(&passport) == 1, 1);

    delegation::record_subagent_execution(&mut passport, &cap, &test_clock, scenario.ctx());
    assert!(agent_passport::exec_count(&passport) == 2, 2);

    destroy(test_clock);
    destroy(cap);
    destroy(passport);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_NOT_CHILD_AGENT)]
fun test_record_subagent_execution_wrong_caller_aborts() {
    let owner = @0xA;
    let child = @0xC;
    let stranger = @0xD;
    let mut scenario = test_scenario::begin(owner);

    let mut passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );
    let cap = delegation::grant(
        &passport,
        child,
        vector[],
        vector[],
        1_000,
        10_000,
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(5_000);

    scenario.next_tx(stranger); // not the bound child_agent
    delegation::record_subagent_execution(&mut passport, &cap, &test_clock, scenario.ctx());

    destroy(test_clock);
    destroy(cap);
    destroy(passport);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_REVOKED)]
fun test_record_subagent_execution_revoked_aborts() {
    let owner = @0xA;
    let child = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );
    let mut cap = delegation::grant(
        &passport,
        child,
        vector[],
        vector[],
        1_000,
        10_000,
        scenario.ctx(),
    );
    delegation::revoke(&mut cap, scenario.ctx()); // owner revokes

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(5_000);

    scenario.next_tx(child);
    delegation::record_subagent_execution(&mut passport, &cap, &test_clock, scenario.ctx());

    destroy(test_clock);
    destroy(cap);
    destroy(passport);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_EXPIRED)]
fun test_record_subagent_execution_expired_aborts() {
    let owner = @0xA;
    let child = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );
    let cap = delegation::grant(
        &passport,
        child,
        vector[],
        vector[],
        1_000,
        5_000, // expires at 5s
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(6_000); // 6s > 5s

    scenario.next_tx(child);
    delegation::record_subagent_execution(&mut passport, &cap, &test_clock, scenario.ctx());

    destroy(test_clock);
    destroy(cap);
    destroy(passport);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = delegation::E_PASSPORT_MISMATCH)]
fun test_record_subagent_execution_wrong_passport_aborts() {
    let owner = @0xA;
    let child = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let passport_a = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );
    let mut passport_b = agent_passport::create(
        b"beta-agent",
        @0xB,
        scenario.ctx(),
    );
    // Cap is scoped to passport_a.
    let cap = delegation::grant(
        &passport_a,
        child,
        vector[],
        vector[],
        1_000,
        10_000,
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(5_000);

    scenario.next_tx(child);
    // Passing the wrong passport (passport_b) must abort.
    delegation::record_subagent_execution(&mut passport_b, &cap, &test_clock, scenario.ctx());

    destroy(test_clock);
    destroy(cap);
    destroy(passport_a);
    destroy(passport_b);
    scenario.end();
}

// ===== runtime_wallet authorization (Enoki-sponsored execution) =====

/// The agent's RUNTIME WALLET (not the owner) can grant a delegation — this is
/// the Enoki-sponsored path where the server signs as the runtime wallet.
#[test]
fun test_grant_by_runtime_wallet() {
    let owner = @0xA;
    let runtime = @0xB;
    let child = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let passport = agent_passport::create(
        b"alpha-agent",
        runtime,
        scenario.ctx(),
    );

    // Switch to the runtime_wallet, which is NOT the owner.
    scenario.next_tx(runtime);
    let cap = delegation::grant(
        &passport,
        child,
        vector[],
        vector[],
        1_000,
        99_999,
        scenario.ctx(),
    );

    // The cap still records the OWNER as parent_owner and the runtime as parent_runtime.
    assert!(delegation::parent_owner(&cap) == owner, 0);
    assert!(delegation::parent_runtime(&cap) == runtime, 1);
    assert!(delegation::child_agent(&cap) == child, 2);

    destroy(cap);
    destroy(passport);
    scenario.end();
}

/// A delegation granted by the runtime wallet lets the child runtime record a
/// sub-agent execution — the full sponsored Delegate->Call path.
#[test]
fun test_record_subagent_execution_after_runtime_grant() {
    let owner = @0xA;
    let runtime = @0xB;
    let child = @0xC;
    let mut scenario = test_scenario::begin(owner);

    let mut passport = agent_passport::create(
        b"alpha-agent",
        runtime,
        scenario.ctx(),
    );

    // Runtime wallet grants.
    scenario.next_tx(runtime);
    let cap = delegation::grant(
        &passport,
        child,
        vector[],
        vector[],
        1_000,
        10_000,
        scenario.ctx(),
    );

    let mut test_clock = clock::create_for_testing(scenario.ctx());
    test_clock.set_for_testing(5_000);

    // Child runtime records the execution.
    scenario.next_tx(child);
    delegation::record_subagent_execution(&mut passport, &cap, &test_clock, scenario.ctx());
    assert!(agent_passport::exec_count(&passport) == 1, 0);

    destroy(test_clock);
    destroy(cap);
    destroy(passport);
    scenario.end();
}

/// The runtime wallet can revoke a delegation it (or the owner) granted.
#[test]
fun test_revoke_by_runtime_wallet() {
    let owner = @0xA;
    let runtime = @0xB;
    let mut scenario = test_scenario::begin(owner);

    // Owner grants.
    let passport = agent_passport::create(
        b"alpha-agent",
        runtime,
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

    // Runtime wallet (not owner) revokes.
    scenario.next_tx(runtime);
    delegation::revoke(&mut cap, scenario.ctx());
    assert!(delegation::is_revoked(&cap), 1);

    destroy(cap);
    destroy(passport);
    scenario.end();
}

/// A random address that is neither owner nor runtime_wallet cannot grant.
#[test]
#[expected_failure(abort_code = delegation::E_NOT_PARENT_OWNER)]
fun test_grant_by_random_address_aborts() {
    let owner = @0xA;
    let runtime = @0xB;
    let stranger = @0xF;
    let mut scenario = test_scenario::begin(owner);

    let passport = agent_passport::create(
        b"alpha-agent",
        runtime,
        scenario.ctx(),
    );

    // Neither owner nor runtime_wallet.
    scenario.next_tx(stranger);
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

/// A random address that is neither owner nor runtime_wallet cannot revoke.
#[test]
#[expected_failure(abort_code = delegation::E_NOT_PARENT_OWNER)]
fun test_revoke_by_random_address_aborts() {
    let owner = @0xA;
    let runtime = @0xB;
    let stranger = @0xF;
    let mut scenario = test_scenario::begin(owner);

    let passport = agent_passport::create(
        b"alpha-agent",
        runtime,
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

    // Neither owner nor runtime_wallet.
    scenario.next_tx(stranger);
    delegation::revoke(&mut cap, scenario.ctx());

    destroy(cap);
    destroy(passport);
    scenario.end();
}

#[test]
fun test_is_expired_helper() {
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
        test_clock.set_for_testing(4_999);
        assert!(!delegation::is_expired(&cap, &test_clock), 0);

        test_clock.set_for_testing(5_000); // boundary: <= expiry is NOT expired
        assert!(!delegation::is_expired(&cap, &test_clock), 1);

        test_clock.set_for_testing(5_001);
        assert!(delegation::is_expired(&cap, &test_clock), 2);

        destroy(test_clock);
        destroy(cap);
        destroy(passport);
    };
    scenario.end();
}
