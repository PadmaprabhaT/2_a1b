export class ApiError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError(
      "StaySpot API is not reachable. Start it on port 3000 and try again.",
      { code: "NETWORK" }
    );
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || body?.success === false) {
    throw new ApiError(
      body?.error?.message || `Request failed (${response.status}).`,
      {
        status: response.status,
        code: body?.error?.code || "REQUEST_FAILED",
        body,
      }
    );
  }

  return body;
}

export function getProperties({ limit, offset, sort, signal }) {
  const query = new URLSearchParams({ limit, offset, sort });
  return api(`/api/properties?${query}`, { signal });
}

export function getGuests({ limit, offset, signal }) {
  const query = new URLSearchParams({ limit, offset });
  return api(`/api/guests?${query}`, { signal });
}

export function getBookings({ limit, offset, status, guestId, signal }) {
  const query = new URLSearchParams({ limit, offset });
  if (status) query.set("status", status);
  if (guestId) query.set("guest_id", guestId);
  return api(`/api/bookings?${query}`, { signal });
}
