'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useEffect, useRef } from 'react';

/** Giữa Việt Nam – khung nhìn mặc định khi chưa có vị trí */
const VN_CENTER: [number, number] = [16.0, 106.5];

/**
 * Bản đồ chọn vị trí giao hàng: ghim kéo thả được, bấm vào bản đồ để dời ghim.
 * Nền bản đồ OpenStreetMap qua máy chủ cộng đồng OSM France (tên địa danh tiếng Việt), lỗi nhiều thì tự chuyển sang
 * OSM Đức. Không cần API key; tile.openstreetmap.org bị chặn ở một số mạng Việt Nam nên không dùng trực tiếp.
 * Leaflet chỉ chạy trên trình duyệt → import động trong useEffect.
 */
export function AddressMap({
  position,
  onPick,
}: {
  position: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    let disposed = false;
    void import('leaflet').then((L) => {
      if (disposed || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(position ? [position.lat, position.lng] : VN_CENTER, position ? 17 : 5);
      const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
      const layer = L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc', attribution: `${attribution} · OSM France` }).addTo(m);
      let failures = 0;
      layer.on('tileerror', () => {
        if (++failures === 3) layer.setUrl('https://tile.openstreetmap.de/{z}/{x}/{y}.png');
      });
      // Ghim vẽ bằng CSS (không phụ thuộc ảnh icon mặc định của Leaflet)
      const icon = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 28] });
      const mk = L.marker(position ? [position.lat, position.lng] : VN_CENTER, { draggable: true, icon, opacity: position ? 1 : 0 }).addTo(m);
      mk.on('dragend', () => {
        const p = mk.getLatLng();
        pick.current(p.lat, p.lng);
      });
      m.on('click', (e) => {
        mk.setLatLng(e.latlng).setOpacity(1);
        pick.current(e.latlng.lat, e.latlng.lng);
      });
      map.current = m;
      marker.current = mk;
      // Dialog vừa mở: kích thước khung có thể chưa ổn định
      setTimeout(() => m.invalidateSize(), 150);
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // Khởi tạo 1 lần; vị trí mới được đồng bộ ở effect dưới
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!position || !map.current || !marker.current) return;
    marker.current.setLatLng([position.lat, position.lng]).setOpacity(1);
    map.current.setView([position.lat, position.lng], Math.max(map.current.getZoom(), 17));
  }, [position]);

  return <div ref={el} className="address-map" role="application" aria-label="Bản đồ chọn vị trí giao hàng" />;
}
