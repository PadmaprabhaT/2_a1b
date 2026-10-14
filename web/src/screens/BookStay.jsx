import { useEffect, useState } from "react";
import { api, getProperties } from "../api";
import Pager from "../components/Pager";
import { Empty, Problem } from "../components/States";
import { addDays, coords, coverStyle, day, money, todayISO, when } from "../format";

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
  const [cost, setCost] = useState("");
  const [costTouched, setCostTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!draftProperty?.id) return;
    setProperty(draftProperty);
    setCostTouched(false);
    setResult(null);
  }, [draftProperty]);

  useEffect(() => {
    if (!property || costTouched) return;
    const nightly = Number(property.base_price);
    if (!Number.isFinite(nightly)) return;
    setCost((nightly * Number(nights || 0)).toFixed(2));
  }, [property, nights, costTouched]);

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
  const checkOut =
    checkIn && Number.isInteger(stayNights) && stayNights >= 1
      ? addDays(checkIn, stayNights)
      : "";
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
    if (!Number.isInteger(stayNights) || stayNights < 1) {
      setResult({ ok: false, message: "Nights must be a whole number of at least 1." });
      return;
    }
    const total = Number(cost);
    if (!Number.isFinite(total) || total <= 0) {
      setResult({ ok: false, message: "Total cost must be greater than zero." });
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
                  setCostTouched(false);
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
            <label className="field">
              Nights
              <span className="stepper">
                <button
                  type="button"
                  onClick={() => setNights((value) => Math.max(1, Number(value) - 1))}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={nights}
                  onChange={(event) => setNights(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setNights((value) => Number(value || 0) + 1)}
                >
                  +
                </button>
              </span>
            </label>
            <label className="field">
              Check in
              <input
                type="date"
                value={checkIn}
                onChange={(event) => setCheckIn(event.target.value)}
              />
            </label>
            <label className="field">
              Check out
              <input value={checkOut ? day(checkOut) : ""} readOnly />
            </label>
            <label className="field">
              Total cost
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={cost}
                onChange={(event) => {
                  setCostTouched(true);
                  setCost(event.target.value);
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setCostTouched(false)}
              disabled={!property}
            >
              Use nightly rate
            </button>
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
              <dd>{cost === "" ? "—" : money(cost)}</dd>
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
