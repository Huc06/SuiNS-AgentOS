import { NextRequest, NextResponse } from "next/server";

import { getRegistry } from "../../../lib/registry-server";
import {
  createSuinsClient,
  normalizeSuinsInput,
} from "../../../lib/suins-helpers";
import { getSuiNetwork } from "../../../lib/enoki-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json(
      { error: "name query parameter is required" },
      { status: 400 },
    );
  }

  try {
    // 1. Try local registry first
    const registry = getRegistry();
    const resolved = registry.resolveAgent(name);
    if (resolved) {
      return NextResponse.json({ ...resolved, source: "registry" });
    }

    // 2. Fall back to on-chain SuiNS resolution
    const network = getSuiNetwork();
    const { getFullnodeUrl } = await import("@mysten/sui/client");
    const { SuiClient } = await import("@mysten/sui/client");
    const client = new SuiClient({
      url: getFullnodeUrl(network === "mainnet" ? "mainnet" : "testnet"),
    });
    const suins = createSuinsClient(client as never, network);
    const normalized = normalizeSuinsInput(name);
    const record = await suins.getNameRecord(normalized);

    if (record && record.targetAddress) {
      return NextResponse.json({
        agent: {
          slug: name.replace(/\.sui$/, ""),
          suinsName: normalized,
          passportId: record.targetAddress,
          runtimeWallet: record.targetAddress,
          network,
          passportVersion: "On-chain",
          status: "active",
          createdAt: new Date().toISOString(),
        },
        skills: [],
        source: "suins",
      });
    }

    return NextResponse.json(
      { error: `Agent not found: ${name}` },
      { status: 404 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "resolve failed" },
      { status: 500 },
    );
  }
}
