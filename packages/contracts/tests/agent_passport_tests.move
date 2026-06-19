#[test_only]
module agentos::agent_passport_tests;

use agentos::agent_passport;
use std::unit_test::destroy;
use sui::test_scenario;

#[test]
fun test_create_passport() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        assert!(agent_passport::is_active(&passport), 0);
        assert!(agent_passport::owner(&passport) == owner, 1);
        assert!(agent_passport::suins_name(&passport) == b"alpha-agent", 2);
        assert!(agent_passport::runtime_wallet(&passport) == @0xB, 3);
        assert!(agent_passport::exec_count(&passport) == 0, 4);
        destroy(passport);
    };
    scenario.end();
}

#[test]
fun test_revoke_passport() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let mut passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        agent_passport::revoke(&mut passport, scenario.ctx());
        assert!(!agent_passport::is_active(&passport), 0);
        destroy(passport);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = agent_passport::E_NOT_OWNER)]
fun test_revoke_non_owner_aborts() {
    let owner = @0xA;
    let attacker = @0xD;
    let mut scenario = test_scenario::begin(owner);

    let mut passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    scenario.next_tx(attacker);
    agent_passport::revoke(&mut passport, scenario.ctx());

    destroy(passport);
    scenario.end();
}

#[test]
fun test_record_execution_by_owner() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let mut passport = agent_passport::create(
            b"alpha-agent",
            @0xB,
            scenario.ctx(),
        );
        assert!(agent_passport::exec_count(&passport) == 0, 0);

        agent_passport::record_execution(&mut passport, scenario.ctx());
        assert!(agent_passport::exec_count(&passport) == 1, 1);

        agent_passport::record_execution(&mut passport, scenario.ctx());
        assert!(agent_passport::exec_count(&passport) == 2, 2);

        destroy(passport);
    };
    scenario.end();
}

#[test]
fun test_record_execution_by_runtime_wallet() {
    let owner = @0xA;
    let runtime = @0xB;
    let mut scenario = test_scenario::begin(owner);

    let mut passport = agent_passport::create(
        b"alpha-agent",
        runtime,
        scenario.ctx(),
    );

    // Switch to runtime_wallet
    scenario.next_tx(runtime);
    agent_passport::record_execution(&mut passport, scenario.ctx());
    assert!(agent_passport::exec_count(&passport) == 1, 0);

    destroy(passport);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = agent_passport::E_NOT_AUTHORIZED)]
fun test_record_execution_unauthorized_aborts() {
    let owner = @0xA;
    let stranger = @0xF;
    let mut scenario = test_scenario::begin(owner);

    let mut passport = agent_passport::create(
        b"alpha-agent",
        @0xB,
        scenario.ctx(),
    );

    scenario.next_tx(stranger);
    agent_passport::record_execution(&mut passport, scenario.ctx());

    destroy(passport);
    scenario.end();
}
