module agentos::skill_descriptor {
    public struct SkillDescriptor has key, store {
        id: UID,
        skill_id: vector<u8>,
        walrus_manifest_blob: vector<u8>,
        manifest_hash: vector<u8>,
        mvr_package_name: vector<u8>,
        version: vector<u8>,
        required_capabilities: vector<vector<u8>>,
        dependencies: vector<vector<u8>>,
    }

    public fun create(
        _skill_id: vector<u8>,
        _walrus_manifest_blob: vector<u8>,
        _manifest_hash: vector<u8>,
        _mvr_package_name: vector<u8>,
        _version: vector<u8>,
        ctx: &mut TxContext,
    ): SkillDescriptor {
        SkillDescriptor {
            id: object::new(ctx),
            skill_id: _skill_id,
            walrus_manifest_blob: _walrus_manifest_blob,
            manifest_hash: _manifest_hash,
            mvr_package_name: _mvr_package_name,
            version: _version,
            required_capabilities: vector[],
            dependencies: vector[],
        }
    }
}
