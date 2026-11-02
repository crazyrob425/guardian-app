import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "../lib/geo";

export interface MapMarker {
  id: string;
  pos: LatLng;
  color: "#34d399" | "#f87171" | "#60a5fa" | "#fbbf24";
  label: string;
}

/** Dark-themed Leaflet map. Markers update live via the `markers` prop. */
export default function MapView(props: {
  center?: LatLng;
  markers: MapMarker[];
  geofence?: { center: LatLng; radiusM: number } | null;
  height?: number;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fenceRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: false, attributionControl: true }).setView(
      props.center ? [props.center.lat, props.center.lng] : [47.6062, -122.3321],
      14
    );
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    props.markers.forEach((m) => {
      const marker = L.circleMarker([m.pos.lat, m.pos.lng], {
        radius: 10, color: m.color, weight: 3, fillColor: m.color, fillOpacity: 0.5,
      }).bindTooltip(m.label, { direction: "top", offset: [0, -12] });
      marker.addTo(layer);
    });
    if (props.geofence) {
      if (fenceRef.current) fenceRef.current.remove();
      fenceRef.current = L.circle([props.geofence.center.lat, props.geofence.center.lng], {
        radius: props.geofence.radiusM, color: "#34d399", weight: 1.5, fillOpacity: 0.06,
      }).addTo(map);
    } else if (fenceRef.current) {
      fenceRef.current.remove();
      fenceRef.current = null;
    }
    if (props.markers.length > 0 && !props.center) {
      const bounds = L.latLngBounds(props.markers.map((m) => [m.pos.lat, m.pos.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.35));
    } else if (props.center) {
      map.setView([props.center.lat, props.center.lng], map.getZoom());
    }
  }, [props.markers, props.geofence, props.center]);

  return <div ref={divRef} style={{ height: props.height ?? 280 }} className="w-full overflow-hidden rounded-2xl border border-white/10" />;
}
