import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import PitScouting from "./pages/PitScouting";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/manager" element={<ManagerDashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/pit-scouting" element={<PitScouting />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
