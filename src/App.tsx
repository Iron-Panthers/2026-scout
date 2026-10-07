import ScoutingReview from "./pages/ScoutingReview";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import StrategyDashboard from "./pages/StrategyDashboard";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import PitScouting from "./pages/PitScouting";
import Scouting from "./pages/Scouting";
import QualScouting from "./pages/QualScouting";
import Login from "./pages/Login";
import Dev from "./pages/Dev";
import ScoutConfig from "./pages/ScoutConfig";
import NotificationTest from "./pages/NotificationTest";
import RealtimeTest from "./pages/RealtimeTest";
import SimpleRealtimeTest from "./pages/SimpleRealtimeTest";
import PushTest from "./pages/PushTest";
import Betting from "./pages/Betting";
import MatchBetting from "./pages/MatchBetting";
import Shop from "./pages/Shop";
import AvatarPage from "./pages/Avatar";
import { Toaster } from "./components/ui/toaster";
import UpdateBanner from "./components/UpdateBanner";
import NotificationNavigationListener from "./components/NotificationNavigationListener";
import GuestDashboard from "./pages/GuestDashboard";
import { DevModeProvider } from "./contexts/DevModeContext";
import DevModeBanner from "./components/DevModeBanner";

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <DevModeProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <DevModeBanner />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/guest"
              element={
                <GuestDashboard />
              }
            />
            <Route
              path="/manager"
              element={
                <ProtectedRoute requireManager={true}>
                  <ManagerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/strategy"
              element={
                <ProtectedRoute>
                  <StrategyDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pit-scouting"
              element={
                <ProtectedRoute>
                  <PitScouting />
                </ProtectedRoute>
              }
            />
            {/* Scouting */}
            <Route
              path="/config/:match_id?"
              element={
                <ProtectedRoute>
                  <ScoutConfig />
                </ProtectedRoute>
              }
            />
            <Route
              path="/scouting"
              element={
                <ProtectedRoute>
                  <Scouting />
                </ProtectedRoute>
              }
            />
            <Route
              path="/qual-scouting"
              element={
                <ProtectedRoute>
                  <QualScouting />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dev"
              element={
                <ProtectedRoute>
                  <Dev />
                </ProtectedRoute>
              }
            />
            <Route
              path="/test-notifications"
              element={
                <ProtectedRoute requireDeveloper={true}>
                  <NotificationTest />
                </ProtectedRoute>
              }
            />
            <Route
              path="/test-realtime"
              element={
                <ProtectedRoute requireDeveloper={true}>
                  <RealtimeTest />
                </ProtectedRoute>
              }
            />
            <Route
              path="/test-simple"
              element={
                <ProtectedRoute requireDeveloper={true}>
                  <SimpleRealtimeTest />
                </ProtectedRoute>
              }
            />
            <Route
              path="/test-push"
              element={
                <ProtectedRoute requireDeveloper={true}>
                  <PushTest />
                </ProtectedRoute>
              }
            />
            <Route path="/review/:encoded" element={<ScoutingReview />} />
            {/* Shop */}
            <Route
              path="/shop"
              element={
                <ProtectedRoute>
                  <Shop />
                </ProtectedRoute>
              }
            />
            {/* Avatar / owned cosmetics */}
            <Route
              path="/avatar"
              element={
                <ProtectedRoute>
                  <AvatarPage />
                </ProtectedRoute>
              }
            />
            {/* Betting */}
            <Route
              path="/betting"
              element={
                <ProtectedRoute>
                  <Betting />
                </ProtectedRoute>
              }
            />
            <Route
              path="/betting/:match_id"
              element={
                <ProtectedRoute>
                  <MatchBetting />
                </ProtectedRoute>
              }
            />
          </Routes>
          <Toaster />
          <UpdateBanner />
          <NotificationNavigationListener />
        </BrowserRouter>
        </DevModeProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
