# Hall of Fame

Everyone who wrote code for the Peoply backend, split by the two homes the
repository has had: `Decidable-AS/peoply-backend` from the first commit on
2021-12-10, and `MAPSuio/peoply-backend` from the move on 2026-07-26.

Counts are non-merge commits on `master`, so they reflect authored work rather
than merge bubbles. Several people committed under more than one name or
address over the years; those identities are merged here, which is why the
numbers differ from a plain `git shortlog`.

## At `Decidable-AS` (2021-12-10 – 2026-07-26)

| # | Contributor | Commits |
|---:|---|---:|
| 1 | Christoffer Bjelke | 122 |
| 2 | Victor R. Uhnger (`vuhnger`) | 69 |
| 3 | Magnus Wiik Eckhoff (`Eckhoff42`) | 64 |
| 4 | Andreas Limi (`andreaslimidev`) | 27 |
| 5 | Preben Zahl (`Prebz98`) | 12 |
| 6 | Maximilian von Stephanides | 11 |
| 7 | Hans Aag (`hansaag`) | 5 |

**310 commits by 7 people.** A further 19 came from `dependabot[bot]`, which
is left out of the ranking above for obvious reasons.

## At `MAPSuio` (2026-07-26 – 2026-08-15)

| # | Contributor | Commits |
|---:|---|---:|
| 1 | Victor R. Uhnger (`vuhnger`) | 69 |
| 2 | Martin Jørgensen (`Martiwj`) | 4 |

**73 commits by 2 people.** A further 14 came from `dependabot[bot]`,
`maps-self-hosted-renovate[bot]` and `copilot-swe-agent[bot]`.

Martin's four are the ones that got Azure Maps out of the codebase: the
pluggable location search service that replaced it, plus the query validation
and timeouts around the external calls.

## Honorary mentions

For work that the commit count on this repository does not capture.

- **Henning Osmo Nordhagen (`henningnord`)** — no commits on `master` here yet.
  His backend work so far is pull request #162, retiring expired organization
  invitations from the notification feed, and he sits on the `maintainers` team
  that reviews and merges everything landing on `master`. His frontend commits
  are counted in that repository's Hall of Fame.

## Reproducing these numbers

The MAPSuio table comes straight out of this repository:

```bash
git shortlog -sn --no-merges --since=2026-07-26 master
```

The Decidable-AS table does not. Running the same command with `--until` here
gives a higher count than the table above, so those numbers stay as they were
computed in the old repository.

The command lists raw identities. To match the tables, fold these together:

- `Christoffer Bjelke` under both the GitHub noreply address and `outlook.com`
- `Eckhoff42` and `Magnus`
- `andreaslimidev` and `Andreas Limi`
- `hansaag` and `hans`
- `vuhger`, `Victor Uhnger` and `Victor R. Uhnger`
- `Martiwj` and `Martin Jørgensen`

The old repository is the only place the pre-migration history exists in full.
Keep it archived rather than deleted so these numbers stay verifiable.

The frontend has its own `HALL_OF_FAME.md` with a separate set of numbers; the
two repositories were never contributed to by exactly the same group.
