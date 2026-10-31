'use client';

import { faStar as faStarEmpty } from '@fortawesome/free-regular-svg-icons';
import {
  faCircleCheck,
  faPen,
  faRightToBracket,
  faSpinner,
  faStar,
  faTrashCan,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiFetch, useSession } from '@/lib/client-api';
import { formatDay, initials, type Review, type ReviewPage } from '@/lib/types';
import { Stars } from './Stars';

const RATING_HINT = ['', 'Rất tệ', 'Không hài lòng', 'Bình thường', 'Hài lòng', 'Tuyệt vời'];

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="star-picker" role="radiogroup" aria-label="Chọn số sao" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} sao – ${RATING_HINT[i]}`}
          className={shown >= i ? 'on' : undefined}
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i)}
        >
          <FontAwesomeIcon icon={shown >= i ? faStar : faStarEmpty} />
        </button>
      ))}
      <span className="star-hint">{RATING_HINT[shown]}</span>
    </div>
  );
}

function ReviewForm({ slug, mine, onSaved }: { slug: string; mine: Review | null; onSaved: () => void }) {
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!mine);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError('Vui lòng chọn số sao');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/products/${slug}/reviews`, { method: 'PUT', body: JSON.stringify({ rating, comment }) });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/products/${slug}/reviews/mine`, { method: 'DELETE' });
      setRating(0);
      setComment('');
      setEditing(true);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (mine && !editing) {
    return (
      <div className="review-mine">
        <div>
          <strong>Đánh giá của bạn</strong>
          <Stars value={mine.rating} />
          <p>{mine.comment}</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            <FontAwesomeIcon icon={faPen} /> Sửa
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={busy}>
            <FontAwesomeIcon icon={faTrashCan} /> Xóa
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="review-form" onSubmit={submit}>
      <strong>{mine ? 'Sửa đánh giá của bạn' : 'Viết đánh giá của bạn'}</strong>
      <StarPicker value={rating} onChange={setRating} />
      <label className="field">
        <span className="sr-only">Nội dung đánh giá</span>
        <textarea
          className="input"
          rows={4}
          maxLength={1000}
          minLength={10}
          required
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Chia sẻ trải nghiệm thực tế: chất lượng, độ bền, giao hàng… (tối thiểu 10 ký tự)"
        />
        <small className="muted counter">{comment.length}/1000</small>
      </label>
      {error && (
        <p className="alert" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </p>
      )}
      <div className="row">
        <button className="btn" disabled={busy}>
          {busy && <FontAwesomeIcon icon={faSpinner} spin />} {mine ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}
        </button>
        {mine && (
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
            Hủy
          </button>
        )}
      </div>
    </form>
  );
}

export function ReviewSection({ slug }: { slug: string }) {
  const { session, ready } = useSession();
  const [data, setData] = useState<ReviewPage | null>(null);
  const [mine, setMine] = useState<Review | null | undefined>(undefined);
  const [filter, setFilter] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), limit: '6' });
    if (filter) qs.set('rating', String(filter));
    apiFetch<ReviewPage>(`/products/${slug}/reviews?${qs}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [slug, page, filter]);

  const loadMine = useCallback(() => {
    if (!session) {
      setMine(null);
      return;
    }
    apiFetch<{ review: Review | null }>(`/products/${slug}/reviews/mine`)
      .then((r) => setMine(r.review))
      .catch(() => setMine(null));
  }, [slug, session]);

  useEffect(load, [load]);
  useEffect(() => {
    if (ready) loadMine();
  }, [ready, loadMine]);

  const summary = data?.summary;

  return (
    <section className="section reviews" id="reviews">
      <div className="section-head">
        <div>
          <h2>
            <FontAwesomeIcon icon={faStar} /> Đánh giá từ khách hàng
          </h2>
          <p>Mọi khách hàng đã đăng nhập đều có thể chia sẻ cảm nhận về sản phẩm</p>
        </div>
      </div>

      {error && <p className="alert">{error}</p>}

      <div className="reviews-layout">
        <aside className="panel review-summary">
          {summary ? (
            <>
              <div className="review-score">
                <strong>{summary.count ? summary.average.toFixed(1) : '–'}</strong>
                <div>
                  <Stars value={summary.average} size="lg" />
                  <span className="muted small">{summary.count} đánh giá</span>
                </div>
              </div>
              <ul className="dist">
                {([5, 4, 3, 2, 1] as const).map((star) => {
                  const n = summary.distribution[String(star) as '1'];
                  const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
                  return (
                    <li key={star}>
                      <button
                        type="button"
                        className={filter === star ? 'dist-row active' : 'dist-row'}
                        onClick={() => {
                          setFilter(filter === star ? null : star);
                          setPage(1);
                        }}
                        aria-pressed={filter === star}
                      >
                        <span className="dist-label">
                          {star} <FontAwesomeIcon icon={faStar} />
                        </span>
                        <span className="dist-bar">
                          <span style={{ width: `${pct}%` }} />
                        </span>
                        <span className="dist-count">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="skeleton">
              <FontAwesomeIcon icon={faSpinner} spin /> Đang tải…
            </div>
          )}

          {ready && !session && (
            <div className="review-login">
              <p>Đăng nhập để viết đánh giá cho sản phẩm này.</p>
              <Link className="btn btn-block" href={`/login?next=/products/${slug}%23reviews`}>
                <FontAwesomeIcon icon={faRightToBracket} /> Đăng nhập để đánh giá
              </Link>
            </div>
          )}
          {session && mine !== undefined && (
            <ReviewForm
              key={mine?.id ?? 'new'}
              slug={slug}
              mine={mine}
              onSaved={() => {
                load();
                loadMine();
              }}
            />
          )}
        </aside>

        <div className="review-list">
          {filter && (
            <p className="muted">
              Đang lọc đánh giá {filter} sao ·{' '}
              <button type="button" className="link-btn" onClick={() => setFilter(null)}>
                Bỏ lọc
              </button>
            </p>
          )}
          {data && data.items.length === 0 && (
            <div className="empty compact">
              <h3>Chưa có đánh giá {filter ? `${filter} sao` : ''}</h3>
              <p>Hãy là người đầu tiên chia sẻ cảm nhận về sản phẩm này.</p>
            </div>
          )}
          {data?.items.map((r) => (
            <article key={r.id} className="review-item">
              <header>
                {r.user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="avatar avatar-img" src={r.user.avatarUrl} alt="" width={40} height={40} referrerPolicy="no-referrer" />
                ) : (
                  <span className="avatar" aria-hidden>
                    {initials(r.user.fullName)}
                  </span>
                )}
                <div>
                  <strong>{r.user.fullName}</strong>
                  <span className="muted small">
                    {formatDay(r.createdAt)}
                    {r.updatedAt !== r.createdAt && ' · đã chỉnh sửa'}
                  </span>
                </div>
                {r.verifiedPurchase && (
                  <span className="badge badge-ok">
                    <FontAwesomeIcon icon={faCircleCheck} /> Đã mua hàng
                  </span>
                )}
              </header>
              <Stars value={r.rating} />
              <p>{r.comment}</p>
            </article>
          ))}
          {data && data.totalPages > 1 && (
            <nav className="pagination">
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Trước
              </button>
              <span className="muted small">
                Trang {data.page}/{data.totalPages}
              </span>
              <button className="btn btn-ghost btn-sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Sau
              </button>
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}
