'use client';

import { faArrowRotateRight, faCheck, faMagnifyingGlassMinus, faMagnifyingGlassPlus, faRotateLeft, faSpinner, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';

/** Ảnh đầu ra: vuông 512×512, JPEG – mọi định dạng trình duyệt đọc được (WebP/AVIF/HEIC đổi đuôi .jpg…) đều thành JPEG chuẩn */
const OUTPUT = 512;
const MAX_BYTES = 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface Props {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void | Promise<void>;
}

interface View {
  zoom: number;
  /** Độ lệch tâm ảnh so với tâm khung, tính theo pixel của khung xem */
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

const INITIAL: View = { zoom: 1, x: 0, y: 0, rotation: 0 };

/**
 * Khung cắt ảnh đại diện: kéo để di chuyển, lăn chuột / thanh trượt / chụm 2 ngón để phóng to, xoay 90°.
 * Cắt và nén ngay trên trình duyệt (canvas) → không phụ thuộc thư viện ngoài, không gửi ảnh gốc nặng lên server.
 */
export function AvatarCropper({ file, onCancel, onDone }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(INITIAL);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(280);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // Esc để đóng, khóa cuộn trang nền khi đang mở
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [busy, onCancel]);

  // Đọc ảnh bằng chính trình duyệt (tự xử lý xoay EXIF của ảnh chụp điện thoại)
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setError('Trình duyệt không đọc được ảnh này (có thể là ảnh HEIC hoặc file hỏng). Hãy chọn ảnh JPG / PNG / WEBP khác.');
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  const rotated = view.rotation % 180 !== 0;
  const natW = img ? (rotated ? img.naturalHeight : img.naturalWidth) : 1;
  const natH = img ? (rotated ? img.naturalWidth : img.naturalHeight) : 1;
  /** Tỉ lệ để cạnh ngắn của ảnh vừa khít khung ở zoom = 1 (giống "cover") */
  const baseScale = box / Math.min(natW, natH);
  const scale = baseScale * view.zoom;

  /** Không cho kéo ảnh lộ khoảng trống trong khung tròn */
  const clamp = useCallback(
    (v: View): View => {
      const s = baseScale * v.zoom;
      const maxX = Math.max(0, (natW * s - box) / 2);
      const maxY = Math.max(0, (natH * s - box) / 2);
      return { ...v, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
    },
    [baseScale, natW, natH, box],
  );

  const setZoom = (zoom: number) => setView((v) => clamp({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }));

  function onPointerDown(e: ReactPointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setZoom((pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist);
      return;
    }
    setView((v) => clamp({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
  }

  function onPointerUp(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function onWheel(e: WheelEvent) {
    setZoom(view.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }

  // Bàn phím: mũi tên di chuyển, +/- phóng to (truy cập không cần chuột)
  function onKeyDown(e: React.KeyboardEvent) {
    const step = 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      setView((v) => clamp({ ...v, x: v.x + moves[e.key][0], y: v.y + moves[e.key][1] }));
    } else if (e.key === '+' || e.key === '=') setZoom(view.zoom + 0.1);
    else if (e.key === '-') setZoom(view.zoom - 0.1);
  }

  async function save() {
    if (!img) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Trình duyệt không hỗ trợ cắt ảnh');
      const k = OUTPUT / box;
      ctx.fillStyle = '#ffffff'; // ảnh PNG trong suốt → nền trắng khi chuyển sang JPEG
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(OUTPUT / 2 + view.x * k, OUTPUT / 2 + view.y * k);
      ctx.rotate((view.rotation * Math.PI) / 180);
      const s = scale * k;
      ctx.drawImage(img, (-img.naturalWidth * s) / 2, (-img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      let blob: Blob | null = null;
      for (const q of [0.9, 0.8, 0.7, 0.6]) {
        blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
        if (blob && blob.size <= MAX_BYTES) break;
      }
      if (!blob) throw new Error('Không tạo được ảnh, vui lòng thử ảnh khác');
      await onDone(blob);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cropper-title" onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal cropper">
        <header className="cropper-head">
          <h2 id="cropper-title">Chỉnh sửa ảnh đại diện</h2>
          <button type="button" className="cropper-close" onClick={onCancel} disabled={busy} aria-label="Đóng">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>

        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : !img ? (
          <div className="cropper-loading">
            <FontAwesomeIcon icon={faSpinner} spin /> Đang mở ảnh…
          </div>
        ) : (
          <>
            <div
              ref={boxRef}
              className="cropper-stage"
              tabIndex={0}
              aria-label="Vùng cắt ảnh: kéo để di chuyển, lăn chuột hoặc chụm ngón tay để phóng to"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
              onKeyDown={onKeyDown}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.src}
                alt=""
                draggable={false}
                style={{
                  width: img.naturalWidth * scale,
                  height: img.naturalHeight * scale,
                  transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) rotate(${view.rotation}deg)`,
                }}
              />
              <div className="cropper-mask" aria-hidden />
            </div>
            <p className="muted small cropper-hint">Kéo để chọn vùng hiển thị · lăn chuột hoặc chụm 2 ngón để phóng to</p>

            <div className="cropper-tools">
              <button type="button" className="btn-round" onClick={() => setZoom(view.zoom - 0.2)} aria-label="Thu nhỏ">
                <FontAwesomeIcon icon={faMagnifyingGlassMinus} />
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={view.zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label="Mức phóng to"
              />
              <button type="button" className="btn-round" onClick={() => setZoom(view.zoom + 0.2)} aria-label="Phóng to">
                <FontAwesomeIcon icon={faMagnifyingGlassPlus} />
              </button>
              <button
                type="button"
                className="btn-round"
                onClick={() => setView((v) => clamp({ ...v, rotation: (((v.rotation + 90) % 360) as View['rotation']), x: 0, y: 0 }))}
                aria-label="Xoay 90 độ"
              >
                <FontAwesomeIcon icon={faArrowRotateRight} />
              </button>
              <button type="button" className="btn-round" onClick={() => setView(INITIAL)} aria-label="Đặt lại">
                <FontAwesomeIcon icon={faRotateLeft} />
              </button>
            </div>
          </>
        )}

        <footer className="cropper-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Hủy
          </button>
          <button type="button" className="btn" onClick={save} disabled={!img || busy || Boolean(error)}>
            <FontAwesomeIcon icon={busy ? faSpinner : faCheck} spin={busy} /> Lưu ảnh
          </button>
        </footer>
      </div>
    </div>
  );
}
