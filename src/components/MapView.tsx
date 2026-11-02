import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, Polygon } from "geojson";
import type { LatLng } from "../lib/geo";

export interface MapMarker {
  id: string;
  pos: LatLng;
  color: "#34d399" | "#f87171" | "#60a5fa" | "#fbbf24";
  label: string;
}

/** Geodesic circle polygon (for geofence rendering without a geo lib). */
function circlePolygon(center: LatLng, radiusM: number, points = 64): [number, number][] {
  const coords: [number, number][] = [];
  const latR = (center.lat * Math.PI) / 180;
  for (let i = 0; i <= points; i++) {
    const brg = (i / points) * 2 * Math.PI;
    const dLat = (radiusM / 6371000) * Math.cos(brg);
    const dLng = (radiusM / (6371000 * Math.cos(latR))) * Math.sin(brg);
    coords.push([center.lng + (dLng * 180) / Math.PI, center.lat + (dLat * 180) / Math.PI]);
  }
  return coords;
}

/**
 * Vector map (Phase 4): MapLibre GL + OpenFreeMap dark style — no API key,
 * no watermark, crisper at every zoom than raster tiles. Same props
 * contract as the Leaflet build it replaces. MapLibre itself is lazy-loaded
 * so it never weighs down the first paint.
 */
export default function MapView(props: {
  center?: LatLng;
  markers: MapMarker[];
  geofence?: { center: LatLng; radiusM: number } | null;
  height?: number;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const mapRef = useRef<InstanceType<typeof import("maplibre-gl").Map> | null>(null);
  const markersRef = useRef<Map<string, InstanceType<typeof import("maplibre-gl").Marker>>>(new Map());
  const propsRef = useRef(props);
  propsRef.current = props;

  const renderOverlays = () => {
    const map = mapRef.current;
    const ml = libRef.current;
    if (!map || !ml) return;
    const { markers, geofence, center } = propsRef.current;

    // Markers: add/update/remove by id.
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const existing = markersRef.current.get(m.id);
      if (existing) {
        existing.setLngLat([m.pos.lng, m.pos.lat]);
      } else {
        const el = document.createElement("div");
        el.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none";
        const dot = document.createElement("div");
        dot.style.cssText = `width:20px;height:20px;border-radius:9999px;background:${m.color};border:3px solid rgba(255,255,255,.85);box-shadow:0 0 0 4px ${m.color}44,0 2px 8px rgba(0,0,0,.6)`;
        const cap = document.createElement("div");
        cap.textContent = m.label;
        cap.style.cssText = "margin-top:3px;padding:1px 6px;border-radius:9999px;background:rgba(0,0,0,.72);color:#e4e4e7;font-size:10px;font-weight:600;white-space:nowrap";
        el.appendChild(dot);
        el.appendChild(cap);
        const marker = new ml.Marker({ element: el }).setLngLat([m.pos.lng, m.pos.lat]).addTo(map);
        markersRef.current.set(m.id, marker);
      }
    }
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) { marker.remove(); markersRef.current.delete(id); }
    }

    // Geofence circle as a GeoJSON polygon layer.
    const src = map.getSource("geofence") as InstanceType<typeof import("maplibre-gl").GeoJSONSource> | undefined;
    const data: Feature<Polygon> | null = geofence
      ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circlePolygon(geofence.center, geofence.radiusM)] } }
      : null;
    if (src) {
      src.setData((data ?? { type: "FeatureCollection", features: [] }) as never);
    }

    // Camera: follow explicit center, else frame all markers.
    if (center) {
      map.easeTo({ center: [center.lng, center.lat], duration: 600 });
    } else if (markers.length > 0) {
      const b = new ml.LngLatBounds();
      markers.forEach((m) => b.extend([m.pos.lng, m.pos.lat]));
      map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 600 });
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !divRef.current || mapRef.current) return;
      libRef.current = ml;
      const { center } = propsRef.current;
      const map = new ml.Map({
        container: divRef.current,
        style: "https://openfreemap.org/styles/dark",
        center: center ? [center.lng, center.lat] : [-122.3321, 47.6062],
        zoom: 13,
        attributionControl: { compact: true },
      });
      map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
      map.on("load", () => {
        map.addSource("geofence", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "geofence-fill",
          type: "fill",
          source: "geofence",
          paint: { "fill-color": "#34d399", "fill-opacity": 0.07 },
        });
        map.addLayer({
          id: "geofence-line",
          type: "line",
          source: "geofence",
          paint: { "line-color": "#34d399", "line-width": 1.5 },
        });
        renderOverlays();
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.markers, props.geofence, props.center]);

  return <div ref={divRef} style={{ height: props.height ?? 280 }} className="w-full overflow-hidden rounded-2xl border border-white/10" />;
}
