import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import AuthLayout from "./components/AuthLayout.jsx";
import LKLayout from "./components/LKLayout.jsx";
import OrgConsoleLayout from "./components/OrgConsoleLayout.jsx";
import Overview from "./pages/console/Overview.jsx";
import Branding from "./pages/console/Branding.jsx";
import ConsoleSoon from "./pages/console/ConsoleSoon.jsx";
import Onboarding from "./pages/console/Onboarding.jsx";
import Signup from "./pages/console/Signup.jsx";
import ConsoleProgram from "./pages/console/ConsoleProgram.jsx";
import ConsoleParticipants from "./pages/console/ConsoleParticipants.jsx";
import ConsoleModeration from "./pages/console/ConsoleModeration.jsx";
import ConsoleDocs from "./pages/console/ConsoleDocs.jsx";
import ConsoleBilling from "./pages/console/ConsoleBilling.jsx";
import Welcome from "./pages/Welcome.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Profile from "./pages/Profile.jsx";
import Schedule from "./pages/Schedule.jsx";
import Admin from "./pages/Admin.jsx";
import Feedback from "./pages/Feedback.jsx";
import Chat from "./pages/Chat.jsx";
import Documents from "./pages/Documents.jsx";
import { isAuthenticated, getUser } from "./lib/auth.js";
import NoAccess from "./pages/NoAccess.jsx";
import NotFound from "./pages/NotFound.jsx";
import VerifyCertificate from "./pages/VerifyCertificate.jsx";
import Program from "./pages/Program.jsx";
import Sections from "./pages/Sections.jsx";
import About from "./pages/About.jsx";
import SectionDetail from "./pages/SectionDetail.jsx";
import Speakers from "./pages/Speakers.jsx";
import Venue from "./pages/Venue.jsx";
import Live from "./pages/Live.jsx";
import Map from "./pages/Map.jsx";
import Legal from "./pages/Legal.jsx";
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
      <Route path="console/signup" element={<Signup />} />
      <Route
        path="console/onboarding"
        element={
          <AdminRoute>
            <Onboarding />
          </AdminRoute>
        }
      />
      <Route
        path="console"
        element={
          <AdminRoute>
            <OrgConsoleLayout />
          </AdminRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="branding" element={<Branding />} />
        <Route path="program" element={<ConsoleProgram />} />
        <Route path="participants" element={<ConsoleParticipants />} />
        <Route path="checkin" element={<ConsoleSoon eyebrow="Регистрация на месте" title="Сканирование бейджей" />} />
        <Route path="moderation" element={<ConsoleModeration />} />
        <Route path="docs" element={<ConsoleDocs />} />
        <Route path="team" element={<ConsoleSoon eyebrow="Команда" title="Кто работает над конференцией" />} />
        <Route path="billing" element={<ConsoleBilling />} />
      </Route>
      <Route
        element={
          <ProtectedRoute>
            <LKLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="profile" element={<Profile />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="documents" element={<Documents />} />
        <Route path="chat" element={<Chat />} />
      </Route>
      <Route path="/" element={<Layout />}>
        <Route path="badge/:token" element={<BadgeCheckIn />} />
        <Route path="questions/:token" element={<QuestionPrompt />} />
        <Route path="questions/:token/approved" element={<ApprovedQuestions />} />
        <Route index element={<Welcome />} />
        <Route
          path="feedback"
          element={
            <ProtectedRoute>
              <Feedback />
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
        <Route path="legal" element={<Legal />} />
        <Route path="personal-data" element={<Legal initialDoc="privacy" />} />
        <Route path="consent-authors" element={<Legal initialDoc="consent" />} />
        <Route path="verify" element={<VerifyCertificate />} />
        <Route path="program" element={<Program />} />
        <Route path="sections" element={<Sections />} />
        <Route path="sections/:id" element={<SectionDetail />} />
        <Route path="about" element={<About />} />
        <Route path="speakers" element={<Speakers />} />
        <Route path="venue" element={<Venue />} />
        <Route path="live" element={<Live />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
