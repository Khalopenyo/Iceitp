import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import AuthLayout from "./components/AuthLayout.jsx";
import LKLayout from "./components/LKLayout.jsx";
import OrgConsoleLayout from "./components/OrgConsoleLayout.jsx";
import Overview from "./pages/console/Overview.jsx";
import Branding from "./pages/console/Branding.jsx";
import Onboarding from "./pages/console/Onboarding.jsx";
import Signup from "./pages/console/Signup.jsx";
import OpsLayout from "./components/OpsLayout.jsx";
import OpsDashboard from "./pages/ops/OpsDashboard.jsx";
import OpsTenants from "./pages/ops/OpsTenants.jsx";
import ConsoleProgram from "./pages/console/ConsoleProgram.jsx";
import ConsoleParticipants from "./pages/console/ConsoleParticipants.jsx";
import ConsoleModeration from "./pages/console/ConsoleModeration.jsx";
import ConsoleDocs from "./pages/console/ConsoleDocs.jsx";
import ConsoleBilling from "./pages/console/ConsoleBilling.jsx";
import ConsoleCheckin from "./pages/console/ConsoleCheckin.jsx";
import ConsoleTeam from "./pages/console/ConsoleTeam.jsx";
import EventShell from "./components/EventShell.jsx";
import EventLanding from "./pages/event/EventLanding.jsx";
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
  // Оператор платформы — не участник; уводим в его консоль, а не в участника ЛК.
  if (getUser()?.role === "operator") {
    return <Navigate to="/ops" replace />;
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

// ConsoleRoute guards the organizer console: the owner (org/admin) AND invited
// staff reach it; owner-only operations are gated server-side and hidden in the UI.
function ConsoleRoute({ children }) {
  const user = getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!["admin", "org", "staff"].includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }
  return children;
}

// OwnerRoute guards owner-only console pages (branding, billing): invited staff are
// bounced back to the console overview. The server enforces these too (403); this
// keeps staff from landing on an owner-only screen whose save always fails.
function OwnerRoute({ children }) {
  const user = getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!["admin", "org"].includes(user.role)) {
    return <Navigate to="/console" replace />;
  }
  return children;
}

// OpsRoute guards the platform operator console (cross-tenant). Only RoleOperator;
// the backend /ops/* routes enforce the same.
function OpsRoute({ children }) {
  const user = getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== "operator") {
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
          <ConsoleRoute>
            <OrgConsoleLayout />
          </ConsoleRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="branding" element={<OwnerRoute><Branding /></OwnerRoute>} />
        <Route path="program" element={<ConsoleProgram />} />
        <Route path="participants" element={<ConsoleParticipants />} />
        <Route path="checkin" element={<ConsoleCheckin />} />
        <Route path="moderation" element={<ConsoleModeration />} />
        <Route path="docs" element={<ConsoleDocs />} />
        <Route path="team" element={<ConsoleTeam />} />
        <Route path="billing" element={<OwnerRoute><ConsoleBilling /></OwnerRoute>} />
      </Route>
      <Route
        path="ops"
        element={
          <OpsRoute>
            <OpsLayout />
          </OpsRoute>
        }
      >
        <Route index element={<OpsDashboard />} />
        <Route path="tenants" element={<OpsTenants />} />
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
      {/* Главная вуза — новый единый shell-с-сайдбаром (редизайн), бренд per-tenant. */}
      <Route path="/" element={<EventShell />}>
        <Route index element={<EventLanding />} />
      </Route>
      {/* Остальные публичные/служебные страницы — пока на прежнем Layout (пилот). */}
      <Route element={<Layout />}>
        <Route path="badge/:token" element={<BadgeCheckIn />} />
        <Route path="questions/:token" element={<QuestionPrompt />} />
        <Route path="questions/:token/approved" element={<ApprovedQuestions />} />
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
