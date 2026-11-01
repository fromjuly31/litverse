// Static hosting uses hash routes, so a class can be reloaded without server rewrites.
export const hashRouting =
  import.meta.env?.VITE_ROUTER_MODE === "hash" ||
  globalThis.location?.protocol === "file:";

const isRoute = (path) =>
  typeof path === "string" &&
  !path.includes("#") &&
  /^\/(?:$|teacher(?:\/|\?|$)|admin(?:\/|\?|$)|exhibition(?:\/|\?|$)|login(?:\?|$)|activity\/|submit\/)/.test(path);

export function currentRoute() {
  return hashRouting
    ? location.hash.startsWith("#/")
      ? location.hash.slice(1)
      : "/"
    : location.pathname + location.search;
}

export function routeHref(path) {
  if (!isRoute(path)) return path;
  return hashRouting ? `${location.pathname}${location.search}#${path}` : path;
}

export function routeFromLink(link) {
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return null;
  if (
    hashRouting &&
    url.pathname === location.pathname &&
    url.hash.startsWith("#/")
  )
    return url.hash.slice(1);
  if (!url.hash && isRoute(url.pathname)) return url.pathname + url.search;
  return null;
}

export function prepareRouteLinks(root = document) {
  if (!hashRouting) return;
  root.querySelectorAll("a[href]").forEach((link) => {
    const path = link.getAttribute("href");
    if (isRoute(path)) link.setAttribute("href", routeHref(path));
  });
}

export function assetUrl(path) {
  if (!path?.startsWith("/") || path.startsWith("//")) return path;
  if (globalThis.__LITVERSE_ASSETS__?.[path])
    return globalThis.__LITVERSE_ASSETS__[path];
  const base = new URL(import.meta.env?.BASE_URL || "/", location.href);
  return new URL(path.slice(1), base).href;
}

export function publicRouteUrl(path) {
  const configured = import.meta.env?.VITE_PUBLIC_SITE_URL;
  if (configured) {
    const base = configured.replace(/\/$/, "");
    return hashRouting ? `${base}/#${path}` : `${base}${path}`;
  }
  return new URL(routeHref(path), location.href).href;
}
