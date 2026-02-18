import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8000/api";

const defaultData = {
  stats: {
    credit_score: 0,
    score_band: "N/A",
    risk_level: "Unknown",
    utilization: 0,
    on_time_payments: 0,
  },
  score_trend: [],
  key_factors: [],
  recent_activity: [],
  alerts: [],
};

const normalizeScoreTrend = (payload) => {
  const trendCandidates =
    payload?.score_trend || payload?.scoreTrend || payload?.score_history || [];

  if (!Array.isArray(trendCandidates)) return [];

  return trendCandidates
    .map((item, index) => {
      const score = Number(
        item?.score ?? item?.credit_score ?? item?.value ?? item?.y ?? 0
      );
      const label =
        item?.label ??
        item?.month ??
        item?.date ??
        item?.period ??
        item?.x ??
        `#${index + 1}`;

      return { label: String(label), score: Number.isFinite(score) ? score : 0 };
    })
    .filter((item) => item.score > 0);
};

/* ---------------- UI components ---------------- */

const Card = ({ children, className = "" }) => (
  <div
    className={
      "rounded-2xl bg-white shadow-sm border border-blue-100 p-6 " + className
    }
  >
    {children}
  </div>
);

const StatCard = ({ title, value, chip, sub }) => {
  const getValueColor = () => {
    if (title === "Credit Score") {
      const v = Number(value);
      if (v >= 750) return "text-green-600";
      if (v >= 600) return "text-yellow-500";
      return "text-red-600";
    }

    if (title === "Risk Level") {
      const v = value?.toString().toLowerCase() || "";
      if (v.includes("low")) return "text-green-600";
      if (v.includes("medium")) return "text-yellow-500";
      if (v.includes("high")) return "text-red-600";
      return "text-gray-900";
    }

    if (title === "Utilization") {
      const v = parseInt(String(value), 10);
      if (v <= 30) return "text-green-600";
      if (v <= 60) return "text-yellow-500";
      return "text-red-600";
    }

    if (title === "On-time Payments") {
      const v = parseInt(String(value), 10);
      if (v >= 95) return "text-green-600";
      if (v >= 80) return "text-yellow-500";
      return "text-red-600";
    }

    return "text-gray-900";
  };

  const getChipColor = () => {
    const color = getValueColor();
    if (color.includes("green"))
      return "bg-green-50 text-green-700 border-green-200";
    if (color.includes("yellow"))
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    if (color.includes("red")) return "bg-red-50 text-red-700 border-red-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
  };

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-blue-100 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-gray-500">{title}</p>
        <span
          className={`text-xs font-semibold px-2 py-1 rounded-full border ${getChipColor()}`}
        >
          {chip}
        </span>
      </div>

      <p className={`mt-3 text-2xl font-extrabold ${getValueColor()}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
};

const MiniStat = ({ title, value }) => (
  <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
    <p className="text-[11px] font-semibold text-gray-600">{title}</p>
    <p className="mt-1 text-sm font-extrabold text-gray-900">{value}</p>
  </div>
);

const Row = ({ date, type, amount, status }) => {
  const statusColors = {
    "on time": "bg-green-50 text-green-700 border-green-200",
    due: "bg-yellow-50 text-yellow-700 border-yellow-200",
    late: "bg-red-50 text-red-700 border-red-200",
  };

  const normalizedStatus = status?.toString().trim().toLowerCase();
  const pillClass =
    statusColors[normalizedStatus] || "bg-gray-50 text-gray-700 border-gray-200";

  const formattedAmount =
    amount === null || amount === undefined || isNaN(Number(amount))
      ? amount
      : `Rs. ${Number(amount).toLocaleString("en-IN")}`;

  return (
    <tr className="text-sm text-gray-800">
      <td className="px-4 py-3 text-xs text-gray-600">{date}</td>
      <td className="px-4 py-3">{type}</td>
      <td className="px-4 py-3">{formattedAmount}</td>
      <td className="px-4 py-3">
        <span
          className={`text-xs font-semibold px-2 py-1 rounded-full border ${pillClass}`}
        >
          {status}
        </span>
      </td>
    </tr>
  );
};

const Alert = ({ title, desc }) => (
  <div className="rounded-xl border p-4 bg-blue-50 border-blue-100">
    <p className="text-xs font-extrabold text-gray-900">{title}</p>
    <p className="mt-1 text-xs text-gray-600">{desc}</p>
  </div>
);

/* ---------------- Attractive Line Chart ----------------
   - smooth curve (Bezier)
   - gradient area fill
   - subtle grid
   - last point highlight + label
   - tooltip on hover (simple)
--------------------------------------------------------- */

const buildSmoothPath = (pts) => {
  // pts: [{x,y}]
  if (pts.length <= 1) return "";
  if (pts.length === 2) {
    const [p0, p1] = pts;
    return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
  }

  // Catmull-Rom like smoothing using cubic beziers
  const d = [];
  d.push(`M ${pts[0].x} ${pts[0].y}`);

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    const tension = 0.25;

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;

    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }

  return d.join(" ");
};

const ScoreLineGraph = ({ data }) => {
  const safe = Array.isArray(data) ? data : [];
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!safe.length) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500">
        No score data available
      </div>
    );
  }

  const d = safe.length === 1 ? [safe[0], safe[0]] : safe;

  const W = 820;
  const H = 260;

  // ✅ Increase top padding a bit so top labels have space
  const padL = 46;
  const padR = 18;
  const padT = 30; // was 20
  const padB = 46;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const scores = d.map((x) => Number(x.score) || 0);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = Math.max(1, max - min);

  const x = (i) => padL + (i * innerW) / Math.max(1, d.length - 1);
  const y = (s) => padT + (1 - (s - min) / range) * innerH;

  const pts = d.map((pt, i) => ({ x: x(i), y: y(pt.score) }));
  const linePath = buildSmoothPath(pts);

  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${
    padT + innerH
  } L ${pts[0].x} ${padT + innerH} Z`;

  const gridLines = 4;
  const gridY = Array.from(
    { length: gridLines + 1 },
    (_, i) => padT + (i * innerH) / gridLines
  );

  const last = d[d.length - 1];
  const lastPt = pts[pts.length - 1];

  const hoverPt =
    hoverIndex === null ? null : { ...pts[hoverIndex], ...d[hoverIndex] };

  // ✅ Helper clamp
  const clamp = (v, minV, maxV) => Math.max(minV, Math.min(maxV, v));

  // ✅ Bubble positioning: keep it inside chart vertically
  const bubbleW = 110;
  const bubbleH = 22;
  const bubbleOffsetX = 10;

  const bubbleX = clamp(lastPt.x + bubbleOffsetX, padL, W - padR - bubbleW);
  const bubbleY = clamp(lastPt.y - 26, padT + 6, padT + innerH - bubbleH - 6);

  return (
    <div className="relative h-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>

          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="6"
              stdDeviation="6"
              floodColor="#1d4ed8"
              floodOpacity="0.18"
            />
          </filter>
        </defs>

        {/* grid */}
        {gridY.map((gy, i) => (
          <line
            key={i}
            x1={padL}
            y1={gy}
            x2={W - padR}
            y2={gy}
            stroke="#dbeafe"
            strokeWidth="1"
          />
        ))}

        {/* y-axis labels */}
        <text x={8} y={padT + 10} fontSize="10" fill="#6b7280">
          {max}
        </text>
        <text x={8} y={padT + innerH} fontSize="10" fill="#6b7280">
          {min}
        </text>

        {/* area */}
        <path d={areaPath} fill="url(#areaFill)" />

        {/* line */}
        <path
          d={linePath}
          fill="none"
          stroke="#2563eb"
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#softShadow)"
        />

        {/* points */}
        {d.map((pt, i) => {
          const isLast = i === d.length - 1;
          const isHover = i === hoverIndex;

          return (
            <g key={i}>
              <circle
                cx={pts[i].x}
                cy={pts[i].y}
                r="12"
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
              <circle
                cx={pts[i].x}
                cy={pts[i].y}
                r={isLast || isHover ? 5 : 3.2}
                fill={isLast ? "#1d4ed8" : "#60a5fa"}
                stroke="#ffffff"
                strokeWidth={isLast || isHover ? 2 : 1.5}
              />
            </g>
          );
        })}

        {/* x labels */}
        {d.map((pt, i) => (
          <text
            key={`lbl-${i}`}
            x={pts[i].x}
            y={H - 14}
            textAnchor="middle"
            fontSize="10"
            fill="#6b7280"
          >
            {pt.label}
          </text>
        ))}

        {/* ✅ last score bubble (clamped so it never goes outside) */}
        <g>
          <rect
            x={bubbleX}
            y={bubbleY}
            width={bubbleW}
            height={bubbleH}
            rx="11"
            fill="#1d4ed8"
            opacity="0.92"
          />
          <text
            x={bubbleX + bubbleW / 2}
            y={bubbleY + 15}
            textAnchor="middle"
            fontSize="11"
            fill="#ffffff"
            fontWeight="700"
          >
            {last.score}
          </text>
        </g>

        {/* hover guideline */}
        {hoverPt && (
          <line
            x1={hoverPt.x}
            y1={padT}
            x2={hoverPt.x}
            y2={padT + innerH}
            stroke="#93c5fd"
            strokeDasharray="4 4"
            strokeWidth="1.2"
          />
        )}
      </svg>
      {hoverPt && (
        <div
          className="pointer-events-none absolute rounded-xl border border-blue-100 bg-white/95 shadow-lg px-3 py-2 text-xs"
          style={{
            left: `${clamp((hoverPt.x / W) * 100, 6, 94)}%`,
            top: `${clamp((hoverPt.y / H) * 100, 10, 90)}%`,
            transform: "translate(-50%, -130%)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="font-extrabold text-gray-900">{hoverPt.score}</div>
          <div className="text-gray-600">{hoverPt.label}</div>
        </div>
      )}
    </div>
  );
};

/* ---------------- Main Dashboard ---------------- */

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState(defaultData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please login to view your dashboard.");
      setLoading(false);
      return;
    }

    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/dashboard/`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load dashboard data.");
        }

        setDashboardData({
          ...defaultData,
          ...data,
          score_trend: normalizeScoreTrend(data),
        });

        setError("");
      } catch (err) {
        setError(err?.message || "Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const trendMeta = useMemo(() => {
    const scores = (dashboardData.score_trend || []).map((item) => item.score);
    if (!scores.length) return { min: 300, max: 850, first: 0, last: 0, change: 0 };

    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const first = scores[0];
    const last = scores[scores.length - 1];
    return { min, max, first, last, change: last - first };
  }, [dashboardData.score_trend]);

  return (
    <div className="min-h-screen bg-blue-200 select-none">
      <main className="px-6 md:px-8 pt-10 pb-16">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900">
                Dashboard
              </h1>
            </div>

            <div className="hidden sm:flex items-center gap-3">
              <Link
                to="/payments"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 border border-blue-100 shadow-sm hover:shadow-md hover:bg-blue-50 active:scale-[0.98] transition-all duration-200"
              >
                Payments <span className="text-blue-400">→</span>
              </Link>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {loading && (
            <div className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm text-blue-700">
              Loading dashboard...
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Credit Score"
              value={dashboardData.stats.credit_score}
              chip={dashboardData.stats.score_band}
            />
            <StatCard
              title="Risk Level"
              value={dashboardData.stats.risk_level}
              chip={dashboardData.stats.risk_level}
            />
            <StatCard
              title="Utilization"
              value={`${dashboardData.stats.utilization}%`}
              chip={`${dashboardData.stats.utilization}%`}
            />
            <StatCard
              title="On-time Payments"
              value={`${dashboardData.stats.on_time_payments}%`}
              chip={`${dashboardData.stats.on_time_payments}%`}
            />
          </div>

          <div className="w-full">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Score Trend</h2>
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full">
                  Latest: {dashboardData.score_trend?.slice(-1)[0]?.score ?? "-"}
                </span>
              </div>

              {/* upgraded attractive chart */}
              <div className="mt-5 h-64 rounded-2xl bg-gradient-to-b from-blue-50 to-white border border-blue-100 p-4 overflow-visible">
                <ScoreLineGraph data={dashboardData.score_trend} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <MiniStat title="Highest" value={trendMeta.max} />
                <MiniStat title="Lowest" value={trendMeta.min} />
                <MiniStat
                  title="Change"
                  value={`${trendMeta.change >= 0 ? "+" : ""}${trendMeta.change}`}
                />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-blue-100 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-blue-50">
                    <tr className="text-xs text-gray-600">
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Amount</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-100">
                    {(dashboardData.recent_activity?.length
                      ? dashboardData.recent_activity
                      : [
                          {
                            date: "-",
                            type: "No records",
                            amount: "-",
                            status: "Pending",
                          },
                        ]
                    ).map((activity) => (
                      <Row
                        key={`${activity.date}-${activity.type}-${activity.amount}`}
                        date={activity.date}
                        type={activity.type}
                        amount={activity.amount}
                        status={activity.status}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-gray-900">Alerts</h2>
              <div className="mt-4 space-y-3">
                {(dashboardData.alerts?.length
                  ? dashboardData.alerts
                  : [
                      {
                        title: "No alerts",
                        desc: "Your account has no alert yet.",
                      },
                    ]
                ).map((alert) => (
                  <Alert key={alert.title} title={alert.title} desc={alert.desc} />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;