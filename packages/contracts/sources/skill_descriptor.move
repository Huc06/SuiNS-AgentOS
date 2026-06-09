module agentos::skill_descriptor;

const E_NOT_OWNER: u64 = 1;

public struct SkillDescriptor has key, store {
    id: UID,
    owner: address,
    skill_id: vector<u8>,
    walrus_manifest_blob: vector<u8>,
    manifest_hash: vector<u8>,
    mvr_package_name: vector<u8>,
    version: vector<u8>,
    required_capabilities: vector<vector<u8>>,
    dependencies: vector<vector<u8>>,
    seal_policy_id: vector<u8>,
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
        owner: ctx.sender(),
        skill_id: _skill_id,
        walrus_manifest_blob: _walrus_manifest_blob,
        manifest_hash: _manifest_hash,
        mvr_package_name: _mvr_package_name,
        version: _version,
        required_capabilities: vector[],
        dependencies: vector[],
        seal_policy_id: vector[],
    }
}

/// Update an existing descriptor's manifest blob, hash, and version.
/// Only the object owner can call this.
public entry fun update(
    descriptor: &mut SkillDescriptor,
    new_walrus_manifest_blob: vector<u8>,
    new_manifest_hash: vector<u8>,
    new_version: vector<u8>,
    ctx: &TxContext,
) {
    assert!(descriptor.owner == ctx.sender(), E_NOT_OWNER);
    descriptor.walrus_manifest_blob = new_walrus_manifest_blob;
    descriptor.manifest_hash = new_manifest_hash;
    descriptor.version = new_version;
}

/// Set the seal policy id on a descriptor. Only the object owner can call this.
public entry fun set_seal_policy(
    descriptor: &mut SkillDescriptor,
    new_seal_policy_id: vector<u8>,
    ctx: &TxContext,
) {
    assert!(descriptor.owner == ctx.sender(), E_NOT_OWNER);
    descriptor.seal_policy_id = new_seal_policy_id;
}

/// Set the dependencies on a descriptor. Only the object owner can call this.
public entry fun set_dependencies(
    descriptor: &mut SkillDescriptor,
    new_dependencies: vector<vector<u8>>,
    ctx: &TxContext,
) {
    assert!(descriptor.owner == ctx.sender(), E_NOT_OWNER);
    descriptor.dependencies = new_dependencies;
}

public fun owner(descriptor: &SkillDescriptor): address {
    descriptor.owner
}

public fun walrus_manifest_blob(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.walrus_manifest_blob
}

public fun manifest_hash(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.manifest_hash
}

public fun version(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.version
}

public fun seal_policy_id(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.seal_policy_id
}

public fun dependencies(descriptor: &SkillDescriptor): vector<vector<u8>> {
    descriptor.dependencies
}
