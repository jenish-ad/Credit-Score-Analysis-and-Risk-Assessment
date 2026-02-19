// Evaluation.jsx (NO DEMO)
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const cn = (...c) => c.filter(Boolean).join(" ");
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const fmtDateTime = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const moneyNPR = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  try {
    return new Intl.NumberFormat("en-NP", {
      style: "currency",
      currency: "NPR",
    }).format(Number(n));
  } catch {
    return `NPR ${Number(n).toLocaleString()}`;
  }
};

const bandMeta = (band) => {
  const b = (band || "").toUpperCase();
  if (b === "LOW")
    return {
      text: "Low Risk",
      pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
      ring: "ring-emerald-200",
    };
  if (b === "MEDIUM")
    return {
      text: "Medium Risk",
      pill: "bg-amber-50 text-amber-800 border-amber-200",
      dot: "bg-amber-500",
      ring: "ring-amber-200",
    };
  if (b === "HIGH")
    return {
      text: "High Risk",
      pill: "bg-rose-50 text-rose-700 border-rose-200",
      dot: "bg-rose-500",
      ring: "ring-rose-200",
    };
  return {
    text: band || "Unknown",
    pill: "bg-slate-50 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
    ring: "ring-slate-200",
  };
};

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-blue-200">
      <div className="pointer-events-none fixed inset-0 opacity-40">
        <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-blue-200 blur-3xl" />
        <div className="absolute top-24 -right-40 h-96 w-96 rounded-full blur-3xl" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function Card({ children, className }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-blue-100/80 bg-white/85 backdrop-blur shadow-sm",
        "hover:shadow-md transition-shadow",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardBody({ children, className }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

function SectionTitle({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-extrabold tracking-wide text-slate-900">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

function Pill({ dotClass, className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold",
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dotClass)} />
      {children}
    </span>
  );
}

function Button({ children, className, ...props }) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition",
        "focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60 disabled:cursor-not-allowed",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Input({ className, ...props }) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold",
        "text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100",
        className,
      )}
    />
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function ScoreGauge({ score = 0, band }) {
  const min = 300;
  const max = 900;
  const pct = clamp(((Number(score) - min) / (max - min)) * 100, 0, 100);

  return (
    <Card className={cn("ring-1", band?.ring)}>
      <CardBody>
        <SectionTitle
          title="Credit Score"
          right={
            <Pill dotClass={band.dot} className={band.pill}>
              {band.text}
            </Pill>
          }
        />

        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-4xl font-extrabold text-slate-900">{score}</p>
          </div>

          <div className="w-48">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
              <span>{min}</span>
              <span>{max}</span>
            </div>
            <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100">
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-right text-xs font-semibold text-slate-600">
              {Math.round(pct)}%
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function Evaluation() {
  const { applicantId } = useParams();

  const [inputId, setInputId] = useState(applicantId || "");
  const [activeId, setActiveId] = useState(applicantId || "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [approvalBusyId, setApprovalBusyId] = useState("");
  const [approvalMessage, setApprovalMessage] = useState("");

  const applicant = payload?.applicant || null;
  const ev = payload?.evaluation || null;

  // ✅ NEW: Income + employment
  const monthlyIncome =
    applicant?.monthlyIncome ??
    applicant?.income ??
    ev?.monthlyIncome ??
    ev?.income ??
    ev?.factors?.monthly_income ??
    ev?.factors?.monthlyIncome ??
    null;

  const employmentType =
    applicant?.employmentType ??
    applicant?.employment_type ??
    ev?.employmentType ??
    ev?.employment_type ??
    ev?.factors?.employment_type ??
    ev?.factors?.employmentType ??
    "-";

  const riskBandValue = ev?.riskCategory || ev?.riskBand;
  const defaultProbabilityPercent =
    ev?.defaultProbabilityPercent ??
    (ev?.probabilityOfDefault !== undefined && ev?.probabilityOfDefault !== null
      ? Number(ev.probabilityOfDefault) * 100
      : null);
  const approvalRecommendation = ev?.loanApprovalRecommendation || ev?.decision;

  const band = useMemo(() => bandMeta(riskBandValue), [riskBandValue]);

  const decisionPill = () => {
    const d = (approvalRecommendation || "").toUpperCase();
    if (d === "APPROVE")
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (d === "REVIEW") return "bg-amber-50 text-amber-800 border-amber-200";
    if (d === "REJECT") return "bg-rose-50 text-rose-700 border-rose-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  const fetchEvaluation = async (id) => {
    const safeId = (id || "").trim();
    if (!safeId) {
      setError("Please enter an Applicant ID.");
      setPayload(null);
      return;
    }

    setLoading(true);
    setError("");
    setPayload(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/evaluations/${encodeURIComponent(safeId)}`,
        { method: "GET" },
      );

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Request failed (${res.status})`);
      }

      const json = await res.json();
      setPayload(json);
      setActiveId(safeId);
    } catch (e) {
      setError(e?.message || "Failed to load evaluation.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeId) fetchEvaluation(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const history = Array.isArray(ev?.history) ? ev.history : [];
  const pendingApprovals = Array.isArray(ev?.pendingApprovals) ? ev.pendingApprovals : [];

  const handleApprovalAction = async (item, action) => {
    if (!activeId) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setApprovalMessage("Admin token missing. Please log in again.");
      return;
    }

    try {
      setApprovalBusyId(`${item.type}:${item.requestId}:${action}`);
      setApprovalMessage("");

      const res = await fetch(
        `${API_BASE}/api/evaluations/${encodeURIComponent(activeId)}/approval`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            requestType: item.type,
            requestId: item.requestId,
            action,
          }),
        },
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.detail || `Request failed (${res.status})`);

      setApprovalMessage(data?.message || "Action completed.");
      await fetchEvaluation(activeId);
    } catch (e) {
      setApprovalMessage(e?.message || "Failed to process approval action.");
    } finally {
      setApprovalBusyId("");
    }
  };

  return (
    <Shell>
      <header className="sticky top-0 z-40 bg-blue-200 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900">
              Evaluation
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6 space-y-6 bg-blue-200">
        {/* Search */}
        <Card>
          <CardBody className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="w-full lg:max-w-md">
                <label className="text-xs font-semibold text-slate-600">
                  Applicant ID
                </label>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={inputId}
                    onChange={(e) => setInputId(e.target.value)}
                    placeholder="Username/ Application ID"
                  />
                  <Button
                    type="button"
                    onClick={() => fetchEvaluation(inputId)}
                    disabled={loading}
                    className={cn(
                      "text-white",
                      loading ? "bg-blue-400" : "bg-blue-700 hover:bg-blue-800",
                    )}
                  >
                    {loading ? "Loading..." : "Fetch"}
                  </Button>
                </div>
              </div>

              <div className="text-xs text-slate-500 lg:text-right">
                <div className="mt-2">
                  {ev?.evaluationId ? (
                    <>
                      <div>
                        <span className="font-semibold text-slate-700">
                          Created:
                        </span>{" "}
                        {fmtDateTime(ev.createdAt)}
                      </div>
                    </>
                  ) : (
                    <div>Search an applicant to view evaluation.</div>
                  )}
                </div>
              </div>
            </div>

            {error ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : null}
          </CardBody>
        </Card>

        {/* Loading skeleton */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="h-44 animate-pulse rounded-2xl border border-blue-100 bg-white" />
            <div className="h-44 animate-pulse rounded-2xl border border-blue-100 bg-white" />
            <div className="h-44 animate-pulse rounded-2xl border border-blue-100 bg-white" />
          </div>
        ) : null}

        {/* Content */}
        {!loading && payload && ev ? (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ScoreGauge score={ev.creditScore ?? 0} band={band} />

              <Card>
                <CardBody>
                  <SectionTitle
                    title="Decision"
                    right={
                      <span
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-extrabold",
                          decisionPill(),
                        )}
                      >
                        {approvalRecommendation || "—"}
                      </span>
                    }
                  />

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <MiniStat
                      label="Defaulter Probability %"
                      value={
                        defaultProbabilityPercent !== null &&
                        defaultProbabilityPercent !== undefined
                          ? `${Number(defaultProbabilityPercent).toFixed(1)}%`
                          : "-"
                      }
                    />
                    <MiniStat label="Risk Category" value={band.text} />
                  </div>

                  <p className="mt-4 text-sm font-semibold text-slate-700"></p>
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <SectionTitle title="Suggested Limits" />
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <span className="text-xs font-semibold text-slate-600">
                        Max Loan
                      </span>
                      <span className="text-sm font-extrabold text-slate-900">
                        {moneyNPR(ev?.limits?.maxLoan)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <span className="text-xs font-semibold text-slate-600">
                        Tenure
                      </span>
                      <span className="text-sm font-extrabold text-slate-900">
                        {ev?.limits?.maxTenureMonths
                          ? `${ev.limits.maxTenureMonths} months`
                          : "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <span className="text-xs font-semibold text-slate-600">
                        Interest (APR)
                      </span>
                      <span className="text-sm font-extrabold text-slate-900">
                        {ev?.limits?.interestApr !== undefined &&
                        ev?.limits?.interestApr !== null
                          ? `${ev.limits.interestApr}%`
                          : "-"}
                      </span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardBody>
                <SectionTitle
                  title="Pending Approval Requests"
                  subtitle="Approve or reject loan and settlement requests for this applicant."
                />

                {approvalMessage ? (
                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-700">
                    {approvalMessage}
                  </div>
                ) : null}

                {pendingApprovals.length ? (
                  <div className="mt-4 space-y-3">
                    {pendingApprovals.map((item) => {
                      const approveBusy =
                        approvalBusyId === `${item.type}:${item.requestId}:APPROVE`;
                      const rejectBusy =
                        approvalBusyId === `${item.type}:${item.requestId}:REJECT`;

                      return (
                        <div
                          key={`${item.type}-${item.requestId}`}
                          className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-extrabold text-slate-900">
                                {item.title || item.type}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-600">
                                Type: {item.type} • Request ID: {item.requestId}
                                {item.loanId ? ` • Loan ID: ${item.loanId}` : ""}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-700">
                                Amount: {moneyNPR(item.amount)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                onClick={() => handleApprovalAction(item, "APPROVE")}
                                disabled={Boolean(approvalBusyId)}
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                              >
                                {approveBusy ? "Approving..." : "Approve"}
                              </Button>
                              <Button
                                type="button"
                                onClick={() => handleApprovalAction(item, "REJECT")}
                                disabled={Boolean(approvalBusyId)}
                                className="bg-rose-600 text-white hover:bg-rose-700"
                              >
                                {rejectBusy ? "Rejecting..." : "Reject"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    No pending approval requests for this applicant.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <SectionTitle title="Applicant Details" />
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MiniStat label="Name" value={applicant?.fullName || "-"} />

                  {/*  REPLACED Applicant ID with Employment Type */}
                  <MiniStat label="Employment Type" value={employmentType || "-"} />

                  {/*  Added Monthly Income */}
                  <MiniStat
                    label="Monthly Income"
                    value={monthlyIncome != null ? moneyNPR(monthlyIncome) : "-"}
                  />

                  <MiniStat label="DOB" value={applicant?.dob || "-"} />
                  <MiniStat label="Phone" value={applicant?.phone || "-"} />
                  <div className="sm:col-span-2 lg:col-span-2">
                    <MiniStat label="Address" value={applicant?.address || "-"} />
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <SectionTitle title="Score History" />
                {history.length ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50">
                        <tr className="text-xs font-extrabold text-slate-700">
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {history.map((h, i) => (
                          <tr
                            key={i}
                            className="hover:bg-blue-50/40 transition-colors"
                          >
                            <td className="px-4 py-3 font-semibold text-slate-700">
                              {h.date || "-"}
                            </td>
                            <td className="px-4 py-3 font-extrabold text-slate-900">
                              {h.score ?? "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    No history available.
                  </p>
                )}
              </CardBody>
            </Card>
          </>
        ) : null}

        {!loading && !payload && !error ? (
          <Card>
            <CardBody className="p-10 text-center">
              <p className="text-sm font-semibold text-slate-700">
                No evaluation loaded
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Enter Applicant ID and click Fetch.
              </p>
            </CardBody>
          </Card>
        ) : null}
      </main>
    </Shell>
  );
}