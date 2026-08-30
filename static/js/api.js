async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${url} (${res.status})`);
  }
  return res.json();
}

export function fetchOverview() {
  return fetchJSON("/api/overview");
}

export function fetchResponderComparison() {
  return fetchJSON("/api/responder-comparison");
}

export function fetchBaselineSubset() {
  return fetchJSON("/api/baseline-subset");
}

export function fetchRawData() {
  return fetchJSON("/api/raw-data");
}
