module gm_overflow::gm {
    use sui::event;

    public struct GmEvent has copy, drop {
        message: vector<u8>,
        sender: address,
    }

    /// Emit a GM greeting on-chain. Called by AgentOS skill execution.
    public fun gm(ctx: &mut TxContext) {
        event::emit(GmEvent {
            message: b"GM Sui Overflow 2026",
            sender: ctx.sender(),
        });
    }
}
