export type PrincipalKind = "user" | "mcpKey" | "ip";

export interface Principal {
  kind: PrincipalKind;
  id: string;
}

export interface RequestIdentities {
  user?: Principal;
  mcpKey?: Principal;
  ip: Principal;
}

export function userPrincipal(userId: string): Principal {
  return { kind: "user", id: userId };
}

export function mcpKeyPrincipal(keyId: string): Principal {
  return { kind: "mcpKey", id: keyId };
}

export function ipPrincipal(address: string): Principal {
  return { kind: "ip", id: address };
}

export function principalKey(principal: Principal): string {
  return `${principal.kind}:${principal.id}`;
}

export function selectPrincipal(
  identities: RequestIdentities,
  keyBy: PrincipalKind,
): Principal {
  return (
    identities[keyBy] ?? identities.user ?? identities.mcpKey ?? identities.ip
  );
}
