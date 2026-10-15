import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";
import { Problem } from "../components/States";
import { money } from "../format";

const PRESETS = [
  { name: "Hyderabad", latitude: 17.385, longitude: 78.4867 },
  { name: "Hitech City", latitude: 17.4435, longitude: 78.3772 },
  { name: "Charminar", latitude: 17.3616, longitude: 78.4747 },
];

function roundCoord(value) {
  return Math.round(Number(value) * 100000) / 100000;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pinIcon(active) {
  return L.divIcon({
    className: active ? "property-pin is-active" : "property-pin",
    iconSize: active ? [22, 22] : [16, 16],
    iconAnchor: active ? [11, 22] : [8, 16],
    popupAnchor: [0, active ? -20 : -14],
  });
}

function distanceLabel(km) {
  const value = Number(km);
  if (!Number.isFinite(value)) return "";
  if (value < 0.1) return "Under 0.1 km";
  return `${value.toFixed(1)} km`;
}

export default function MapScreen() {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const [origin, setOrigin] = useState(PRESETS[0]);
  const [draftLat, setDraftLat] = useState(String(PRESETS[0].latitude));
  const [draftLng, setDraftLng] = useState(String(PRESETS[0].longitude));
  const [coordError, setCoordError] = useState("");
  const [properties, setProperties] = useState({
    status: "loading",
    rows: [],
    radius: 5,
    error: null,
  });
  const [selectedId, setSelectedId] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const node = mapNode.current;
    if (!node) return undefined;
    if (node._leaflet_id) node._leaflet_id = undefined;
    const map = L.map(node, { scrollWheelZoom: true }).setView(
      [origin.latitude, origin.longitude],
      13
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    map.on("click", (event) => {
      const next = {
        latitude: roundCoord(event.latlng.lat),
        longitude: roundCoord(event.latlng.lng),
      };
      setOrigin(next);
      setDraftLat(String(next.latitude));
      setDraftLng(String(next.longitude));
      setCoordError("");
    });
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const query = new URLSearchParams({
      latitude: String(origin.latitude),
      longitude: String(origin.longitude),
      radius_km: "5",
    });
    setSelectedId(null);
    setProperties((current) => ({ ...current, status: "loading", error: null }));
    api(`/api/properties/nearby?${query}`, { signal: controller.signal })
      .then((body) => {
        if (!active) return;
        setProperties({
          status: "ready",
          rows: body.data || [],
          radius: body.radius_km ?? 5,
          error: null,
        });
      })
      .catch((error) => {
        if (!active || error.name === "AbortError") return;
        setProperties({
          status: "error",
          rows: [],
          radius: 5,
          error,
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [origin.latitude, origin.longitude, tick]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.setView([origin.latitude, origin.longitude]);
  }, [origin.latitude, origin.longitude]);

  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.clearLayers();
    const center = [origin.latitude, origin.longitude];
    L.circle(center, {
      radius: (properties.radius || 5) * 1000,
      color: "#173f35",
      weight: 2,
      fillColor: "#173f35",
      fillOpacity: 0.06,
    }).addTo(layers);
    L.circleMarker(center, {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: "#173f35",
      fillOpacity: 1,
    }).addTo(layers);
    for (const property of properties.rows) {
      const active = property.id === selectedId;
      const marker = L.marker([Number(property.latitude), Number(property.longitude)], {
        icon: pinIcon(active),
        title: property.title,
        zIndexOffset: active ? 800 : 0,
      });
      marker.bindPopup(
        `<strong>${escapeHtml(property.title)}</strong><br>${escapeHtml(money(property.base_price))} / night`
      );
      marker.on("click", () => setSelectedId(property.id));
      marker.addTo(layers);
      if (active) marker.openPopup();
    }
  }, [origin, properties.rows, properties.radius, selectedId]);

  function applyDraft(event) {
    event.preventDefault();
    const latitude = Number(draftLat);
    const longitude = Number(draftLng);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setCoordError("Latitude must be between -90 and 90, longitude between -180 and 180.");
      return;
    }
    setCoordError("");
    setOrigin({ latitude: roundCoord(latitude), longitude: roundCoord(longitude) });
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Search Hotspots</h1>
          <p className="lede">Properties within 5 km of the map centre.</p>
        </div>
      </header>

      <div className="map-layout">
        <div>
          <div className="map-canvas" ref={mapNode} />
          <form className="toolbar" onSubmit={applyDraft}>
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="pill"
                onClick={() => {
                  setOrigin(preset);
                  setDraftLat(String(preset.latitude));
                  setDraftLng(String(preset.longitude));
                  setCoordError("");
                }}
              >
                {preset.name}
              </button>
            ))}
            <label className="field">
              Latitude
              <input value={draftLat} onChange={(event) => setDraftLat(event.target.value)} />
            </label>
            <label className="field">
              Longitude
              <input value={draftLng} onChange={(event) => setDraftLng(event.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary">
              Move origin
            </button>
          </form>
          {coordError ? <p className="hint warn">{coordError}</p> : null}
        </div>

        <aside className="panel map-side">
          <div className="panel-head">
            <h2>Within {properties.radius} km</h2>
            <p className="hint">
              {properties.status === "ready"
                ? `${properties.rows.length} properties`
                : "Finding properties…"}
            </p>
          </div>
          {properties.status === "error" ? (
            <Problem error={properties.error} onRetry={() => setTick((value) => value + 1)} />
          ) : null}
          {properties.status === "ready" && properties.rows.length === 0 ? (
            <p className="muted">No properties in this circle.</p>
          ) : null}
          <ul className="ring-list property-results">
            {properties.rows.map((property) => (
              <li key={property.id}>
                <button
                  type="button"
                  className={
                    property.id === selectedId ? "directory-row is-selected" : "directory-row"
                  }
                  onClick={() => {
                    setSelectedId(property.id);
                    mapRef.current?.panTo([
                      Number(property.latitude),
                      Number(property.longitude),
                    ]);
                  }}
                >
                  <span>
                    <strong>{property.title}</strong>
                    <small>
                      {distanceLabel(property.distance_km)} · {money(property.base_price)} / night
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
