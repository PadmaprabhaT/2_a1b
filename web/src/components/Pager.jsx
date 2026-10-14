export default function Pager({ page, total, limit, onPage }) {
  const pageCount = Math.max(1, Math.ceil(Number(total) / limit));
  const current = Math.min(page, pageCount - 1);

  return (
    <div className="pager">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={current === 0}
        onClick={() => onPage(current - 1)}
      >
        Previous
      </button>
      <label className="page-jump">
        Page
        <input
          type="number"
          min={1}
          max={pageCount}
          value={current + 1}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isInteger(next) || next < 1) return;
            onPage(Math.min(next, pageCount) - 1);
          }}
        />
        of {pageCount.toLocaleString("en-IN")}
      </label>
      <span>{Number(total || 0).toLocaleString("en-IN")} total</span>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={current + 1 >= pageCount}
        onClick={() => onPage(current + 1)}
      >
        Next
      </button>
    </div>
  );
}
