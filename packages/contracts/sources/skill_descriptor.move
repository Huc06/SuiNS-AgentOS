module agentos::skill_descriptor;

use sui::event;

// ===== Error Constants =====

const E_NOT_OWNER: u64 = 1;

// ===== Objects =====

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
    suins_subname: vector<u8>,
}

// ===== Events =====

public struct SkillPublished has copy, drop {
    descriptor: ID,
    owner: address,
    skill_id: vector<u8>,
    manifest_hash: vector<u8>,
}

public struct SkillUpdated has copy, drop {
    descriptor: ID,
    version: vector<u8>,
}

public struct SkillSealPolicySet has copy, drop {
    descriptor: ID,
    seal_policy_id: vector<u8>,
}

// ===== Public Functions =====

/// Create a new SkillDescriptor with suins_subname and required_capabilities.
public fun create(
    skill_id: vector<u8>,
    walrus_manifest_blob: vector<u8>,
    manifest_hash: vector<u8>,
    mvr_package_name: vector<u8>,
    version: vector<u8>,
    suins_subname: vector<u8>,
    required_capabilities: vector<vector<u8>>,
    ctx: &mut TxContext,
): SkillDescriptor {
    let descriptor = SkillDescriptor {
        id: object::new(ctx),
        owner: ctx.sender(),
        skill_id,
        walrus_manifest_blob,
        manifest_hash,
        mvr_package_name,
        version,
        required_capabilities,
        dependencies: vector[],
        seal_policy_id: vector[],
        suins_subname,
    };

    event::emit(SkillPublished {
        descriptor: object::id(&descriptor),
        owner: ctx.sender(),
        skill_id,
        manifest_hash,
    });

    descriptor
}

/// Update an existing descriptor's manifest blob, hash, and version.
/// Only the object owner can call this.
public fun update(
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

    event::emit(SkillUpdated {
        descriptor: object::id(descriptor),
        version: new_version,
    });
}

/// Set the seal policy id on a descriptor. Only the object owner can call this.
public fun set_seal_policy(
    descriptor: &mut SkillDescriptor,
    new_seal_policy_id: vector<u8>,
    ctx: &TxContext,
) {
    assert!(descriptor.owner == ctx.sender(), E_NOT_OWNER);
    descriptor.seal_policy_id = new_seal_policy_id;

    event::emit(SkillSealPolicySet {
        descriptor: object::id(descriptor),
        seal_policy_id: new_seal_policy_id,
    });
}

/// Set the dependencies on a descriptor. Only the object owner can call this.
public fun set_dependencies(
    descriptor: &mut SkillDescriptor,
    new_dependencies: vector<vector<u8>>,
    ctx: &TxContext,
) {
    assert!(descriptor.owner == ctx.sender(), E_NOT_OWNER);
    descriptor.dependencies = new_dependencies;
}

/// Set the required capabilities on a descriptor. Only the object owner can call this.
public fun set_required_capabilities(
    descriptor: &mut SkillDescriptor,
    new_capabilities: vector<vector<u8>>,
    ctx: &TxContext,
) {
    assert!(descriptor.owner == ctx.sender(), E_NOT_OWNER);
    descriptor.required_capabilities = new_capabilities;
}

/// Set the SuiNS subname record on a descriptor. Only the object owner can call this.
public fun set_suins_subname(
    descriptor: &mut SkillDescriptor,
    new_subname: vector<u8>,
    ctx: &TxContext,
) {
    assert!(descriptor.owner == ctx.sender(), E_NOT_OWNER);
    descriptor.suins_subname = new_subname;
}

// ===== Getters =====

public fun owner(descriptor: &SkillDescriptor): address {
    descriptor.owner
}

public fun skill_id(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.skill_id
}

public fun walrus_manifest_blob(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.walrus_manifest_blob
}

public fun manifest_hash(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.manifest_hash
}

public fun mvr_package_name(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.mvr_package_name
}

public fun version(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.version
}

public fun required_capabilities(descriptor: &SkillDescriptor): vector<vector<u8>> {
    descriptor.required_capabilities
}

public fun dependencies(descriptor: &SkillDescriptor): vector<vector<u8>> {
    descriptor.dependencies
}

public fun seal_policy_id(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.seal_policy_id
}

public fun suins_subname(descriptor: &SkillDescriptor): vector<u8> {
    descriptor.suins_subname
}
