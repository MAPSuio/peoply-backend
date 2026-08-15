# Domain glossary

Short entries for the terms the code leans on. Each names the module that owns
it, so a reader knows where the rules live.

- **Arranger** — the party an event belongs to. Either an individual user's
  arranger row or an organization's. An event can have several, each with an
  `EventArrangerRole` (`ADMIN` or `COLLABORATOR`).
- **EventAccess** — the module (`src/event-access/`) that answers "may this
  user act on or see this event?" in one place. Owns arranger-role resolution
  (a direct arranger row, or a qualifying role in an organization that
  arranges the event) and the read gate (visibility plus view-granting
  registration statuses). Consumed by `EventRolesGuard`,
  `IsArrangerInterceptor`, `EventsService`, registrations and favorites.
  Organization membership rules (who may edit an organization itself) are
  deliberately outside it.
- **View-granting registration** — a registration whose status (`INVITED`,
  `GOING`, `WAITLISTED`) lets the holder read a non-public event. `NOT_GOING`
  and `BANNED` are deliberately absent: declining an invitation and being
  thrown out both end access.
