type HeaderValue = string | string[] | undefined;

interface HeaderLike {
  origin?: HeaderValue;
  referer?: HeaderValue;
}

function getSingleHeaderValue(value: HeaderValue) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function parseTrustedOrigins(corsOrigin?: string) {
  return (corsOrigin ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function extractRequestOrigin(headers: HeaderLike) {
  const directOrigin = getSingleHeaderValue(headers.origin);
  if (directOrigin) {
    return directOrigin;
  }

  const referer = getSingleHeaderValue(headers.referer);
  if (!referer) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
