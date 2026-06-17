import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Calendar from "./pages/Calendar";
import Consultants from "./pages/Consultants";
import Projects from "./pages/Projects";
import Simulation from "./pages/Simulation";
import Absences from "./pages/Absences";
import Scheduling from "./pages/Scheduling";
import Home from "./pages/Home";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard">
        <AppLayout>
          <Dashboard />
        </AppLayout>
      </Route>
      <Route path="/calendar">
        <AppLayout>
          <Calendar />
        </AppLayout>
      </Route>
      <Route path="/consultants">
        <AppLayout>
          <Consultants />
        </AppLayout>
      </Route>
      <Route path="/projects">
        <AppLayout>
          <Projects />
        </AppLayout>
      </Route>
      <Route path="/simulation">
        <AppLayout>
          <Simulation />
        </AppLayout>
      </Route>
      <Route path="/absences">
        <AppLayout>
          <Absences />
        </AppLayout>
      </Route>
      <Route path="/scheduling">
        <AppLayout>
          <Scheduling />
        </AppLayout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
