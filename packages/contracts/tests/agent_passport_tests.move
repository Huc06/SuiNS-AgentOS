#[test_only]
module agentos::agent_passport_tests {
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
}
