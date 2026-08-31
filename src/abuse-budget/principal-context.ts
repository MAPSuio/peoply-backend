import { AsyncLocalStorage } from "node:async_hooks";
import { resolveClientIp, type ClientIpRequest } from "../util/client-ip";
import {
  ipPrincipal,
  mcpKeyPrincipal,
  userPrincipal,
  type RequestIdentities,
} from "./principal";

export interface PrincipalRequest extends ClientIpRequest {
  user?: { id?: string };
  auth?: { extra?: { keyId?: string; user?: { id?: string } } };
}

interface RequestScope {
  request: PrincipalRequest;
}

const storage = new AsyncLocalStorage<RequestScope>();

export function runWithRequest<T>(request: PrincipalRequest, run: () => T): T {
  return storage.run({ request }, run);
}

function identitiesOfRequest(request: PrincipalRequest): RequestIdentities {
  const authenticatedUserId = request.user?.id ?? request.auth?.extra?.user?.id;
  const mcpKeyId = request.auth?.extra?.keyId;

  return {
    user: authenticatedUserId ? userPrincipal(authenticatedUserId) : undefined,
    mcpKey: mcpKeyId ? mcpKeyPrincipal(mcpKeyId) : undefined,
    ip: ipPrincipal(resolveClientIp(request)),
  };
}

export function currentIdentities(): RequestIdentities | null {
  const scope = storage.getStore();

  return scope ? identitiesOfRequest(scope.request) : null;
}
