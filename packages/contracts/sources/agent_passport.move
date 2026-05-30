module agentos::agent_passport {
    public struct AgentPassport has key, store {
        id: UID,
        owner: address,
        suins_name: vector<u8>,
        runtime_wallet: address,
        policy_root: address,
        skill_root: address,
        memory_namespace: vector<u8>,
        is_active: bool,
    }

    public fun create(
        _suins_name: vector<u8>,
        _runtime_wallet: address,
        ctx: &mut TxContext,
    ): AgentPassport {
        AgentPassport {
            id: object::new(ctx),
            owner: ctx.sender(),
            suins_name: _suins_name,
            runtime_wallet: _runtime_wallet,
            policy_root: @0x0,
            skill_root: @0x0,
            memory_namespace: vector[],
            is_active: true,
        }
    }

    public fun is_active(passport: &AgentPassport): bool {
        passport.is_active
    }

    public fun revoke(passport: &mut AgentPassport, ctx: &TxContext) {
        assert!(passport.owner == ctx.sender(), 0);
        passport.is_active = false;
    }
}
