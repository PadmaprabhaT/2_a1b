import { useEffect, useState } from "react";
import { getGuests } from "../api";
import { initials, matches, money } from "../format";
import Pager from "./Pager";
import { Empty, Problem } from "./States";

const LIMIT = 8;

export default function GuestPicker({ open, selectedId, onClose, onSelect }) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [state, setState] = useState({
    status: "idle",
    rows: [],
    total: 0,
    error: null,
  });

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    let active = true;
    setState((current) => ({ ...current, status: "loading", error: null }));
    getGuests({ limit: LIMIT, offset: page * LIMIT, signal: controller.signal })
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
  }, [open, page, tick]);

  if (!open) return null;

  const visible = state.rows.filter((guest) =>
    matches(query, guest.name, guest.id)
  );

  return (
    <div className="modal" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 id="guest-picker-title">Choose a guest</h2>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <label className="field">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Guest name"
          />
        </label>
        {state.status === "error" ? (
          <Problem error={state.error} onRetry={() => setTick((value) => value + 1)} />
        ) : null}
        {state.status === "ready" && visible.length === 0 ? (
          <Empty
            title="No guest on this page"
            body="No guests match this search."
          />
        ) : (
          <ul className="picker-list">
            {visible.map((guest) => (
              <li key={guest.id}>
                <button
                  type="button"
                  className={guest.id === selectedId ? "picker-row is-selected" : "picker-row"}
                  onClick={() => onSelect(guest)}
                >
                  <span className="avatar">{initials(guest.name)}</span>
                  <span>
                    <strong>{guest.name}</strong>
                    <small>{money(guest.wallet_balance)} in wallet</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} total={state.total} limit={LIMIT} onPage={setPage} />
      </div>
    </div>
  );
}
