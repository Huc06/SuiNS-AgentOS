#[test_only]
module agentos::skill_descriptor_tests;

use agentos::skill_descriptor;
use std::unit_test::destroy;
use sui::test_scenario;

#[test]
fun test_create_defaults() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let descriptor = skill_descriptor::create(
            b"trade",
            b"blob-1",
            b"hash-1",
            b"@org/pkg",
            b"1.0.0",
            b"trade.alpha.sui",
            vector[b"execute_skill"],
            scenario.ctx(),
        );
        assert!(skill_descriptor::owner(&descriptor) == owner, 0);
        assert!(skill_descriptor::skill_id(&descriptor) == b"trade", 1);
        assert!(skill_descriptor::walrus_manifest_blob(&descriptor) == b"blob-1", 2);
        assert!(skill_descriptor::manifest_hash(&descriptor) == b"hash-1", 3);
        assert!(skill_descriptor::mvr_package_name(&descriptor) == b"@org/pkg", 4);
        assert!(skill_descriptor::version(&descriptor) == b"1.0.0", 5);
        assert!(skill_descriptor::suins_subname(&descriptor) == b"trade.alpha.sui", 6);
        assert!(
            skill_descriptor::required_capabilities(&descriptor) == vector[b"execute_skill"],
            7,
        );
        assert!(skill_descriptor::seal_policy_id(&descriptor) == vector[], 8);
        assert!(skill_descriptor::dependencies(&descriptor) == vector[], 9);
        destroy(descriptor);
    };
    scenario.end();
}

#[test]
fun test_create_empty_subname_and_capabilities() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let descriptor = skill_descriptor::create(
            b"trade",
            b"blob-1",
            b"hash-1",
            b"@org/pkg",
            b"1.0.0",
            vector[], // no subname
            vector[], // no capabilities
            scenario.ctx(),
        );
        assert!(skill_descriptor::suins_subname(&descriptor) == vector[], 0);
        assert!(skill_descriptor::required_capabilities(&descriptor) == vector[], 1);
        destroy(descriptor);
    };
    scenario.end();
}

#[test]
fun test_update_success() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let mut descriptor = skill_descriptor::create(
            b"trade",
            b"blob-1",
            b"hash-1",
            b"@org/pkg",
            b"1.0.0",
            b"trade.alpha.sui",
            vector[],
            scenario.ctx(),
        );
        skill_descriptor::update(
            &mut descriptor,
            b"blob-2",
            b"hash-2",
            b"2.0.0",
            scenario.ctx(),
        );
        assert!(skill_descriptor::walrus_manifest_blob(&descriptor) == b"blob-2", 0);
        assert!(skill_descriptor::manifest_hash(&descriptor) == b"hash-2", 1);
        assert!(skill_descriptor::version(&descriptor) == b"2.0.0", 2);
        destroy(descriptor);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = skill_descriptor::E_NOT_OWNER)]
fun test_update_non_owner_aborts() {
    let owner = @0xA;
    let attacker = @0xB;
    let mut scenario = test_scenario::begin(owner);
    let descriptor = skill_descriptor::create(
        b"trade",
        b"blob-1",
        b"hash-1",
        b"@org/pkg",
        b"1.0.0",
        b"trade.alpha.sui",
        vector[],
        scenario.ctx(),
    );
    scenario.next_tx(attacker);
    let mut descriptor = descriptor;
    skill_descriptor::update(
        &mut descriptor,
        b"blob-2",
        b"hash-2",
        b"2.0.0",
        scenario.ctx(),
    );
    destroy(descriptor);
    scenario.end();
}

#[test]
fun test_set_seal_policy() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let mut descriptor = skill_descriptor::create(
            b"trade",
            b"blob-1",
            b"hash-1",
            b"@org/pkg",
            b"1.0.0",
            b"trade.alpha.sui",
            vector[],
            scenario.ctx(),
        );
        skill_descriptor::set_seal_policy(
            &mut descriptor,
            b"policy-123",
            scenario.ctx(),
        );
        assert!(skill_descriptor::seal_policy_id(&descriptor) == b"policy-123", 0);
        destroy(descriptor);
    };
    scenario.end();
}

#[test]
fun test_set_dependencies() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let mut descriptor = skill_descriptor::create(
            b"trade",
            b"blob-1",
            b"hash-1",
            b"@org/pkg",
            b"1.0.0",
            b"trade.alpha.sui",
            vector[],
            scenario.ctx(),
        );
        let deps = vector[b"dep-a.alpha.sui", b"dep-b.alpha.sui"];
        skill_descriptor::set_dependencies(
            &mut descriptor,
            deps,
            scenario.ctx(),
        );
        assert!(
            skill_descriptor::dependencies(&descriptor) == vector[b"dep-a.alpha.sui", b"dep-b.alpha.sui"],
            0,
        );
        destroy(descriptor);
    };
    scenario.end();
}

#[test]
fun test_set_required_capabilities() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let mut descriptor = skill_descriptor::create(
            b"trade",
            b"blob-1",
            b"hash-1",
            b"@org/pkg",
            b"1.0.0",
            b"trade.alpha.sui",
            vector[], // start empty
            scenario.ctx(),
        );
        let caps = vector[b"execute_skill", b"transfer", b"read_memory"];
        skill_descriptor::set_required_capabilities(
            &mut descriptor,
            caps,
            scenario.ctx(),
        );
        assert!(
            skill_descriptor::required_capabilities(&descriptor) == vector[b"execute_skill", b"transfer", b"read_memory"],
            0,
        );
        destroy(descriptor);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = skill_descriptor::E_NOT_OWNER)]
fun test_set_required_capabilities_non_owner_aborts() {
    let owner = @0xA;
    let attacker = @0xB;
    let mut scenario = test_scenario::begin(owner);

    let mut descriptor = skill_descriptor::create(
        b"trade",
        b"blob-1",
        b"hash-1",
        b"@org/pkg",
        b"1.0.0",
        b"trade.alpha.sui",
        vector[],
        scenario.ctx(),
    );

    scenario.next_tx(attacker);
    skill_descriptor::set_required_capabilities(
        &mut descriptor,
        vector[b"hack"],
        scenario.ctx(),
    );

    destroy(descriptor);
    scenario.end();
}

#[test]
fun test_set_suins_subname() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);
    {
        let mut descriptor = skill_descriptor::create(
            b"trade",
            b"blob-1",
            b"hash-1",
            b"@org/pkg",
            b"1.0.0",
            vector[], // start empty
            vector[],
            scenario.ctx(),
        );
        skill_descriptor::set_suins_subname(
            &mut descriptor,
            b"trade.alpha.sui",
            scenario.ctx(),
        );
        assert!(skill_descriptor::suins_subname(&descriptor) == b"trade.alpha.sui", 0);
        destroy(descriptor);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = skill_descriptor::E_NOT_OWNER)]
fun test_set_suins_subname_non_owner_aborts() {
    let owner = @0xA;
    let attacker = @0xB;
    let mut scenario = test_scenario::begin(owner);

    let mut descriptor = skill_descriptor::create(
        b"trade",
        b"blob-1",
        b"hash-1",
        b"@org/pkg",
        b"1.0.0",
        vector[],
        vector[],
        scenario.ctx(),
    );

    scenario.next_tx(attacker);
    skill_descriptor::set_suins_subname(
        &mut descriptor,
        b"evil.attacker.sui",
        scenario.ctx(),
    );

    destroy(descriptor);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = skill_descriptor::E_NOT_OWNER)]
fun test_set_seal_policy_non_owner_aborts() {
    let owner = @0xA;
    let attacker = @0xB;
    let mut scenario = test_scenario::begin(owner);

    let mut descriptor = skill_descriptor::create(
        b"trade",
        b"blob-1",
        b"hash-1",
        b"@org/pkg",
        b"1.0.0",
        vector[],
        vector[],
        scenario.ctx(),
    );

    scenario.next_tx(attacker);
    skill_descriptor::set_seal_policy(
        &mut descriptor,
        b"evil-policy",
        scenario.ctx(),
    );

    destroy(descriptor);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = skill_descriptor::E_NOT_OWNER)]
fun test_set_dependencies_non_owner_aborts() {
    let owner = @0xA;
    let attacker = @0xB;
    let mut scenario = test_scenario::begin(owner);

    let mut descriptor = skill_descriptor::create(
        b"trade",
        b"blob-1",
        b"hash-1",
        b"@org/pkg",
        b"1.0.0",
        vector[],
        vector[],
        scenario.ctx(),
    );

    scenario.next_tx(attacker);
    skill_descriptor::set_dependencies(
        &mut descriptor,
        vector[b"evil-dep"],
        scenario.ctx(),
    );

    destroy(descriptor);
    scenario.end();
}
