import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { isAuthenticated, isAdmin, username, logout } = useAuth();

  return (
    <div className="sticky top-0 z-50 w-full flex justify-center bg-blue-50 caret-transparent">
      <nav className="w-[90%] max-w-7xl rounded-2xl bg-blue-50 px-8 py-4">
        <div className="flex items-center">
          <div className="flex items-center gap-8 text-sm">
            <Link to="/" className="text-3xl font-bold text-blue-800 leading-none">
              CreditScore
            </Link>

            {isAuthenticated && !isAdmin && (
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `inline-flex items-center ${
                    isActive
                      ? "text-blue-50 font-bold"
                      : "text-gray-600 font-bold hover:text-gray-900 transition"
                  }`
                }
              >
                <span>Dashboard</span>
              </NavLink>
            )}

            {isAuthenticated && isAdmin && (
              <NavLink
                to="/evaluation"
                className={({ isActive }) =>
                  `inline-flex items-center ${
                    isActive
                      ? "text-blue-50 font-bold"
                      : "text-gray-600 font-bold hover:text-gray-900 transition"
                  }`
                }
              >
                <span>Evaluation</span>
              </NavLink>
            )}
          </div>

          <div className="ml-auto flex items-center gap-4 text-sm">
            {isAuthenticated ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                    {username}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-2 rounded-xl bg-white border cursor-pointer border-blue-100 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-blue-50 hover:shadow-md active:scale-[0.98] transition-all duration-200"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="inline-flex items-center text-gray-700 hover:text-gray-900 transition">
                  Log in
                </Link>

                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
