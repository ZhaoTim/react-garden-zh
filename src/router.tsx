import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: import.meta.env.BASE_URL,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Loaders are cheap server-fn calls; let the router cache them briefly instead of refetching on every hover.
    defaultPreloadStaleTime: 30_000,
    defaultStructuralSharing: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
