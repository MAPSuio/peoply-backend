/**
 * Upper bound for a registration's `formAnswer`.
 *
 * It is a reply to one question the organiser asked, not free storage. The
 * column is an unbounded `String?`, so before this the only ceiling was
 * Express' 100 kB body limit — enough for one account to write megabytes of
 * arbitrary text per minute into events it does not own, which every arranger
 * listing then has to serialise.
 *
 * Lives here because three DTOs on three different write paths accept the
 * field and all three have to agree.
 */
export const MAX_FORM_ANSWER_LENGTH = 2000;
