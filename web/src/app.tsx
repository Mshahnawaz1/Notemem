import { useEffect } from "preact/hooks";
import { Route, Switch, useLocation } from "wouter";
import { ROOM_TITLE, metaFor } from "./lib/site";
import About from "./pages/About";
import Contact from "./pages/Contact";
import { NotFound, ServerError } from "./pages/ErrorPage";
import Home from "./pages/Home";
import Privacy from "./pages/Privacy";
import Room from "./pages/Room";
import Terms from "./pages/Terms";

/** Keeps the title and description right after client-side navigation; prerendering sets them for the first load. */
function usePageMeta(serverErrorAt?: string) {
  const [location] = useLocation();
  useEffect(() => {
    const isRoom = location.startsWith("/r/") && location !== serverErrorAt;
    const meta = metaFor(location === serverErrorAt ? "/500" : location);
    document.title = isRoom ? ROOM_TITLE : meta.title;
    if (!isRoom) document.querySelector('meta[name="description"]')?.setAttribute("content", meta.description);
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [location, serverErrorAt]);
}

export function App({ serverErrorAt }: { serverErrorAt?: string }) {
  usePageMeta(serverErrorAt);
  const [location] = useLocation();
  if (location === serverErrorAt) return <ServerError />;
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/500" component={ServerError} />
      <Route path="/r/:roomId/:secret" component={Room} />
      <Route path="/r/:roomId/:secret/pads/:padName" component={Room} />
      <Route component={NotFound} />
    </Switch>
  );
}
