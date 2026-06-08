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
            scenario.ctx(),
        );
        assert!(skill_descriptor::owner(&descriptor) == owner, 0);
        assert!(skill_descriptor::walrus_manifest_blob(&descriptor) == b"blob-1", 1);
        assert!(skill_descriptor::manifest_hash(&descriptor) == b"hash-1", 2);
        assert!(skill_descriptor::version(&descriptor) == b"1.0.0", 3);
        assert!(skill_descriptor::seal_policy_id(&descriptor) == vector[], 4);
        assert!(skill_descriptor::dependencies(&descriptor) == vector[], 5);
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
