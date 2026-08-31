import { AsyncLocalStorage } from "node:async_hooks";
import { resolveClientIp, type ClientIpRequest } from "../util/client-ip";
import {
  ipPrincipal,
  mcpKeyPrincipal,
  userPrincipal,
  type Principal,
} from "./principal";

export interface PrincipalRequest extends ClientIpRequest {
  user?: { id?: string };
  auth?: { extra?: { keyId?: string } };
}

interface RequestScope {
  request: PrincipalRequest;
}

const storage = new AsyncLocalStorage<RequestScope>();

export function runWithRequest<T>(request: PrincipalRequest, run: () => T): T {
  return storage.run({ request }, run);
}

function principalOfRequest(request: PrincipalRequest): Principal {
  const mcpKeyId = request.auth?.extra?.keyId;

  if (mcpKeyId) return mcpKeyPrincipal(mcpKeyId);

  const authenticatedUserId = request.user?.id;

  if (authenticatedUserId) return userPrincipal(authenticatedUserId);

  return ipPrincipal(resolveClientIp(request));
}

export function currentPrincipal(): Principal | null {
  const scope = storage.getStore();

  return scope ? principalOfRequest(scope.request) : null;
}
