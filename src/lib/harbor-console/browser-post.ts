/** Check the browser's origin against the host that received the request. */
export function sameOriginBrowserPost(request: Request): string | null {
  const url = new URL(request.url);
  // Next can construct request.url with its internal loopback hostname.
  const host = request.headers.get("host") ?? url.host;
  const origin = `${url.protocol}//${host}`;
  return request.headers.get("origin") === origin ? origin : null;
}
