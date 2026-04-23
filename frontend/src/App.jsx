import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Welcome from "./pages/Welcome.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Admin from "./pages/Admin.jsx";
import Feedback from "./pages/Feedback.jsx";
import Chat from "./pages/Chat.jsx";
import Documents from "./pages/Documents.jsx";
import { isAuthenticated, getUser } from "./lib/auth.js";
import NoAccess from "./pages/NoAccess.jsx";
import Map from "./pages/Map.jsx";
import PersonalData from "./pages/PersonalData.jsx";
import ConsentAuthors from "./pages/ConsentAuthors.jsx";
import BadgeCheckIn from "./pages/BadgeCheckIn.jsx";
import QuestionPrompt from "./pages/QuestionPrompt.jsx";
import AdminQuestions from "./pages/AdminQuestions.jsx";
import ApprovedQuestions from "./pages/ApprovedQuestions.jsx";
import AdminApprovedQuestions from "./pages/AdminApprovedQuestions.jsx";

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const user = getUser();
  if (!user) {
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
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="badge/:token" element={<BadgeCheckIn />} />
        <Route path="questions/:token" element={<QuestionPrompt />} />
        <Route path="questions/:token/approved" element={<ApprovedQuestions />} />
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
          path="admin/questions/approved"
          element={
            <AdminRoute>
              <AdminApprovedQuestions />
            </AdminRoute>
          }
        />
        <Route
          path="admin/questions"
          element={
            <AdminRoute>
              <AdminQuestions />
            </AdminRoute>
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
