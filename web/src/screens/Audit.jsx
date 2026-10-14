import { useEffect, useState } from "react";
import { api } from "../api";
import Pager from "../components/Pager";
import { Empty, Problem } from "../components/States";
import { money, when } from "../format";

const LIMIT = 12;

function signed(row) {
  const amount = money(row.amount_changed);
  return row.action_type === "DEBIT" ? `−${amount}` : `+${amount}`;
}

export default function Audit({ actor, onChooseGuest }) {
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(0);
  const [tick, setTick] = useState(0);
  const [formError, setFormError] = useState("");
  const [state, setState] = useState({
    status: "idle",
    rows: [],
    total: 0,
    error: null,
  });

  useEffect(() => {
    if (!actor?.id) return undefined;
    const controller = new AbortController();
    let active = true;
    setState((current) => ({ ...current, status: "loading", error: null }));
    const query = new URLSearchParams({
      limit: String(LIMIT),
      offset: String(page * LIMIT),
    });
    if (start) query.set("start_date", start);
    if (end) query.set("end_date", end);
    api(`/api/guests/${actor.id}/audit-logs?${query}`, { signal: controller.signal })
      .then((body) => {
        if (!active) return;
        setState({
          status: "ready",
          rows: body.data || [],
          total: body.pagination?.total || 0,
          error: null,
        });
      })
      .catch((error) => {
        if (!active || error.name === "AbortError") return;
        setState({ status: "error", rows: [], total: 0, error });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [actor?.id, start, end, page, tick]);

  function applyDates(event) {
    event.preventDefault();
    if (draftStart && draftEnd && draftStart > draftEnd) {
      setFormError("Start date must be on or before the end date.");
      return;
    }
    setFormError("");
    setPage(0);
    setStart(draftStart);
    setEnd(draftEnd);
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Wallet &amp; Audit Trail</h1>
          <p className="lede">Review wallet movements for the selected guest.</p>
        </div>
      </header>

      {!actor ? (
        <div className="callout">
          <p>Choose a guest.</p>
          <button type="button" className="btn btn-primary" onClick={onChooseGuest}>
            Choose a guest
          </button>
        </div>
      ) : (
        <>
          <div className="callout">
            <p>
              <strong>{actor.name}</strong>
              <span> · wallet now {money(actor.wallet_balance)}</span>
            </p>
            <button type="button" className="btn btn-ghost" onClick={onChooseGuest}>
              Change guest
            </button>
          </div>
          <form className="toolbar" onSubmit={applyDates}>
            <label className="field">
              From
              <input
                type="date"
                value={draftStart}
                onChange={(event) => setDraftStart(event.target.value)}
              />
            </label>
            <label className="field">
              To
              <input
                type="date"
                value={draftEnd}
                onChange={(event) => setDraftEnd(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Apply dates
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setDraftStart("");
                setDraftEnd("");
                setStart("");
                setEnd("");
                setFormError("");
                setPage(0);
              }}
            >
              Clear
            </button>
          </form>
          {formError ? <p className="hint warn">{formError}</p> : null}
          {(start || end) && (
            <p className="hint">
              Showing {start || "the beginning"} through {end || "now"}.
            </p>
          )}

          {state.status === "error" ? (
            <Problem error={state.error} onRetry={() => setTick((value) => value + 1)} />
          ) : null}
          {state.status === "loading" && state.rows.length === 0 ? (
            <p className="muted">Loading…</p>
          ) : null}
          {state.status === "ready" && state.rows.length === 0 ? (
            <Empty
              title="No entries"
              body="This guest has no audit entries in the chosen dates."
            />
          ) : null}
          {state.rows.length > 0 ? (
            <div className={`table-wrap ${state.status === "loading" ? "is-dim" : ""}`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Amount</th>
                    <th>Running balance</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{when(row.timestamp)}</td>
                      <td>{row.action_type}</td>
                      <td className={row.action_type === "DEBIT" ? "debit" : "credit"}>
                        {signed(row)}
                      </td>
                      <td>{money(row.running_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={page} total={state.total} limit={LIMIT} onPage={setPage} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
