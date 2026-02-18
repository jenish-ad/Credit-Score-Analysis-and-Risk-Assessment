import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Signup from "./components/Signup";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Payments from "./components/Payments";
import ProtectedRoute from "./components/ProtectedRoute";
import Evaluation from "./components/Evaluation";

export default function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen select-none">
        <Navbar />
        <div className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute userOnly />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/payments" element={<Payments />} />
            </Route>

            <Route element={<ProtectedRoute adminOnly />}>
              <Route path="/evaluation/:applicantId?" element={<Evaluation />} />
            </Route>
          </Routes>
        </div>
        <Footer />
      </div>
    </Router>
  );
}
