import { useEffect, useState } from "react";
import { api, getBookings, getGuests, getProperties } from "../api";
import Catalog from "../components/Catalog";
import Pager from "../components/Pager";
import { Empty, LoadingCards, Problem } from "../components/States";
import {
  STATUS_LABEL,
  coords,
  coverStyle,
  day,
  initials,
  matches,
  money,
  nextStatus,
} from "../format";

const LIMIT = 8;
const TABS = [
  ["properties", "Properties"],
  ["guests", "Guests"],
  ["bookings", "Bookings"],
];

export default function Browse({ actor, onAct, onBook, onOpenAudit }) {
  const [tab, setTab] = useState("properties");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("title");
  const [status, setStatus] = useState("");
  const [guestOnly, setGuestOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [list, setList] = useState({
    status: "loading",
    rows: [],
    total: 0,
    error: null,
  });
  const [selected, setSelected] = useState(null);
  const [amenities, setAmenities] = useState({ status: "idle", data: null, error: null });
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState(null);

  function changeTab(next) {
    setTab(next);
    setPage(0);
    setQuery("");
    setSelected(null);
    setStatusError(null);
  }

  useEffect(() => {
    if (!actor) setGuestOnly(false);
  }, [actor]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setList((current) => ({ ...current, status: "loading", error: null }));

    const request =
      tab === "properties"
        ? getProperties({
            limit: LIMIT,
            offset: page * LIMIT,
            sort,
            signal: controller.signal,
          })
        : tab === "guests"
          ? getGuests({
              limit: LIMIT,
              offset: page * LIMIT,
              signal: controller.signal,
            })
          : getBookings({
              limit: LIMIT,
              offset: page * LIMIT,
              status,
              guestId: guestOnly && actor?.id ? actor.id : undefined,
              signal: controller.signal,
            });

    request
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
  }, [tab, page, sort, status, guestOnly, actor?.id, tick]);

  useEffect(() => {
    if (selected?.kind !== "property") return undefined;
    const controller = new AbortController();
    let active = true;
    setAmenities({ status: "loading", data: null, error: null });
    api(`/api/properties/${selected.row.id}/amenities`, { signal: controller.signal })
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
  }, [selected]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function advance(booking) {
    const next = nextStatus(booking.status);
    if (!next || !actor?.id || booking.guest_id !== actor.id) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const body = await api(`/api/bookings/${booking.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next, guest_id: actor.id }),
      });
      setSelected({
        kind: "booking",
        row: {
          ...booking,
          ...body.data,
          guest_name: booking.guest_name,
          property_title: booking.property_title,
        },
      });
      setTick((value) => value + 1);
    } catch (error) {
      setStatusError(error);
    } finally {
      setStatusBusy(false);
    }
  }

  const visible = list.rows.filter((row) =>
    matches(
      query,
      row.title,
      row.name,
      row.guest_name,
      row.property_title,
      row.id,
      row.status
    )
  );

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Browse inventory</h1>
          <p className="lede">Explore properties and review guest and booking records.</p>
        </div>
      </header>

      <div className="toolbar">
        <div className="pills" role="tablist" aria-label="Directory">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "pill is-on" : "pill"}
              onClick={() => changeTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="field grow">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "guests" ? "Name" : "Title or guest"}
          />
        </label>
        {tab === "properties" ? (
          <label className="field">
            Sort
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(0);
              }}
            >
              <option value="title">Name</option>
              <option value="price_asc">Price, low to high</option>
              <option value="price_desc">Price, high to low</option>
            </select>
          </label>
        ) : null}
        {tab === "bookings" ? (
          <>
            <div className="pills" aria-label="Booking status">
              {[
                ["", "All"],
                ["CONFIRMED", "Confirmed"],
                ["CHECKED_IN", "Checked in"],
                ["COMPLETED", "Completed"],
              ].map(([value, label]) => (
                <button
                  key={value || "all"}
                  type="button"
                  className={status === value ? "pill is-on" : "pill"}
                  onClick={() => {
                    setStatus(value);
                    setPage(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={guestOnly ? "pill is-on" : "pill"}
              disabled={!actor}
              onClick={() => {
                setGuestOnly((value) => !value);
                setPage(0);
              }}
            >
              This guest only
            </button>
          </>
        ) : null}
      </div>
      {list.status === "error" ? (
        <Problem error={list.error} onRetry={() => setTick((value) => value + 1)} />
      ) : null}

      {list.status === "loading" && list.rows.length === 0 ? <LoadingCards /> : null}

      {list.status === "ready" && list.rows.length === 0 ? (
        <Empty
          title="Nothing in this list"
          body="Nothing matches these filters."
        />
      ) : null}

      {list.status !== "error" && list.rows.length > 0 && visible.length === 0 ? (
        <Empty
          title="No match on this page"
          body="Clear the filter or go to another page."
        />
      ) : null}

      <div className={selected ? "workspace has-detail" : "workspace"}>
        <div className={list.status === "loading" ? "is-dim" : ""}>
          {tab === "properties" && visible.length > 0 ? (
            <div className="grid">
              {visible.map((property) => (
                <article className="card stay-card" key={property.id}>
                  <button
                    type="button"
                    className="card-hit"
                    onClick={() => setSelected({ kind: "property", row: property })}
                  >
                    <div className="stay-cover" style={coverStyle(property.id)}>
                      <span className="price-badge">{money(property.base_price)} / night</span>
                    </div>
                    <div className="card-body">
                      <h2>{property.title}</h2>
                      <p>{coords(property.latitude, property.longitude)}</p>
                    </div>
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          {tab === "guests" && visible.length > 0 ? (
            <ul className="directory">
              {visible.map((guest) => (
                <li key={guest.id}>
                  <button
                    type="button"
                    className="directory-row"
                    onClick={() => setSelected({ kind: "guest", row: guest })}
                  >
                    <span className="avatar">{initials(guest.name)}</span>
                    <span>
                      <strong>{guest.name}</strong>
                      <small>Wallet {money(guest.wallet_balance)}</small>
                    </span>
                    {actor?.id === guest.id ? <em className="flag">Booking as</em> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "bookings" && visible.length > 0 ? (
            <ul className="directory">
              {visible.map((booking) => (
                <li key={booking.id}>
                  <button
                    type="button"
                    className="directory-row booking-row"
                    onClick={() => {
                      setStatusError(null);
                      setSelected({ kind: "booking", row: booking });
                    }}
                  >
                    <span className={`status status-${booking.status}`}>
                      {STATUS_LABEL[booking.status] || booking.status}
                    </span>
                    <span>
                      <strong>{booking.property_title}</strong>
                      <small>
                        {booking.guest_name} · {day(booking.check_in_date)} – {day(booking.check_out_date)}
                      </small>
                    </span>
                    <em>{money(booking.total_cost)}</em>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {list.rows.length > 0 ? (
            <Pager page={page} total={list.total} limit={LIMIT} onPage={setPage} />
          ) : null}
        </div>

        {selected ? (
          <aside className="detail">
            <header className="detail-head">
              <span />
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
                Close
              </button>
            </header>

            {selected.kind === "property" ? (
              <>
                <div className="stay-cover detail-cover" style={coverStyle(selected.row.id)} />
                <h2>{selected.row.title}</h2>
                <p className="price">{money(selected.row.base_price)} a night</p>
                <p>{coords(selected.row.latitude, selected.row.longitude)}</p>
                <div className="detail-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onBook(selected.row)}
                  >
                    Book this stay
                  </button>
                </div>
                {amenities.status === "loading" ? <p className="muted">Loading…</p> : null}
                {amenities.status === "empty" ? (
                  <Empty title="No amenities" body="Nothing is listed for this property." />
                ) : null}
                {amenities.status === "error" ? (
                  <Problem error={amenities.error} onRetry={() => setSelected({ ...selected })} />
                ) : null}
                {amenities.status === "ready" ? <Catalog data={amenities.data} /> : null}
              </>
            ) : null}

            {selected.kind === "guest" ? (
              <>
                <div className="who">
                  <span className="avatar avatar-lg">{initials(selected.row.name)}</span>
                  <div>
                    <h2>{selected.row.name}</h2>
                    <p className="price">{money(selected.row.wallet_balance)}</p>
                  </div>
                </div>
                <div className="detail-actions">
                  <button type="button" className="btn btn-primary" onClick={() => onAct(selected.row)}>
                    Book as this guest
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => onOpenAudit(selected.row)}>
                    Open audit
                  </button>
                </div>
              </>
            ) : null}

            {selected.kind === "booking" ? (
              <>
                <span className={`status status-${selected.row.status}`}>
                  {STATUS_LABEL[selected.row.status] || selected.row.status}
                </span>
                <h2>{selected.row.property_title}</h2>
                <p>
                  {selected.row.guest_name}
                  <br />
                  {day(selected.row.check_in_date)} – {day(selected.row.check_out_date)}
                </p>
                <p className="price">{money(selected.row.total_cost)}</p>
                {nextStatus(selected.row.status) && actor?.id === selected.row.guest_id ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={statusBusy}
                    onClick={() => advance(selected.row)}
                  >
                    {statusBusy
                      ? "Updating…"
                      : nextStatus(selected.row.status) === "CHECKED_IN"
                        ? "Check in"
                        : "Complete stay"}
                  </button>
                ) : nextStatus(selected.row.status) ? (
                  <p className="muted">
                    {actor
                      ? "Only this guest can change this booking."
                      : "Choose a guest to change this booking."}
                  </p>
                ) : (
                  <p className="muted">This stay is complete.</p>
                )}
                {statusError ? (
                  <Problem title="Could not change status" error={statusError} />
                ) : null}
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
