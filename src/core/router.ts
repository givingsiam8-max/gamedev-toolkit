/**
 * Minimal hash router. Hash routing keeps the build a static bundle that works
 * from any folder or sub-path without server rewrites.
 */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'category'; categoryId: string; subcategoryId?: string }
  | { name: 'tool'; toolId: string }
  | { name: 'favorites' }
  | { name: 'recent' }
  | { name: 'search'; query: string };

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'category':
      return route.subcategoryId
        ? `#/c/${route.categoryId}/${route.subcategoryId}`
        : `#/c/${route.categoryId}`;
    case 'tool':
      return `#/t/${route.toolId}`;
    case 'favorites':
      return '#/favorites';
    case 'recent':
      return '#/recent';
    case 'search':
      return `#/search/${encodeURIComponent(route.query)}`;
    default:
      return '#/';
  }
}

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '').trim();
  if (!clean) return { name: 'home' };
  const parts = clean.split('/').map((part) => decodeURIComponent(part));

  switch (parts[0]) {
    case 'c':
      if (!parts[1]) return { name: 'home' };
      return { name: 'category', categoryId: parts[1], subcategoryId: parts[2] || undefined };
    case 't':
      return parts[1] ? { name: 'tool', toolId: parts[1] } : { name: 'home' };
    case 'favorites':
      return { name: 'favorites' };
    case 'recent':
      return { name: 'recent' };
    case 'search':
      return { name: 'search', query: parts.slice(1).join('/') };
    default:
      return { name: 'home' };
  }
}

export function navigate(route: Route): void {
  const hash = routeToHash(route);
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
