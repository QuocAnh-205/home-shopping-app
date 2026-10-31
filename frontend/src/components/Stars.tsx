import { faStar as faStarEmpty } from '@fortawesome/free-regular-svg-icons';
import { faStar, faStarHalfStroke } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/** Hiển thị điểm 0–5 sao (hỗ trợ nửa sao) */
export function Stars({ value, size = 'sm', label }: { value: number; size?: 'sm' | 'lg'; label?: string }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={`stars stars-${size}`} role="img" aria-label={label ?? `${value.toFixed(1)} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <FontAwesomeIcon key={i} icon={rounded >= i ? faStar : rounded >= i - 0.5 ? faStarHalfStroke : faStarEmpty} />
      ))}
    </span>
  );
}
