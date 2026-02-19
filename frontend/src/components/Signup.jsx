import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";


const Signup = () => {
  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    email: "",
    password: "",
    dob: "",
    address: "",
    phone: "",
  });

  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;


    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(`${API_BASE}/api/signup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      // read as text first so we don't crash if backend returns HTML/error page
      const text = await response.text();
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = {};
      }

      if (response.ok) {
        alert("Account created successfully!");
        navigate("/login");
      } else {
        alert("Error: " + (data.error || text || "Signup failed"));
      }
    } catch (error) {
      console.error("Connection error:", error);
      alert("Could not connect to the server.");
    }
  };

  return (
    <div className="min-h-screen w-full bg-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* LEFT PANEL */}
          <div className="relative bg-blue-200 rounded-2xl p-10 hidden md:block">
            <p className="text-xs font-semibold text-slate-500 uppercase">
              Welcome to
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-widest text-gray-900">
              CreditScore
            </h1>
            <p className="mt-2 text-sm font-semibold text-slate-600 max-w-sm">
              Create your profile to start tracking credit health and risk
              insights.
            </p>

            <div className="relative h-[420px]">
              <div className="absolute right-24 top-16 h-64 w-64 rotate-12 rounded-[40px] bg-blue-500 shadow-lg" />
              <div className="absolute right-12 top-8 h-64 w-64 -rotate-6 rounded-[40px] bg-blue-300 shadow-xl" />
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="p-8 md:p-12 flex items-center bg-white">
            <div className="w-full max-w-md">
              <h2 className="text-2xl font-bold text-slate-800">Sign up</h2>
              <p className="mt-1 text-sm text-slate-500">
                Create your account in a minute.
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                {/* Name + Username */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Full name"
                    name="full_name"
                    placeholder="Jenish Adhikari"
                    value={formData.full_name}
                    onChange={handleChange}
                    required
                  />
                  <Input
                    label="Username"
                    name="username"
                    placeholder="Jenny"
                    value={formData.username}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* Email */}
                <Input
                  label="Email Address"
                  type="email"
                  name="email"
                  placeholder="jenny@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />

                {/* Password */}
                <Input
                  label="Password"
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />

                {/* Employment + DOB */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Date of birth"
                    type="date"
                    name="dob"
                    value={formData.dob}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Phone"
                    type="tel"
                    name="phone"
                    placeholder="98XXXXXXXX"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* Address */}
                <TextArea
                  label="Address"
                  name="address"
                  placeholder="Basundhara, Kathmandu, Nepal"
                  value={formData.address}
                  onChange={handleChange}
                  required
                />

                <button
                  type="submit"
                  className="w-full mt-2 rounded-xl bg-blue-500 py-3 text-sm font-semibold cursor-pointer tracking-wide text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-600 active:translate-y-0"
                >
                  CREATE AN ACCOUNT
                </button>
              </form>

              <p className="mt-6 text-xs text-slate-500 text-center">
                Already have an account?{" "}
                <Link to="/login" className="text-blue-600 font-semibold">
                  Login
                </Link>
              </p>

              <p className="mt-2 text-[11px] text-slate-400 text-center">
                By signing up, you agree to provide accurate information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Input = ({
  label,
  type = "text",
  placeholder,
  name,
  value,
  onChange,
  required,
  ...rest
}) => {
  return (
    <div>
      <label className="block mb-1.5 text-xs font-semibold text-slate-500">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full h-11 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:shadow-md caret-blue-500"
        {...rest}
      />
    </div>
  );
};

const Select = ({ label, name, value, onChange, options = [], required }) => {
  return (
    <div>
      <label className="block mb-1.5 text-xs font-semibold text-slate-500">
        {label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full h-11 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:shadow-md"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

const TextArea = ({
  label,
  placeholder,
  name,
  value,
  onChange,
  required,
}) => {
  return (
    <div>
      <label className="block mb-1.5 text-xs font-semibold text-slate-500">
        {label}
      </label>
      <textarea
        name={name}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={3}
        className="w-full rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:shadow-md resize-none caret-blue-500"
      />
    </div>
  );
};

export default Signup;