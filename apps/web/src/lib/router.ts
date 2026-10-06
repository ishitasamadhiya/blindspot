import { useEffect, useState } from "react";

export type Route = "overview" | "map" | "grading" | "golden" | "releases";

const ROUTES: Route[] = ["overview", "map", "grading", "golden", "releases"];

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, "").split("?")[0] as Route;
  return ROUTES.includes(h) ? h : "overview";
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [route, (r) => (window.location.hash = `/${r}`)];
}
