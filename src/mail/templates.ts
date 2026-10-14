import { Event } from "../generated/prisma/client";
import { escapeHtml } from "../util/html";

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function emailLayout(
  { html, footer }: { html: string; footer?: string },
  assets: string,
) {
  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>
h1{margin:0 0 16px;font-size:24px;line-height:1.25;color:#1E2630}
p{margin:0 0 16px}
p:last-child{margin-bottom:0}
a{color:#4D21F7}
</style>
</head>
<body style="margin:0;padding:0;background-color:#24107A;background-image:url('${assets}/background.png')">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#24107A" style="background-color:#24107A;background-image:url('${assets}/background.png')">
<tr>
<td align="center" background="${assets}/background.png" bgcolor="#24107A" style="padding:40px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr>
<td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:16px;padding:32px 28px;font-family:${FONT};font-size:16px;line-height:1.5;color:#1E2630">
${html}
<p style="margin:24px 0 0">Mvh<br>Peoply-teamet</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px">
<tr>
<td style="padding-right:20px"><a href="https://peoply.app" target="_blank"><img src="${assets}/peoply.png" width="96" height="34" alt="Peoply" style="display:block;border:0"></a></td>
<td><a href="https://foreninger.uio.no/maps/" target="_blank"><img src="${assets}/maps.png" width="56" height="32" alt="MAPS" style="display:block;border:0"></a></td>
</tr>
</table>
${footer ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E6E3F2;font-size:13px;line-height:1.5;color:#5B6472">${footer}</div>` : ""}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

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

  return {
    html:
      `<h1>Du har fått plass på ${title}!</h1>\n` +
      `<p>Du har rykket frem på ventelisten og fått en plass på arrangementet. Husk å melde deg av dersom du ikke kan komme.</p>\n`,
    footer: `<p>Du kan ikke svare på denne eposten.</p>${eventEmailFooter(event)}`,
  };
}
