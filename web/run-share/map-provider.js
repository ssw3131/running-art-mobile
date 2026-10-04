/* global maptilersdk */
// Provider boundary. Stored geometry and share URLs do not depend on MapTiler.
export function showMap({ container, snapshot, key, onReady, onError }) {
  if (!window.maptilersdk) throw new Error('Map library unavailable');
  maptilersdk.config.apiKey = key;
  const map = new maptilersdk.Map({ container, style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`,
    center: snapshot.segments[0][0], zoom: 13, geolocateControl: false, terrainControl: false, fullscreenControl: false });
  const visible = { actual: true, planned: true, target: true };
  let loaded = false;
  const line = coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
  const actual = { type: 'FeatureCollection', features: snapshot.segments.map(s => s.length > 1 ? line(s) : ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: s[0] } })) };
  const geometry = { actual, planned: snapshot.planned ? line(snapshot.planned.route) : null, target: snapshot.planned ? line(snapshot.planned.target) : null };
  function fit() {
    const positions = [];
    if (visible.actual) for (const s of snapshot.segments) for (const p of s) positions.push(p);
    if (snapshot.planned && visible.planned) positions.push(...snapshot.planned.route);
    if (snapshot.planned && visible.target) positions.push(...snapshot.planned.target);
    if (!positions.length) return;
    const bounds = new maptilersdk.LngLatBounds();
    for (const p of positions) bounds.extend(p);
    map.fitBounds(bounds, { padding: { top: 55, bottom: 70, left: 35, right: 55 }, maxZoom: 17, duration: 0 });
  }
  map.on('error', () => onError('배경 지도를 불러오지 못한 부분이 있어요. 연결을 확인한 뒤 다시 열어 주세요.'));
  map.on('load', () => {
    const paints = {
      target: { 'line-color': '#b364ad', 'line-width': 3, 'line-dasharray': [1, 2], 'line-opacity': 0.8 },
      planned: { 'line-color': '#2879ce', 'line-width': 3.5, 'line-dasharray': [3, 2] },
      actual: { 'line-color': '#176347', 'line-width': 5 },
    };
    for (const name of ['target', 'planned', 'actual']) {
      if (!geometry[name]) continue;
      map.addSource(name, { type: 'geojson', data: geometry[name] });
      map.addLayer({ id: name, source: name, type: 'line', filter: ['==', '$type', 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round', visibility: visible[name] ? 'visible' : 'none' }, paint: paints[name] });
    }
    map.addLayer({ id: 'actual-points', source: 'actual', type: 'circle', filter: ['==', '$type', 'Point'],
      layout: { visibility: visible.actual ? 'visible' : 'none' }, paint: { 'circle-radius': 4, 'circle-color': '#176347', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
    loaded = true; fit(); onReady();
  });
  map.on('resize', () => { if (loaded) fit(); });
  return { fit, destroy: () => map.remove(), setVisible(name, value) {
    visible[name] = value;
    if (loaded && geometry[name]) map.setLayoutProperty(name, 'visibility', value ? 'visible' : 'none');
    if (loaded && name === 'actual') map.setLayoutProperty('actual-points', 'visibility', value ? 'visible' : 'none');
  } };
}
