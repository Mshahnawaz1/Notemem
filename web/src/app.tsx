import { Route, Switch } from "wouter";
import Home from "./pages/Home";
import Room from "./pages/Room";

export function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/r/:roomId/:secret" component={Room} />
      <Route path="/r/:roomId/:secret/pads/:padName" component={Room} />
      <Route>404, Not Found!</Route>
    </Switch>
  );
}
