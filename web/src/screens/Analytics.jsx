
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import {
  CalendarDays,
  Building2,
  Wallet,
  RefreshCw,
  TrendingUp,
  Moon,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import "../analytics.css";

const API = import.meta.env.VITE_API_BASE_URL || "/api";
const PAGE_SIZE = 10;
const RANK_SORTS = [
  { id: "rank", label: "Rank" },
  { id: "daily_revenue", label: "Daily revenue" },
  { id: "moving_avg_7d", label: "7-day moving average" },
  { id: "trailing_7d_revenue", label: "7-day revenue" },
  { id: "property_id", label: "Property ID" },
];

function compareRanking(sortKey) {
  return (a, b) => {
    const byId = String(a.property_id).localeCompare(String(b.property_id));
    if (sortKey === "property_id") return byId;
    if (sortKey === "rank") {
      return (
        Number(a.rank_by_moving_avg) - Number(b.rank_by_moving_avg) ||
        Number(b.moving_avg_7d) - Number(a.moving_avg_7d) ||
        byId
      );
    }
    return (
      Number(b[sortKey]) - Number(a[sortKey]) ||
      Number(a.rank_by_moving_avg) - Number(b.rank_by_moving_avg) ||
      byId
    );
  };
}

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const number = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value) || 0);

export default function Analytics() {
  const [performance, setPerformance] = useState([]);
  const [revenue, setRevenue] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rankSort, setRankSort] = useState("rank");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastLoaded, setLastLoaded] = useState(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [performanceResponse, revenueResponse] = await Promise.all([
        fetch(`${API}/analytics/property-performance`),
        fetch(`${API}/analytics/window-revenue`),
      ]);

      if (!performanceResponse.ok || !revenueResponse.ok) {
        throw new Error(
          "The analytics API returned an error. Check that the backend and database are running."
        );
      }

      const [performanceJson, revenueJson] = await Promise.all([
        performanceResponse.json(),
        revenueResponse.json(),
      ]);

      if (
        performanceJson.success === false ||
        revenueJson.success === false
      ) {
        throw new Error("The server could not retrieve analytics data.");
      }

      setPerformance(
        Array.isArray(performanceJson.data) ? performanceJson.data : []
      );
      setRevenue(Array.isArray(revenueJson.data) ? revenueJson.data : []);
      setLastLoaded(new Date());
    } catch (err) {
      setError(err.message || "Could not load analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const refreshAnalytics = async () => {
    setRefreshing(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API}/analytics/refresh`, {
        method: "POST",
      });
      const json = await response.json();

      if (!response.ok || json.success === false) {
        throw new Error(json?.error?.message || "Refresh failed.");
      }

      setNotice("Property performance summary refreshed successfully.");
      await loadAnalytics();
    } catch (err) {
      setError(err.message || "Refresh failed. Please try again.");
    } finally {
      setRefreshing(false);
    }
  };

  const cards = useMemo(() => {
    const sum = (field) =>
      performance.reduce(
        (total, row) => total + (Number(row[field]) || 0),
        0
      );

    return [
      {
        label: "Total bookings",
        value: number(sum("total_bookings")),
        icon: CalendarDays,
      },
      {
        label: "Gross revenue",
        value: money(sum("gross_revenue")),
        icon: Wallet,
      },
      {
        label: "Realised revenue",
        value: money(sum("realised_revenue")),
        icon: TrendingUp,
      },
      {
        label: "Nights booked",
        value: number(sum("total_nights_booked")),
        icon: Moon,
      },
    ];
  }, [performance]);

  // Aggregate daily revenue across all properties, then calculate
  // a seven-day moving average for the overall revenue chart.
  const chartData = useMemo(() => {
    const byDate = new Map();

    for (const row of revenue) {
      const date = String(row.booking_date || "").slice(0, 10);
      if (!date) continue;

      byDate.set(
        date,
        (byDate.get(date) || 0) + (Number(row.daily_revenue) || 0)
      );
    }

    const dailyData = [...byDate.entries()]
      .map(([date, dailyRevenue]) => ({
        date,
        revenue: dailyRevenue,
        dateLabel: new Date(`${date}T00:00:00`).toLocaleDateString(
          "en-IN",
          { day: "numeric", month: "short" }
        ),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Fill missing calendar dates with zero before calculating averages.
    if (dailyData.length === 0) return [];

    const dailyMap = new Map(dailyData.map((item) => [item.date, item]));
    const firstDate = new Date(`${dailyData[0].date}T00:00:00`);
    const lastDate = new Date(
      `${dailyData[dailyData.length - 1].date}T00:00:00`
    );
    const completeDays = [];

    for (
      const date = new Date(firstDate);
      date <= lastDate;
      date.setDate(date.getDate() + 1)
    ) {
      const key = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");

      const existing = dailyMap.get(key);

      completeDays.push(
        existing || {
          date: key,
          revenue: 0,
          dateLabel: date.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          }),
        }
      );
    }

    return completeDays.map((item, index, items) => {
      const start = Math.max(0, index - 6);
      const window = items.slice(start, index + 1);
      const average =
        window.reduce((sum, day) => sum + day.revenue, 0) / window.length;

      return {
        ...item,
        movingAverage: Number(average.toFixed(2)),
      };
    });
  }, [revenue]);

  // Rank properties for the latest available date.
  const ranking = useMemo(() => {
    const latestDate = revenue.reduce((latest, row) => {
      const date = String(row.booking_date || "").slice(0, 10);
      return date > latest ? date : latest;
    }, "");

    if (!latestDate) return [];

    return revenue
      .filter(
        (row) =>
          String(row.booking_date || "").slice(0, 10) === latestDate
      )
      .sort(compareRanking(rankSort));
  }, [revenue, rankSort]);

  const totalPages = Math.max(
    1,
    Math.ceil(ranking.length / PAGE_SIZE)
  );

  const paginatedRanking = ranking.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [revenue, rankSort]);

  return (
    <div className="analytics-screen">
      
<main className="main-content" id="analytics">
        <header className="topbar">
          <div>
            <div className="eyebrow">STAYSPOT / ANALYTICS</div>
            <h1>Analytics overview</h1>
          </div>

          <div className="topbar-right">
            <span className="live-indicator">
              <span /> API-connected dashboard
            </span>
            <button
              className="refresh-button"
              onClick={refreshAnalytics}
              disabled={refreshing || loading}
            >
              <RefreshCw
                size={16}
                className={refreshing ? "spin" : ""}
              />
              {refreshing ? "Refreshing..." : "Refresh data"}
            </button>
          </div>
        </header>

        {error && (
          <div className="alert error-alert" role="alert">
            <AlertCircle size={18} />
            <div>
              <strong>Couldn't load analytics</strong>
              <p>{error}</p>
            </div>
            <button className="text-button" onClick={loadAnalytics}>
              Try again
            </button>
          </div>
        )}

        {notice && (
          <div className="alert success-alert" role="status">
            <CheckCircle2 size={18} /> {notice}
          </div>
        )}

        <section className="welcome-row">
          <div>
            <h2>Performance at a glance</h2>
            <p>
              Track bookings, revenue, and property performance in one place.
            </p>
          </div>
          <div className="updated-label">
            <span className="status-dot" />
            {lastLoaded
              ? `Data loaded ${lastLoaded.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Waiting for data"}
          </div>
        </section>

        <section className="kpi-grid" aria-label="Summary metrics">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <article className="kpi-card" key={card.label}>
                <div className="kpi-top">
                  <span>{card.label}</span>
                  <span className="kpi-icon">
                    <Icon size={19} />
                  </span>
                </div>
                <div className="kpi-value">
                  {loading ? "…" : card.value}
                </div>
                <div className="kpi-foot">
                  {loading ? "Loading data" : "Database summary"}
                </div>
              </article>
            );
          })}
        </section>

        {/* Revenue chart and analytics notes */}
        <section className="content-grid" id="revenue">
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <h3>Revenue trend</h3>
                <p>Daily revenue and 7-day moving average</p>
              </div>
              <span className="chart-period">Last 30 days</span>
            </div>

            {loading ? (
              <div className="table-state">Loading revenue data…</div>
            ) : chartData.length === 0 ? (
              <div className="empty-state compact">
                <TrendingUp size={26} />
                <strong>No revenue data available</strong>
                <p>Revenue trends will appear when data is available.</p>
              </div>
            ) : (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 12, right: 18, left: 12, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="dateLabel"
                      minTickGap={20}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        `₹${new Intl.NumberFormat("en-IN", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(value)}`
                      }
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        money(value),
                        name === "revenue"
                          ? "Daily revenue"
                          : "7-day moving average",
                      ]}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend
                      formatter={(value) =>
                        value === "revenue"
                          ? "Daily revenue"
                          : "7-day moving average"
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="revenue"
                      stroke="#173f35"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="movingAverage"
                      name="movingAverage"
                      stroke="#83a995"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>

          <article className="panel insight-panel">
            <div className="panel-heading">
              <div>
                <h3>Analytics notes</h3>
                <p>How to read this dashboard</p>
              </div>
            </div>

            <div className="insight-item">
              <span className="insight-icon">
                <TrendingUp size={18} />
              </span>
              <div>
                <strong>Moving average</strong>
                <p>
                  Helps smooth daily fluctuations to reveal revenue trends
                  over seven days.
                </p>
              </div>
            </div>

            <div className="insight-item">
              <span className="insight-icon">
                <Building2 size={18} />
              </span>
              <div>
                <strong>Property ranking</strong>
                <p>
                  Ranks properties by their seven-day moving-average revenue
                  for the latest available date.
                </p>
              </div>
            </div>

            <div className="refresh-info">
              <span>Last data fetch</span>
              <strong>
                {lastLoaded
                  ? lastLoaded.toLocaleString("en-IN")
                  : "Not loaded yet"}
              </strong>
              <small>
                This is the dashboard fetch time, not the database
                materialized-view refresh time.
              </small>
            </div>
          </article>
        </section>

        {/* Property ranking table — appears only once */}
        <section className="panel table-panel" id="performance">
          <div className="panel-heading">
            <div>
              <h3>Property performance ranking</h3>
              <p>
                {rankSort === "rank"
                  ? "Ranked by moving-average revenue on the latest available date"
                  : `Sorted by ${RANK_SORTS.find((item) => item.id === rankSort)?.label.toLowerCase()} on the latest available date`}
              </p>
            </div>
            <div className="panel-heading-tools">
              <label className="rank-sort">
                Sort
                <select
                  value={rankSort}
                  onChange={(event) => setRankSort(event.target.value)}
                >
                  {RANK_SORTS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="row-count">
                {number(ranking.length)} properties
              </span>
            </div>
          </div>

          {loading ? (
            <div className="table-state">
              Loading property rankings…
            </div>
          ) : ranking.length === 0 ? (
            <div className="empty-state compact">
              <Building2 size={26} />
              <strong>No ranking data available</strong>
              <p>Check that the bookings table contains data.</p>
            </div>
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Property</th>
                      <th>Daily revenue</th>
                      <th>7-day moving average</th>
                      <th>7-day revenue</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedRanking.map((row) => (
                      <tr
                        key={`${row.property_id}-${row.booking_date}`}
                      >
                        <td>
                          <span
                            className={`rank-badge ${
                              Number(row.rank_by_moving_avg) <= 3
                                ? "top-rank"
                                : ""
                            }`}
                          >
                            #{row.rank_by_moving_avg}
                          </span>
                        </td>
                        <td className="property-id">
                          <span className="property-name">{row.title}</span>
                          <span>{row.property_id}</span>
                        </td>
                        <td>{money(row.daily_revenue)}</td>
                        <td className="emphasis">
                          {money(row.moving_avg_7d)}
                        </td>
                        <td>{money(row.trailing_7d_revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <span>
                  Showing{" "}
                  {(currentPage - 1) * PAGE_SIZE + 1}
                  {"–"}
                  {Math.min(
                    currentPage * PAGE_SIZE,
                    ranking.length
                  )}
                  {" of "}
                  {number(ranking.length)}
                </span>

                <div className="pagination-controls">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                  >
                    Previous
                  </button>

                  <span>
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setCurrentPage((page) =>
                        Math.min(totalPages, page + 1)
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <footer className="page-footer">
          <span>StaySpot Analytics · Assignment 1B</span>
          <span>Property performance and revenue insights</span>
        </footer>
      </main>
    </div>
  );
}

