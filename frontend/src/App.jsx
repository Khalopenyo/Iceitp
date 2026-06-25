import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import AuthLayout from "./components/AuthLayout.jsx";
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
import NotFound from "./pages/NotFound.jsx";
import VerifyCertificate from "./pages/VerifyCertificate.jsx";
import Map from "./pages/Map.jsx";
import PersonalData from "./pages/PersonalData.jsx";
import ConsentAuthors from "./pages/ConsentAuthors.jsx";
import BadgeCheckIn from "./pages/BadgeCheckIn.jsx";
import QuestionPrompt from "./pages/QuestionPrompt.jsx";
import AdminQuestions from "./pages/AdminQuestions.jsx";
import ApprovedQuestions from "./pages/ApprovedQuestions.jsx";
import AdminApprovedQuestions from "./pages/AdminApprovedQuestions.jsx";
import { fetchBranding, applyBranding } from "./lib/org.js";

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
    return <Navigate to="/forbidden" replace />;
  }
  return children;
}

export default function App() {
  useEffect(() => {
    // Apply the resolved tenant's branding (primary color) over the academic-blue
    // defaults. Silent fallback to the defaults if the org has no custom color.
    fetchBranding().then((branding) => {
      if (branding) applyBranding(branding);
    });
  }, []);

  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
      </Route>
      <Route path="/" element={<Layout />}>
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
        <Route path="verify" element={<VerifyCertificate />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
