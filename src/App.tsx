import ScoutingReview from "./pages/ScoutingReview";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import PitScouting from "./pages/PitScouting";
import Scouting from "./pages/Scouting";
import Login from "./pages/Login";
import Dev from "./pages/Dev";
import ScoutConfig from "./pages/ScoutConfig";
import { Toaster } from "./components/ui/toaster";

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
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
              path="/manager"
              element={
                <ProtectedRoute requireManager={true}>
                  <ManagerDashboard />
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
              path="/dev"
              element={
                <ProtectedRoute>
                  <Dev />
                </ProtectedRoute>
              }
            />
            <Route path="/review/:encoded" element={<ScoutingReview />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
