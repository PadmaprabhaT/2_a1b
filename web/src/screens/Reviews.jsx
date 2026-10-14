import { useEffect, useState } from "react";
import { api, getProperties } from "../api";
import Catalog from "../components/Catalog";
import Pager from "../components/Pager";
import { Empty, Problem } from "../components/States";
import { coverStyle, money, when } from "../format";

const LIMIT = 6;
const WINDOWS = [7, 30, 90];

export default function Reviews() {
  const [days, setDays] = useState(30);
  const [tick, setTick] = useState(0);
  const [report, setReport] = useState({ status: "loading", body: null, error: null });
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [listTick, setListTick] = useState(0);
  const [list, setList] = useState({ status: "loading", rows: [], total: 0, error: null });
  const [property, setProperty] = useState(null);
  const [amenities, setAmenities] = useState({ status: "idle", data: null, error: null });
  const [propertyReport, setPropertyReport] = useState({
    status: "idle",
    body: null,
    error: null,
  });
  const [propertyTick, setPropertyTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setReport((current) => ({ ...current, status: "loading", error: null }));
    api(`/api/analytics/reviews?days=${days}`, { signal: controller.signal })
      .then((body) => {
        if (!active) return;
        setReport({ status: "ready", body, error: null });
      })
      .catch((error) => {
        if (!active || error.name === "AbortError") return;
        setReport({ status: "error", body: null, error });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [days, tick]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setList((current) => ({ ...current, status: "loading", error: null }));
    getProperties({
      limit: LIMIT,
      offset: page * LIMIT,
      sort: "title",
      signal: controller.signal,
    })
      .then((body) => {
        if (!active) return;
        setList({
          status: "ready",
          rows: body.data || [],
          total: body.pagination?.total || 0,
          error: null,
        });
      })
      .catch((error) => {
        if (!active || error.name === "AbortError") return;
        setList({ status: "error", rows: [], total: 0, error });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [page, listTick]);

  useEffect(() => {
    if (!property?.id) return undefined;
    const controller = new AbortController();
    let active = true;
    setAmenities({ status: "loading", data: null, error: null });
    api(`/api/properties/${property.id}/amenities`, { signal: controller.signal })
      .then((body) => {
        if (!active) return;
        setAmenities({ status: "ready", data: body.data, error: null });
      })
      .catch((error) => {
        if (!active || error.name === "AbortError") return;
        if (error.code === "AMENITIES_NOT_FOUND") {
          setAmenities({ status: "empty", data: null, error: null });
          return;
        }
        setAmenities({ status: "error", data: null, error });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [property]);

  useEffect(() => {
    if (!property?.id) {
      setPropertyReport({ status: "idle", body: null, error: null });
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setPropertyReport((current) => ({ ...current, status: "loading", error: null }));
    api(`/api/analytics/reviews?days=${days}&property_id=${property.id}`, {
      signal: controller.signal,
    })
      .then((body) => {
        if (!active) return;
        setPropertyReport({ status: "ready", body, error: null });
      })
      .catch((error) => {
        if (!active || error.name === "AbortError") return;
        setPropertyReport({ status: "error", body: null, error });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [property, days, propertyTick]);

  const distribution = report.body?.rating_distribution || [];
  const tags = report.body?.top_tags || [];
  const overall = report.body?.overall;
  const propertyOverall = propertyReport.body?.overall;
  const propertyReviews = propertyReport.body?.reviews || [];
  const visible = list.rows.filter((row) =>
    `${row.title} ${row.id}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Reviews &amp; Amenities</h1>
          <p className="lede">Guest ratings, tags, and property amenities.</p>
        </div>
      </header>

      <div className="pills" aria-label="Review window">
        {WINDOWS.map((value) => (
          <button
            key={value}
            type="button"
            className={days === value ? "pill is-on" : "pill"}
            onClick={() => setDays(value)}
          >
            {value} days
          </button>
        ))}
      </div>

      {report.status === "error" ? (
        <Problem error={report.error} onRetry={() => setTick((value) => value + 1)} />
      ) : null}
      {report.status === "loading" && !report.body ? <p className="muted">Counting reviews…</p> : null}

      {overall ? (
        <div className="review-layout">
          <article className="stat-hero">
            <span>Average rating, all properties</span>
            <strong>{overall.average_rating == null ? "—" : Number(overall.average_rating).toFixed(2)}</strong>
            <p>
              {Number(overall.total_reviews).toLocaleString("en-IN")} reviews
              {overall.lowest_rating != null
                ? ` · ${overall.lowest_rating} to ${overall.highest_rating}`
                : ""}
            </p>
          </article>
          <article className="panel">
            <h2>Rating distribution</h2>
            {Number(overall.total_reviews) === 0 ? (
              <Empty title="No reviews" body="Nothing in this period." />
            ) : (
              <div className="meters">
                {distribution.map((bucket) => (
                  <div className="meter-row" key={bucket.rating}>
                    <span>{bucket.rating}</span>
                    <div className="meter" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, Number(bucket.percentage) || 0)}%` }} />
                    </div>
                    <span>
                      {bucket.count} · {bucket.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>
          <article className="panel">
            <h2>Top tags</h2>
            {tags.length === 0 ? (
              <p className="muted">No tags in this period.</p>
            ) : (
              <ol className="tag-list">
                {tags.map((tag) => (
                  <li key={tag.tag}>
                    <strong>{tag.tag}</strong>
                    <span>{tag.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </article>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Choose a property</h2>
          <p className="hint">Reviews and amenities below belong to the property you select.</p>
        </div>
        <label className="field">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Property name"
          />
        </label>
        {list.status === "error" ? (
          <Problem error={list.error} onRetry={() => setListTick((value) => value + 1)} />
        ) : null}
        <div className="pick-grid">
          {visible.map((row) => (
            <button
              type="button"
              key={row.id}
              className={property?.id === row.id ? "pick is-selected" : "pick"}
              onClick={() => setProperty(row)}
            >
              <span className="pick-swatch" style={coverStyle(row.id)} />
              <span>
                <strong>{row.title}</strong>
                <small>{money(row.base_price)} / night</small>
              </span>
            </button>
          ))}
        </div>
        <Pager page={page} total={list.total} limit={LIMIT} onPage={setPage} />
      </div>

      {property ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>{property.title}</h2>
              <p className="hint">Reviews for this property in the last {days} days.</p>
            </div>
          </div>
          {propertyReport.status === "error" ? (
            <Problem
              error={propertyReport.error}
              onRetry={() => setPropertyTick((value) => value + 1)}
            />
          ) : null}
          {propertyReport.status === "loading" && !propertyReport.body ? (
            <p className="muted">Loading reviews…</p>
          ) : null}
          {propertyOverall ? (
            <article className="stat-hero">
              <span>Average for this property</span>
              <strong>
                {propertyOverall.average_rating == null
                  ? "—"
                  : Number(propertyOverall.average_rating).toFixed(2)}
              </strong>
              <p>{Number(propertyOverall.total_reviews).toLocaleString("en-IN")} reviews</p>
            </article>
          ) : null}
          {propertyReport.status === "ready" && propertyReviews.length === 0 ? (
            <Empty title="No reviews" body="This property has no reviews in the selected period." />
          ) : null}
          {propertyReviews.length > 0 ? (
            <ol className="review-list">
              {propertyReviews.map((review, index) => (
                <li className="review-card" key={`${review.created_at}-${index}`}>
                  <header>
                    <strong>{review.rating} / 5</strong>
                    <span>{when(review.created_at)}</span>
                  </header>
                  <p>{review.review_text || "No written comment."}</p>
                  {Array.isArray(review.location_tags) && review.location_tags.length > 0 ? (
                    <small>{review.location_tags.join(" · ")}</small>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}

          {amenities.status === "loading" ? <p className="muted">Loading amenities…</p> : null}
          {amenities.status === "empty" ? (
            <Empty title="No amenities" body="Nothing is listed for this property." />
          ) : null}
          {amenities.status === "error" ? <Problem error={amenities.error} /> : null}
          {amenities.status === "ready" ? <Catalog data={amenities.data} /> : null}
        </div>
      ) : null}
    </section>
  );
}
