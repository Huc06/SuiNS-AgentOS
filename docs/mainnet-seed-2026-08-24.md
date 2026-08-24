# Mainnet demo seed data (2026-08-24)

Package: `0xe4e30b29e4aca4566e496bf3e221b32e33de92318a8d8992fe36df47f1530693`
(Move modules: agent_passport, attestation, bucket_policy, delegation, skill_descriptor)
Publish tx: `HxDGt4B388TVX1nzVMdZFr1s29cFiW1ouT3xVrVfRGnQ`
UpgradeCap: `0xeaedb7830025e041609f848ec6417efdc407cc70fa2adf494694811e8e994112`

Runtime wallet (owns all objects below): `0xfa5bbfd706c1bb4ec7f0624933bf9b3faba9f056e588bbb4acbd702759f1d83f`

This data is NOT written to `.agentos/registry.json` — that file's `slug`/
`suinsName` are unique per record regardless of network, so it cannot hold
both a testnet and mainnet record for the same agent name (e.g. `alpha.sui`).
Per the agreed 2-domain architecture, mainnet gets its own Postgres database
(a separate Vercel project) — this file is the source data to seed that
database once it exists.

## Agents (AgentPassport)

| slug | suinsName | passportId | tx |
|---|---|---|---|
| alpha | alpha.sui | `0xa43e9e67eedc5cae0b356326bdf6e39046111fe63c1ddf009b136417ba860bf9` | `6nQ2afWmdGfyyB3BRz7CLfGKXJNJMqE1Ygo5bF6TnM6f` |
| beta-agent | beta-agent.sui | `0x2e8b423a3656f419b06eacadfd06901aba03cd986f84d2706481686f9fa66013` | `5s3tMPdkJjGX2K4fLuwr67wdJWbRdr6vkehetdtVwAqb` |
| walrus-bot | walrus-bot.sui | `0x3f954e5792e90240fefa9ac194fa4317a5f154fa574ba660d0afdae9d4bde097` | `9yCwhZRKdVJeaiYA5Ud8Q2L11qq8xbWfPVyHErkB2hZt` |
| defi-rebalancer | defi-rebalancer.sui | `0xaba3d7e0d04fb1ad3f60961457ba5ba292b685874be230deaf3237260f029188` | `FDVq6WALZrRzfFcXNNaETntDwgAek7iaoUTPCjU51D2a` |
| sui-indexer | sui-indexer.sui | `0xa7cb145a25399daf1ddb4c8f08c45af3b195ee25f0a60b0a28b1c439e6917181` | `6Z7BXxUSgyYbqk1RZSSi6ed9qjhMQ4WMgG2f81oNbz4n` |

## Skills (SkillDescriptor, manifests on Walrus mainnet via the Upload Relay)

| agentSlug | skillId | version | objectId | walrusManifestBlob | manifestHash | endEpoch | tx |
|---|---|---|---|---|---|---|---|
| alpha | web-search | 1.0.0 | `0xe367c9039b90317b1b2ee583116c109e5281f2733b758b5977e66c17ec5c08ac` | `_Gfrds-sgh2ViYCFyflhvwuxfBLshGjI0tKlTLPupao` | `0xd6f9ce1f9e7575d9199ffa620995b805c43ed8ee84edd8e36f6c8962b6891eb5` | 90 | `JhsKDWc6m8Hhe31ro5xe41xKPaChn9CXyRJZmD3wYLm` |
| alpha | delegate-policy | 1.0.0 | `0x716e4cb101ebbede65a672e3ebd7c4241e335ba8cc45762468a9b6d96c60ed41` | `A44CIEfVC5N_7DYRbT57NJqG1pTgt_DKQy7MMS2-NoI` | `0x28e4d67a0eea12a9c6108a4359916e905807d46577717fd2bab82d81eed283f3` | 90 | `BzL9ATqfHZMdqzMw5NLh1vPcf4kCJt1ASVU6tZS9AhTf` |
| beta-agent | sandbox-tool | 0.9.0 | `0xd01544a02e1d01ef75a2099450ec30dc906b62c72ed6ec19d16a9fed1abd3e5e` | `JO1UGnPI8OTI6RxHacvpL6yhBW7xk9d2xvcEtQK5Yb4` | `0x876a52c11b988e677e112c90b1b421a949335a36fc3c393781f0a2b8167ea41c` | 90 | `HekRkZ2Vc41NCF2DVCgw2TpB6w5wTWbF8GRUAjJYowGL` |
| walrus-bot | walrus-read | 2.0.0 | `0x40f4457c136d181976c68e1e45ea638a331317f4a68a9e7f2b091334faf2b9cd` | `OfRjASMR82S1vR9YQ4vIAw4A1SIiPNoEed92GpkblzY` | `0x2ab39d40c0123b63c41ee43b68bc5b50b21c09d0f5e1ea8718c83894c1199c83` | 90 | `ANXF5BQiNmZc7Tarsg45ZTxcUEWy2UgdDZqRxUT57ifD` |

## Total cost

Wallet balance before: 0.87 SUI → after: 0.76 SUI (~0.11 SUI spent: contract
publish 0.0548 SUI + 5 agent mints + 4 Walrus Upload Relay tips + 4 skill
descriptor mints).

## Next steps to actually use this data

1. Create the mainnet Vercel project (separate domain, per the 2-domain plan).
2. Set `DATABASE_URL` to a NEW Neon database (do not share with testnet).
3. Run `scripts/schema.sql` against it.
4. Seed the 5 agents + 4 skills above into it (e.g. via a small one-off script
   using `RegistryStore.registerAgent`/`publishSkill` — NOT
   `scripts/migrate-to-postgres.ts`, which reads from
   `.agentos/registry.json`, which does not contain this mainnet data).
5. Set `NEXT_PUBLIC_AGENTOS_PACKAGE_ID=0xe4e30b29e4aca4566e496bf3e221b32e33de92318a8d8992fe36df47f1530693`
   and `NEXT_PUBLIC_SUI_NETWORK=mainnet` on that Vercel project.
