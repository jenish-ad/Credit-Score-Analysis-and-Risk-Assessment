import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Login = () => {
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value,
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("http://127.0.0.1:8000/api/login/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (response.ok) {
        login({ token: data.token, username: data.username, is_admin: data.is_admin });
        const redirectPath = data.is_admin 
        ? "/evaluation"
        : location.state?.from?.pathname || "/dashboard";
        navigate(redirectPath, { replace: true });
      } else {
        alert("Login failed: " + (data.error || "Invalid credentials"));
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("Server connection failed!");
    }
  };

  return (
    <div className="min-h-screen w-full bg-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-blue-100 rounded-2xl shadow-xl p-8 md:p-10">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-lg font-semibold text-gray-900">CreditScore</span>
        </div>

        <h2 className="text-2xl font-bold text-gray-900">Welcome to CreditScore</h2>

        <form className="mt-6 space-y-4" onSubmit={handleLogin}>
          <Input
            label="Username"
            type="text"
            name="username"
            placeholder="Enter username"
            value={credentials.username}
            onChange={handleChange}
            required
          />
          <Input
            label="Password"
            type="password"
            name="password"
            placeholder="••••••••"
            value={credentials.password}
            onChange={handleChange}
            required
          />

          <button
            type="submit"
            className="w-full mt-2 rounded-full bg-blue-600 py-3 text-sm font-semibold tracking-wide cursor-pointer text-white shadow-lg transition hover:-translate-y-0.5"
          >
            Login
          </button>

          <div className="flex items-center gap-3 text-xs text-gray-400 mt-4">
            <div className="flex-1 h-px bg-gray-200" />
            or
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        </form>

        <p className="mt-6 text-xs text-gray-500 text-center">
          Don’t have an account?{" "}
          <Link to="/signup" className="text-blue-600 font-semibold">
            Create New!
          </Link>
        </p>
      </div>
    </div>
  );
};

const Input = ({ label, type = "text", placeholder, name, value, onChange, required }) => {
  return (
    <div className="select-text">
      <label className="block mb-1.5 text-xs font-semibold text-gray-500">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className="w-full h-11 rounded-lg border border-blue-300 px-4 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
};

export default Login;