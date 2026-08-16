import { Event } from "../generated/prisma/client";
import { escapeHtml } from "./html";

export const EMAIL_DIVIDER = `<div style="border-bottom: 1px dashed #000; margin: 1rem 0; width: 100%;"></div>\n`;

/**
 * The closing every event email ends with: why the recipient got it, and
 * where to turn it off. `pastTense` is the difference between the emails sent
 * while someone is registered and the ones telling them they no longer are.
 */
export function eventEmailFooter(
  event: Pick<Partial<Event>, "title" | "urlId">,
  { pastTense = false } = {},
) {
  const title = escapeHtml(event.title);
  const urlId = escapeHtml(event.urlId);
  const reason = pastTense
    ? "fordi du var påmeldt"
    : "fordi du har meldt deg på";

  return (
    "<p>" +
    `Du mottar denne e-posten ${reason} <a href="https://peoply.app/events/${urlId}" target="_blank">"${title}"</a> på Peoply.\n` +
    "</p>" +
    "<p>" +
    `Hvis du ikke vil motta slike e-poster fra arrangøren, kan du endre dette i <a href="https://peoply.app/me/settings" target="_blank">dine innstillinger</a>` +
    "</p>"
  );
}

export function buildWaitlistedToGoingHtmlEmail(event: Event) {
  const title = escapeHtml(event.title);

  return (
    `<h1>Du har fått plass på ${title}!</h1>\n` +
    `<p>Du har rykket frem på ventelisten og fått en plass på arrangementet. Husk å melde deg av dersom du ikke kan komme.</p>\n` +
    EMAIL_DIVIDER +
    `<p> Du kan ikke svare på denne eposten. </p>` +
    eventEmailFooter(event)
  );
}
