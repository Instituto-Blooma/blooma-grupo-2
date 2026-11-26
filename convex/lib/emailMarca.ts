/**
 * Header of every e-mail: the "Abraço" logo (client/public/logo-email.png, served by the site)
 * and the name. E-mail apps do not show inline SVG, so the logo is a PNG at a public address;
 * without SITE_URL there is no public address and only the name is shown.
 */
export function cabecalhoDoEmail() {
  const site = process.env.SITE_URL?.trim().replace(/\/+$/, '');
  const logo = site
    ? `<img src="${site}/logo-email.png" width="48" height="48" alt="" style="vertical-align:middle;border:0;margin-right:10px">`
    : '';
  return `<p style="margin:0 0 20px;font-family:Georgia,serif;font-size:22px;color:#0A2436">${logo}<span style="vertical-align:middle">Olhar Humano</span></p>`;
}
