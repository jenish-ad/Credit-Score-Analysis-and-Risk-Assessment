import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8000/api";

const Payments = () => {
  const currentInterestRate = 14;

  const [tab, setTab] = useState("take"); // take | settle | history
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  const [loans, setLoans] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const loadPaymentData = async () => {
      try {
        const [loanRes, historyRes] = await Promise.all([
          fetch(`${API_BASE}/payments/loans/`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/payments/history/`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const loanData = await loanRes.json();
        const historyData = await historyRes.json();

        if (!loanRes.ok) throw new Error(loanData.error || "Unable to load loans.");
        if (!historyRes.ok) throw new Error(historyData.error || "Unable to load payment history.");

        setLoans(Array.isArray(loanData.loans) ? loanData.loans : []);
        setHistory(Array.isArray(historyData.history) ? historyData.history : []);
      } catch (error) {
        setMsg({ type: "error", text: error.message || "Failed to load payments." });
      }
    };

    loadPaymentData();
  }, []);

  const [selectedLoanId, setSelectedLoanId] = useState("");
  const selectedLoan = useMemo(
    () => loans.find((l) => l.id === selectedLoanId),
    [loans, selectedLoanId],
  );

  const showTenure = (cat) => cat === "general" || cat === "emi";
  const formatRs = (n) => `Rs. ${Number(n || 0).toLocaleString("en-IN")}`;

  // -----------------------------
  // TAKE LOAN state
  // -----------------------------
  const [take, setTake] = useState({
    category: "general", // general | emi | cc
    amount: "",
    tenureMonths: "12", // only for general/emi
    purpose: "",
    employmentType: "", //  NEW
    income: "", //  NEW
  });

  const [settle, setSettle] = useState({ amount: "" });
  const [history, setHistory] = useState([]);

  const onSelectLoan = (loanId) => {
    setSelectedLoanId(loanId);
    setSettle({ amount: "" });
    setMsg({ type: "", text: "" });
  };

  // EMI estimation for Take Loan (optional UI)
  const takeEstimate = useMemo(() => {
    if (!showTenure(take.category)) return null;

    const P = Number(take.amount || 0);
    const n = Number(take.tenureMonths || 1);
    if (P <= 0 || n <= 0) return null;

    const rMonthly = currentInterestRate / 100 / 12;
    const pow = Math.pow(1 + rMonthly, n);
    const denom = pow - 1;
    if (denom === 0) return null;

    const emi = (P * rMonthly * pow) / denom;

    return {
      emi: Math.round(emi),
      totalPayable: Math.round(emi * n),
    };
  }, [take.amount, take.tenureMonths, take.category, currentInterestRate]);

  const banner = msg.text && (
    <div
      className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
        msg.type === "success"
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {msg.text}
    </div>
  );

  const submitTake = async () => {
    setMsg({ type: "", text: "" });

    const amt = Number(take.amount || 0);
    if (amt <= 0) {
      return setMsg({ type: "error", text: "Please enter a valid amount." });
    }

    if (showTenure(take.category)) {
      const t = Number(take.tenureMonths || 0);
      if (t < 3 || t > 60) {
        return setMsg({ type: "error", text: "Tenure must be 3–60 months." });
      }
    }

    if (!take.purpose.trim()) {
      return setMsg({ type: "error", text: "Please enter the loan purpose." });
    }

    //  NEW validations
    if (!take.employmentType) {
      return setMsg({ type: "error", text: "Please select employment type." });
    }
    const inc = Number(take.income || 0);
    if (inc <= 0) {
      return setMsg({ type: "error", text: "Please enter a valid income." });
    }

    try {
      setLoading(true);

      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/payments/take/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(take), //  includes employmentType + income
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed.");

      setLoans((prev) => [data.loan, ...prev]);
      setTake({
        category: "general",
        amount: "",
        tenureMonths: "12",
        purpose: "",
        employmentType: "", //  reset
        income: "", //  reset
      });
      setMsg({ type: "success", text: data.message || "Request submitted successfully." });
    } catch {
      setMsg({ type: "error", text: "Something went wrong. Try again." });
    } finally {
      setLoading(false);
    }
  };

  const submitSettle = async () => {
    setMsg({ type: "", text: "" });

    if (!selectedLoan) {
      return setMsg({ type: "error", text: "Please select a loan to settle." });
    }

    const amt = Number(settle.amount || 0);
    if (amt <= 0) {
      return setMsg({
        type: "error",
        text: "Please enter a valid payment amount.",
      });
    }

    if (amt > Number(selectedLoan.outstanding || 0)) {
      return setMsg({
        type: "error",
        text: `Amount cannot exceed outstanding balance (${formatRs(
          selectedLoan.outstanding,
        )}).`,
      });
    }

    try {
      setLoading(true);

      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/payments/settle/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ loanId: selectedLoan.id, amount: amt }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Payment failed.");

      const remainingBalance = Number(data.remaining_balance || 0);
      setLoans((prev) =>
        prev
          .map((loan) =>
            loan.id === selectedLoan.id
              ? {
                  ...loan,
                  outstanding: remainingBalance,
                  status: remainingBalance === 0 ? "CLOSED" : "ACTIVE",
                }
              : loan,
          )
          .filter((loan) => loan.status !== "CLOSED"),
      );

      const refreshedHistory = await fetch(`${API_BASE}/payments/history/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const historyData = await refreshedHistory.json();
      if (refreshedHistory.ok) {
        setHistory(Array.isArray(historyData.history) ? historyData.history : []);
      }

      setSelectedLoanId(remainingBalance === 0 ? "" : selectedLoan.id);
      setSettle({ amount: "" });
      setMsg({ type: "success", text: data.message || "Payment initiated successfully." });
    } catch {
      setMsg({ type: "error", text: "Payment failed. Try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-blue-200 caret-transparent">
      {/* subtle background theme */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-200/60 blur-3xl" />
        <div className="absolute top-40 -left-24 h-72 w-72 rounded-full bg-blue-300/40 blur-3xl" />
      </div>

      <section className="relative px-8 pt-5 pb-12">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900">
                Payments & Loans
              </h1>

              <div className="sm:text-right">
                <div className="inline-flex items-center gap-3 rounded-full bg-white px-4 py-2 border border-blue-100 shadow-sm hover:shadow transition">
                  <span className="text-xs font-semibold text-gray-500">
                    Current interest rate
                  </span>

                  <span className="h-4 w-px bg-blue-200" />

                  <span className="text-sm font-bold text-blue-700">
                    {currentInterestRate}%
                    <span className="ml-1 text-xs font-semibold text-gray-500">
                      per annum
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-2 text-sm text-gray-600">
              Manage loans, EMIs, settlements and credit card usage.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Tab active={tab === "take"} onClick={() => setTab("take")}>
                Take Loan
              </Tab>
              <Tab active={tab === "settle"} onClick={() => setTab("settle")}>
                Settle Loans
              </Tab>
              <Tab active={tab === "history"} onClick={() => setTab("history")}>
                Payment History
              </Tab>
            </div>
          </div>

          {/* Single centered card */}
          <div className="mt-8">
            <div className="rounded-3xl bg-white p-6 md:p-8 shadow-sm border border-blue-100">
              {tab === "take" && (
                <>
                  <h2 className="text-xl font-bold text-black">Take Loan</h2>
                  <p className="mt-2 text-sm text-gray-600">
                    Choose a category. Tenure appears only for General Loan or EMI.
                  </p>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <Field label="Loan Category">
                      <select
                        className={input}
                        value={take.category}
                        onChange={(e) =>
                          setTake((p) => ({ ...p, category: e.target.value }))
                        }
                      >
                        <option value="general">General Loan</option>
                        <option value="emi">EMI</option>
                        <option value="cc">Use Credit Card Amount</option>
                      </select>
                    </Field>

                    <Field
                      label={
                        take.category === "cc"
                          ? "Credit Card Amount Used (Rs.)"
                          : "Loan Amount (Rs.)"
                      }
                    >
                      <input
                        className={input}
                        type="number"
                        value={take.amount}
                        onChange={(e) =>
                          setTake((p) => ({ ...p, amount: e.target.value }))
                        }
                      />
                    </Field>

                    {showTenure(take.category) && (
                      <Field label="Tenure (months)">
                        <select
                          className={input}
                          value={take.tenureMonths}
                          onChange={(e) =>
                            setTake((p) => ({
                              ...p,
                              tenureMonths: e.target.value,
                            }))
                          }
                        >
                          {[3, 6, 9, 12, 18, 24, 36, 48, 60].map((m) => (
                            <option key={m} value={String(m)}>
                              {m} months
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}

                    <Field label="Purpose">
                      <input
                        type="text"
                        className={input}
                        value={take.purpose}
                        onChange={(e) =>
                          setTake((p) => ({ ...p, purpose: e.target.value }))
                        }
                      />
                    </Field>

                    {/*  NEW: Employment Type */}
                    <Field label="Employment Type">
                      <select
                        className={input}
                        value={take.employmentType}
                        onChange={(e) =>
                          setTake((p) => ({ ...p, employmentType: e.target.value }))
                        }
                      >
                        <option value="">Select employment type</option>
                        <option value="salaried">Salaried</option>
                        <option value="self_employed">Self-employed</option>
                        <option value="student">Student</option>
                        <option value="unemployed">Unemployed</option>
                        <option value="freelancer">Freelancer</option>
                        <option value="retired">Retired</option>
                      </select>
                    </Field>

                    {/*  NEW: Income */}
                    <Field label="Monthly Income (Rs.)">
                      <input
                        className={input}
                        type="number"
                        value={take.income}
                        onChange={(e) =>
                          setTake((p) => ({ ...p, income: e.target.value }))
                        }
                      />
                    </Field>
                  </div>

                  {showTenure(take.category) && takeEstimate && (
                    <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      <p className="text-sm font-semibold text-black">Estimated EMI</p>
                      <p className="mt-2 text-2xl font-extrabold text-black">
                        {formatRs(takeEstimate.emi)}/mo
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        Total payable (est.): {formatRs(takeEstimate.totalPayable)}
                      </p>
                    </div>
                  )}

                  <div className="mt-6">
                    <button
                      onClick={submitTake}
                      disabled={loading}
                      className={`w-full rounded-full px-6 py-3 text-sm font-medium text-white transition ${
                        loading
                          ? "bg-blue-300 cursor-not-allowed"
                          : "bg-blue-500 hover:bg-blue-700"
                      }`}
                      type="button"
                    >
                      {loading ? "Submitting..." : "Apply"}
                    </button>

                    {banner}
                  </div>
                </>
              )}

              {tab === "settle" && (
                <>
                  <h2 className="text-xl font-bold text-black">Settle Loans</h2>
                  <p className="mt-2 text-sm text-gray-600">
                    Select one of your existing loans and enter the amount to pay.
                  </p>

                  {loans.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      <p className="text-sm text-gray-700">No loans to show right now.</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Fetch loans from your backend and render them here.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 grid gap-3 md:grid-cols-2">
                      {loans.map((loan) => (
                        <button
                          key={loan.id}
                          onClick={() => onSelectLoan(loan.id)}
                          className={`text-left rounded-2xl border p-4 transition ${
                            loan.id === selectedLoanId
                              ? "border-blue-400 bg-blue-50"
                              : "border-blue-100 bg-white hover:bg-blue-50"
                          }`}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-black">
                                {loan.title}{" "}
                                <span className="text-gray-500">• {loan.id}</span>
                              </p>
                              <p className="mt-1 text-sm text-gray-600">
                                Outstanding:{" "}
                                <span className="font-semibold text-black">
                                  {formatRs(loan.outstanding)}
                                </span>
                              </p>
                            </div>
                            <StatusBadge status={loan.status} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedLoan && (
                    <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      <p className="text-sm text-gray-600">Selected Loan</p>
                      <p className="mt-1 font-semibold text-black">
                        {selectedLoan.title} • {selectedLoan.id}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        Outstanding:{" "}
                        <span className="font-semibold text-black">
                          {formatRs(selectedLoan.outstanding)}
                        </span>
                      </p>
                    </div>
                  )}

                  <div className="mt-6">
                    <Field label="Payment Amount (Rs.)">
                      <input
                        className={input}
                        type="number"
                        value={settle.amount}
                        onChange={(e) => setSettle({ amount: e.target.value })}
                      />
                    </Field>
                  </div>

                  <div className="mt-6">
                    <button
                      onClick={submitSettle}
                      disabled={loading}
                      className={`w-full rounded-full px-6 py-3 text-sm font-medium text-white transition ${
                        loading
                          ? "bg-blue-300 cursor-not-allowed"
                          : "bg-blue-500 hover:bg-blue-700"
                      }`}
                      type="button"
                    >
                      {loading ? "Processing..." : "Pay Now"}
                    </button>

                    {banner}
                  </div>
                </>
              )}

              {tab === "history" && (
                <>
                  <h2 className="text-xl font-bold text-black">Payment History</h2>
                  <p className="mt-2 text-sm text-gray-600">
                    Shows repayments and settlements for scoring & audit.
                  </p>

                  {history.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      <p className="text-sm text-gray-700">
                        No payment history to show right now.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 overflow-hidden rounded-2xl border border-blue-100">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-blue-50">
                          <tr className="text-xs text-gray-600">
                            <th className="px-4 py-3 font-semibold">Date</th>
                            <th className="px-4 py-3 font-semibold">Type</th>
                            <th className="px-4 py-3 font-semibold">Amount</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100 bg-white">
                          {history.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3">{item.date}</td>
                              <td className="px-4 py-3">{item.type}</td>
                              <td className="px-4 py-3">{formatRs(item.amount)}</td>
                              <td className="px-4 py-3">
                                <StatusBadge status={item.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

/* ---------------- small UI components ---------------- */

const input =
  "w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100";

const Tab = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    type="button"
    className={`rounded-full px-5 py-2 text-sm font-medium transition ${
      active
        ? "bg-blue-500 text-white"
        : "bg-white text-gray-700 border border-blue-100 hover:bg-blue-50"
    }`}
  >
    {children}
  </button>
);

const Field = ({ label, children }) => (
  <div>
    <label className="text-sm font-semibold text-black">{label}</label>
    <div className="mt-2">{children}</div>
  </div>
);

const StatusBadge = ({ status }) => {
  const map = {
    ACTIVE: "bg-green-50 text-green-700 border-green-200",
    PAID: "bg-green-50 text-green-700 border-green-200",
    DUE: "bg-yellow-50 text-yellow-700 border-yellow-200",
    LATE: "bg-red-50 text-red-700 border-red-200",
    OVERDUE: "bg-red-50 text-red-700 border-red-200",
    CLOSED: "bg-gray-50 text-gray-700 border-gray-200",
  };
  return (
    <span
      className={`h-fit rounded-full border px-3 py-1 text-xs font-semibold ${
        map[status] || map.ACTIVE
      }`}
    >
      {status}
    </span>
  );
};

export default Payments;