function label(key) {
  return String(key).replaceAll("_", " ");
}

function Node({ value }) {
  if (value == null || value === "") {
    return <p className="muted">None listed</p>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="muted">None listed</p>;
    const simple = value.every(
      (item) => typeof item === "string" || typeof item === "number"
    );
    if (simple) {
      return (
        <ul className="chip-list">
          {value.map((item) => (
            <li key={String(item)}>{String(item)}</li>
          ))}
        </ul>
      );
    }
    return value.map((item, index) => (
      <article className="catalog-block" key={item?.category || index}>
        {item?.category ? <h4>{item.category}</h4> : null}
        <Node value={item?.items ?? item} />
      </article>
    ));
  }

  if (typeof value === "object") {
    return Object.entries(value).map(([key, entry]) => (
      <article className="catalog-block" key={key}>
        <h4>{label(key)}</h4>
        <Node value={entry} />
      </article>
    ));
  }

  return <p>{String(value)}</p>;
}

export default function Catalog({ data }) {
  if (!data) return null;
  const known = new Set([
    "property_id",
    "amenity_categories",
    "house_rules",
    "accessibility_features",
  ]);
  const extra = Object.entries(data).filter(([key]) => !known.has(key));

  return (
    <div className="catalog">
      <section>
        <h4>Amenities</h4>
        <Node value={data.amenity_categories} />
      </section>
      <section>
        <h4>House rules</h4>
        <Node value={data.house_rules} />
      </section>
      <section>
        <h4>Accessibility</h4>
        <Node value={data.accessibility_features} />
      </section>
      {extra.map(([key, value]) => (
        <section key={key}>
          <h4>{label(key)}</h4>
          <Node value={value} />
        </section>
      ))}
    </div>
  );
}
