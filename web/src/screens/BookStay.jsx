import { useEffect, useState } from "react";
import { api, getProperties } from "../api";
import Pager from "../components/Pager";
import { Empty, Problem } from "../components/States";
import { addDays, coords, coverStyle, day, money, nightsBetween, todayISO, when } from "../format";

const LIMIT = 6;

function refusalTitle(error) {
  if (!error) return "Check the stay slip";
  if (error.code === "BOOKING_REJECTED") return "This stay was refused";
  if (error.code === "NETWORK") return "Can't reach the server";
  return "The stay was not booked";
}

export default function BookStay({ actor, draftProperty, onWallet, onChooseGuest }) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [list, setList] = useState({ status: "loading", rows: [], total: 0, error: null });
  const [property, setProperty] = useState(draftProperty || null);
  const [nights, setNights] = useState(2);
  const [checkIn, setCheckIn] = useState(todayISO);
  const [checkOut, setCheckOut] = useState(() => addDays(todayISO(), 2));
  const [dateError, setDateError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!draftProperty?.id) return;
    setProperty(draftProperty);
    setResult(null);
  }, [draftProperty]);

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
  }, [page, tick]);

  const stayNights = Number(nights);
  const nightly = Number(property?.base_price);
  const total =
    property && Number.isFinite(nightly) && Number.isInteger(stayNights) && stayNights >= 1
      ? Number((nightly * stayNights).toFixed(2))
      : null;

  function applyNights(next) {
    const value = Math.max(1, Math.floor(Number(next) || 1));
    setNights(value);
    setDateError("");
    if (checkIn) setCheckOut(addDays(checkIn, value));
  }

  function applyCheckIn(value) {
    setCheckIn(value);
    const span = nightsBetween(value, checkOut);
    if (span != null && span >= 1) {
      setNights(span);
      setDateError("");
      return;
    }
    const fallback = Math.max(1, Math.floor(Number(nights) || 1));
    setNights(fallback);
    if (value) setCheckOut(addDays(value, fallback));
    setDateError("");
  }

  function applyCheckOut(value) {
    setCheckOut(value);
    const span = nightsBetween(checkIn, value);
    if (span != null && span >= 1) {
      setNights(span);
      setDateError("");
      return;
    }
    setDateError("Check-out must be after check-in.");
  }
  const visible = list.rows.filter((row) =>
    `${row.title} ${row.id}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  async function submit(event) {
    event?.preventDefault();
    setResult(null);
    if (!actor?.id) {
      setResult({ ok: false, message: "Choose a guest with Booking as, then try again." });
      return;
    }
    if (!property?.id) {
      setResult({ ok: false, message: "Choose a property first." });
      return;
    }
    if (!Number.isInteger(stayNights) || stayNights < 1 || nightsBetween(checkIn, checkOut) !== stayNights) {
      setResult({ ok: false, message: "Choose a check-out date after check-in." });
      return;
    }
    if (total == null || total <= 0) {
      setResult({ ok: false, message: "Choose a property with a nightly rate." });
      return;
    }
    if (!checkIn) {
      setResult({ ok: false, message: "Choose a check-in date." });
      return;
    }

    setBusy(true);
    try {
      const body = await api("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          guest_id: actor.id,
          property_id: property.id,
          total_cost: total,
          nights: stayNights,
          check_in_date: checkIn,
          check_out_date: checkOut,
        }),
      });
      setResult({ ok: true, body });
      if (body.balance_after != null) onWallet(body.balance_after);
    } catch (error) {
      setResult({ ok: false, error });
      if (error.body?.balance_after != null) onWallet(error.body.balance_after);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Create booking</h1>
          <p className="lede">Build and review a reservation before confirmation.</p>
        </div>
      </header>

      <div className="book-layout">
        <div>
          {!actor ? (
            <div className="callout">
              <p>Choose a guest.</p>
              <button type="button" className="btn btn-primary" onClick={onChooseGuest}>
                Choose a guest
              </button>
            </div>
          ) : (
            <div className="callout">
              <p>
                Paying as <strong>{actor.name}</strong>
                <span> · wallet {money(actor.wallet_balance)}</span>
              </p>
              <button type="button" className="btn btn-ghost" onClick={onChooseGuest}>
                Change guest
              </button>
            </div>
          )}

          <label className="field">
            Property
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Property name"
            />
          </label>

          {list.status === "error" ? (
            <Problem error={list.error} onRetry={() => setTick((value) => value + 1)} />
          ) : null}
          {list.status === "ready" && visible.length === 0 ? (
            <Empty title="No properties" body="Nothing matches this search." />
          ) : null}

          <div className="pick-grid">
            {visible.map((row) => (
              <button
                type="button"
                key={row.id}
                className={property?.id === row.id ? "pick is-selected" : "pick"}
                onClick={() => {
                  setProperty(row);
                  setResult(null);
                }}
              >
                <span className="pick-swatch" style={coverStyle(row.id)} />
                <span>
                  <strong>{row.title}</strong>
                  <small>
                    {money(row.base_price)} / night · {coords(row.latitude, row.longitude)}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <Pager page={page} total={list.total} limit={LIMIT} onPage={setPage} />

          <form className="stay-form" onSubmit={submit}>
            <label className="field nights-field">
              Nights
              <span className="stepper">
                <button
                  type="button"
                  aria-label="Fewer nights"
                  onClick={() => applyNights(Number(nights) - 1)}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={nights}
                  onChange={(event) => applyNights(event.target.value)}
                />
                <button
                  type="button"
                  aria-label="More nights"
                  onClick={() => applyNights(Number(nights) + 1)}
                >
                  +
                </button>
                <span className="hint">
                  {Number.isInteger(stayNights) && stayNights >= 1
                    ? `${stayNights} night${stayNights === 1 ? "" : "s"}`
                    : ""}
                </span>
              </span>
            </label>
            <div className="date-range">
              <label className="field">
                Check in
                <input
                  type="date"
                  value={checkIn}
                  onChange={(event) => applyCheckIn(event.target.value)}
                />
              </label>
              <label className="field">
                Check out
                <input
                  type="date"
                  value={checkOut}
                  min={checkIn ? addDays(checkIn, 1) : undefined}
                  onChange={(event) => applyCheckOut(event.target.value)}
                />
              </label>
            </div>
            {dateError ? <p className="hint warn field-span">{dateError}</p> : null}
            <label className="field">
              Total cost
              <input value={total == null ? "" : money(total)} readOnly />
            </label>
          </form>
        </div>

        <aside className="slip" aria-live="polite">
          <p className="kicker">Stay slip</p>
          <h2>{property?.title || "Choose a property"}</h2>
          <dl>
            <div>
              <dt>Guest</dt>
              <dd>{actor?.name || "Not chosen"}</dd>
            </div>
            <div>
              <dt>Wallet now</dt>
              <dd>{actor ? money(actor.wallet_balance) : "—"}</dd>
            </div>
            <div>
              <dt>Nights</dt>
              <dd>{Number.isInteger(stayNights) && stayNights >= 1 ? stayNights : "—"}</dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>
                {checkIn && checkOut ? `${day(checkIn)} – ${day(checkOut)}` : "—"}
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{total == null ? "—" : money(total)}</dd>
            </div>
          </dl>
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={submit}>
            {busy ? "Reserving…" : "Confirm booking"}
          </button>

          {result?.ok ? (
            <div className="result result-good">
              <p className="kicker">Booked</p>
              <h3>{result.body.message || "Booking created."}</h3>
              <p className="balance-move">
                <span>{money(result.body.balance_before)}</span>
                <span aria-hidden="true">→</span>
                <span>{money(result.body.balance_after)}</span>
              </p>
              {result.body.audit_log ? (
                <dl className="audit-mini">
                  <div>
                    <dt>Audit action</dt>
                    <dd>{result.body.audit_log.action_type}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>{money(result.body.audit_log.amount_changed)}</dd>
                  </div>
                  <div>
                    <dt>Balance after</dt>
                    <dd>{money(result.body.audit_log.balance_after)}</dd>
                  </div>
                  <div>
                    <dt>When</dt>
                    <dd>{when(result.body.audit_log.timestamp)}</dd>
                  </div>
                </dl>
              ) : (
                <p>No audit entry was returned.</p>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setResult(null)}>
                Book another
              </button>
            </div>
          ) : null}

          {result && !result.ok ? (
            <div className="result result-bad" role="alert">
              <p className="kicker">Not booked</p>
              <h3>{refusalTitle(result.error)}</h3>
              <p>{result.message || result.error?.message}</p>
              {result.error?.body?.balance_before != null ? (
                <p>
                  Wallet before {money(result.error.body.balance_before)}, after{" "}
                  {money(result.error.body.balance_after)}.
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
