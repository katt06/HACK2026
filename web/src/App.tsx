import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import Challenges from "./pages/Challenges";
import Dashboard from "./pages/Dashboard";
import Demo from "./pages/Demo";
import GoalDetail from "./pages/GoalDetail";
import Goals from "./pages/Goals";
import Group from "./pages/Group";
import Join from "./pages/Join";
import Leaderboard from "./pages/Leaderboard";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Shop from "./pages/Shop";
import Styleguide from "./pages/Styleguide";

// Slide charts: loaded on demand so the simulation data stays out of the main bundle.
const BanditDeck = lazy(() => import("./pages/BanditDeck"));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/styleguide" element={<Styleguide />} />
      <Route
        path="/deck/bandit"
        element={
          <Suspense fallback={null}>
            <BanditDeck />
          </Suspense>
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/goals/:goalId" element={<GoalDetail />} />
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/group" element={<Group />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/join/:code" element={<Join />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
