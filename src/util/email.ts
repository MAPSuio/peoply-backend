import { Event } from "@prisma/client";

export function buildWaitlistedToGoingHtmlEmail(event: Event) {
  return (
    `<h1>Du har fått plass på ${event.title}!</h1>\n` +
    `<p>Du har rykket frem på ventelisten og fått en plass på arrangementet. Husk å melde deg av dersom du ikke kan komme.</p>\n` +
    `<div style="border-bottom: 1px dashed #000; margin: 1rem 0; width: 100%;"></div>\n` +
    `<p> Du kan ikke svare på denne eposten. </p>` +
    "<p>" +
    `Du mottar denne e-posten fordi du har meldt deg på <a href="https://peoply.app/events/${event.urlId}" target="_blank">"${event.title}"</a> på Peoply.\n` +
    "</p>" +
    "<p>" +
    `Hvis du ikke vil motta slike e-poster fra arrangøren, kan du endre dette i <a href="https://peoply.app/me/settings" target="_blank">dine innstillinger</a>` +
    "</p>"
  );
}
