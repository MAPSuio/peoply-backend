/**
 * Enforces the Conventional Commits format that CONTRIBUTING.md asks for.
 *
 * The shared config allows build, chore, ci, docs, feat, fix, perf, refactor,
 * revert, style and test — a superset of what this repo's history already uses.
 * Merge, revert and fixup!/squash! messages are ignored by default, so `git
 * merge` and `git commit --fixup` keep working.
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
};
