import React from "react";
import { useRoute } from "./lib/router";
import { useApi, useEvents } from "./lib/api";
import { Shell } from "./components/Shell";
import { ToastProvider, useToast } from "./components/Toasts";
import { OverviewPage, type Overview } from "./pages/OverviewPage";
import { MapPage } from "./pages/MapPage";
import { GradingPage } from "./pages/GradingPage";
import { GoldenPage } from "./pages/GoldenPage";
import { ReleasesPage } from "./pages/ReleasesPage";

const Inner: React.FC = () => {
  const [route, go] = useRoute();
  const overview = useApi<Overview>("/api/overview", ["seeded", "golden"]);
  const toast = useToast();
  useEvents((e) => {
    if (e.type === "warning") toast((e.payload as { reason: string }).reason, "warn");
    if (e.type === "gate") {
      const g = e.payload as { status: string };
      toast(`Release gate: ${g.status}`, g.status === "PASS" ? "good" : "bad");
    }
    if (e.type === "replay" && (e.payload as { status: string }).status === "done") toast("Replay finished: 7 more days of traffic are in", "good");
  });
  return (
    <Shell route={route} engagement={overview.data?.engagement ?? null} embedder={overview.data?.embedder} judge={overview.data?.judge}>
      {route === "overview" ? <OverviewPage go={go} /> : null}
      {route === "map" ? <MapPage go={go} /> : null}
      {route === "grading" ? <GradingPage go={go} /> : null}
      {route === "golden" ? <GoldenPage go={go} /> : null}
      {route === "releases" ? <ReleasesPage /> : null}
    </Shell>
  );
};

export const App: React.FC = () => (
  <ToastProvider>
    <Inner />
  </ToastProvider>
);
