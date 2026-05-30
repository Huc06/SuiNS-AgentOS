module agentos::bucket_policy {
    public struct BucketPolicy has key, store {
        id: UID,
        owner: address,
        seal_policy_id: address,
    }

    public fun seal_approve(
        _id: vector<u8>,
        policy: &BucketPolicy,
        ctx: &TxContext,
    ) {
        assert!(policy.owner == ctx.sender(), 0);
    }

    public fun create(
        _seal_policy_id: address,
        ctx: &mut TxContext,
    ): BucketPolicy {
        BucketPolicy {
            id: object::new(ctx),
            owner: ctx.sender(),
            seal_policy_id: _seal_policy_id,
        }
    }
}
