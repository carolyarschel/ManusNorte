import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppLayout } from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Calendar from "./pages/Calendar";
import Consultants from "./pages/Consultants";
import Projects from "./pages/Projects";
import Simulation from "./pages/Simulation";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={() => <Redirect to="/calendar" />} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/consultants" component={Consultants} />
        <Route path="/projects" component={Projects} />
        <Route path="/simulation" component={Simulation} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
