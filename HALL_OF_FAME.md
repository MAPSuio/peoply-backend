# Hall of Fame

Everyone who wrote code for the Peoply backend while it lived at
`Decidable-AS/peoply-backend`, from the first commit on 2021-12-10 until the
repository moved to `MAPSuio/peoply-backend` on 2026-07-26.

Counts are non-merge commits on `master`, so they reflect authored work rather
than merge bubbles. Several people committed under more than one name or
address over the years; those identities are merged here, which is why the
numbers differ from a plain `git shortlog`.

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

## Reproducing these numbers

```bash
git shortlog -sn --no-merges master
```

That command lists raw identities. To match the table, fold these together:

- `Christoffer Bjelke` under both the GitHub noreply address and `outlook.com`
- `Eckhoff42` and `Magnus`
- `andreaslimidev` and `Andreas Limi`
- `hansaag` and `hans`

The old repository is the only place the pre-migration history exists in full.
Keep it archived rather than deleted so these numbers stay verifiable.

The frontend has its own `HALL_OF_FAME.md` with a separate set of numbers; the
two repositories were never contributed to by exactly the same group.
