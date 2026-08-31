export type PrincipalKind = "user" | "mcpKey" | "ip";

export interface Principal {
  kind: PrincipalKind;
  id: string;
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
