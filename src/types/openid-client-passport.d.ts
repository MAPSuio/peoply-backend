/*
 * tsconfig has resolvePackageJsonExports off, so the compiler never reads the
 * "./passport" entry in openid-client's exports map and cannot resolve the
 * subpath on its own. Node reads the map at runtime and resolves it fine -
 * this shim only points the compiler at the declaration file behind it.
 */
declare module "openid-client/passport" {
  export * from "openid-client/build/passport";
}
