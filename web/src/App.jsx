import { useEffect, useState } from "react";
import { api } from "./api";
import GuestPicker from "./components/GuestPicker";
import { initials, money } from "./format";
import Analytics from "./screens/Analytics";
import Audit from "./screens/Audit";
import BookStay from "./screens/BookStay";
import Browse from "./screens/Browse";
import MapScreen from "./screens/MapScreen";
import Reviews from "./screens/Reviews";

const ACTOR_KEY = "stayspot.actor";
const SCREEN_KEY = "stayspot.screen";
const NAV = [
  ["browse", "Browse"],
  ["book", "Booking"],
  ["audit", "Wallet & Audit Trail"],
  ["analytics", "Analytics"],
  ["map", "Search Hotspots"],
  ["reviews", "Reviews & Amenities"],
];

const CRUMB = {
  browse: "Browse",
  book: "Booking",
  audit: "Wallet & Audit Trail",
  analytics: "Analytics",
  map: "Search Hotspots",
  reviews: "Reviews & Amenities",
};

function readActor() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTOR_KEY) || "null");
    if (saved?.id && saved?.name) return saved;
  } catch {
    return null;
  }
  return null;
}

export default function App() {
  const [screen, setScreen] = useState(
    () => sessionStorage.getItem(SCREEN_KEY) || "browse"
  );
  const [actor, setActor] = useState(readActor);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftProperty, setDraftProperty] = useState(null);
  const [online, setOnline] = useState(null);
  const [healthTick, setHealthTick] = useState(0);

  useEffect(() => {
    sessionStorage.setItem(SCREEN_KEY, screen);
  }, [screen]);

  useEffect(() => {
    if (!actor) {
      localStorage.removeItem(ACTOR_KEY);
      return;
    }
    localStorage.setItem(
      ACTOR_KEY,
      JSON.stringify({
        id: actor.id,
        name: actor.name,
        wallet_balance: actor.wallet_balance,
      })
    );
  }, [actor]);

  useEffect(() => {
    if (!actor?.id) return undefined;
    let active = true;
    api(`/api/guests/${actor.id}`)
      .then((body) => {
        if (active) setActor(body.data);
      })
      .catch((error) => {
        if (!active) return;
        if (error.code === "GUEST_NOT_FOUND" || error.code === "INVALID_ID") {
          setActor(null);
        }
      });
    return () => {
      active = false;
    };
  }, [actor?.id]);

  useEffect(() => {
    let active = true;
    api("/api/health")
      .then(() => {
        if (active) setOnline(true);
      })
      .catch(() => {
        if (active) setOnline(false);
      });
    return () => {
      active = false;
    };
  }, [healthTick]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            S
          </span>
          <span>
            <strong>StaySpot</strong>
            <small>Property platform</small>
          </span>
        </div>
        <nav className="side-nav" aria-label="Screens">
          {NAV.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={screen === id ? "nav-btn is-on" : "nav-btn"}
              aria-current={screen === id ? "page" : undefined}
              onClick={() => setScreen(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="workspace-main">
      <header className="topbar">
        <p className="crumb">
          StaySpot <span aria-hidden="true">›</span> {CRUMB[screen]}
        </p>
        <button type="button" className="actor-btn" onClick={() => setPickerOpen(true)}>
          <span className="avatar">{actor ? initials(actor.name) : "?"}</span>
          <span>
            <small>{actor ? "Acting as" : "Guest"}</small>
            <strong>{actor?.name || "Choose a guest"}</strong>
          </span>
        </button>
      </header>

      {online === false ? (
        <div className="banner" role="status">
          <p>The API on port 3000 is not responding.</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setHealthTick((value) => value + 1)}
          >
            Check again
          </button>
        </div>
      ) : null}

      <main>
        {screen === "browse" ? (
          <Browse
            actor={actor}
            onAct={setActor}
            onBook={(property) => {
              setDraftProperty(property);
              setScreen("book");
            }}
            onOpenAudit={(guest) => {
              setActor(guest);
              setScreen("audit");
            }}
          />
        ) : null}
        {screen === "book" ? (
          <BookStay
            actor={actor}
            draftProperty={draftProperty}
            onWallet={(balance) =>
              setActor((current) =>
                current ? { ...current, wallet_balance: balance } : current
              )
            }
            onChooseGuest={() => setPickerOpen(true)}
          />
        ) : null}
        {screen === "audit" ? (
          <Audit actor={actor} onChooseGuest={() => setPickerOpen(true)} />
        ) : null}
        {screen === "analytics" ? <Analytics /> : null}
        {screen === "map" ? (
          <MapScreen actor={actor} onChooseGuest={() => setPickerOpen(true)} />
        ) : null}
        {screen === "reviews" ? <Reviews /> : null}
      </main>
      </div>

      <GuestPicker
        open={pickerOpen}
        selectedId={actor?.id}
        onClose={() => setPickerOpen(false)}
        onSelect={(guest) => {
          setActor(guest);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
