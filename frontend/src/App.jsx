import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Welcome from "./pages/Welcome.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Admin from "./pages/Admin.jsx";
import Feedback from "./pages/Feedback.jsx";
import Chat from "./pages/Chat.jsx";
import Documents from "./pages/Documents.jsx";
import { getToken, getUser } from "./lib/auth.js";
import NoAccess from "./pages/NoAccess.jsx";
import Map from "./pages/Map.jsx";
import PersonalData from "./pages/PersonalData.jsx";
import ConsentAuthors from "./pages/ConsentAuthors.jsx";

function ProtectedRoute({ children }) {
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const token = getToken();
  const user = getUser();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (!user || !["admin", "org"].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route index element={<Welcome />} />
        <Route
          path="dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="feedback"
          element={
            <ProtectedRoute>
              <Feedback />
            </ProtectedRoute>
          }
        />
        <Route
          path="chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route
          path="documents"
          element={
            <ProtectedRoute>
              <Documents />
            </ProtectedRoute>
          }
        />
        <Route
          path="map"
          element={
            <ProtectedRoute>
              <Map />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
          }
        />
        <Route path="forbidden" element={<NoAccess />} />
        <Route path="personal-data" element={<PersonalData />} />
        <Route path="consent-authors" element={<ConsentAuthors />} />
      </Route>
    </Routes>
  );
}
