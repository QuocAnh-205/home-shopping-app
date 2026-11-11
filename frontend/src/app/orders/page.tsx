"use client";

import {
  faBoxOpen,
  faChevronRight,
  faReceipt,
  faSpinner,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { RequireAuth } from "@/components/RequireAuth";
import { STATUS_ICON, StatusBadge } from "@/components/StatusBadge";
import { apiFetch, useSession } from "@/lib/client-api";
import { formatDate, formatPrice, shortId, type Order } from "@/lib/types";

/** Tab "Đơn mua" kiểu Shopee (khớp ORDER_TABS ở backend) */
const TABS = [
  { key: "", label: "Tất cả" },
  { key: "awaiting_payment", label: "Chờ thanh toán" },
  { key: "to_ship", label: "Vận chuyển" },
  { key: "shipping", label: "Chờ giao hàng" },
  { key: "completed", label: "Hoàn thành" },
  { key: "cancelled", label: "Đã hủy" },
  { key: "return", label: "Trả hàng/Hoàn tiền" },
] as const;

function OrderList() {
  const { session } = useSession();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("");

  useEffect(() => {
    if (!session) return;
    setOrders(null);
    apiFetch<Order[]>(tab ? `/orders?tab=${tab}` : "/orders")
      .then(setOrders)
      .catch((err: Error) => setError(err.message));
  }, [session, tab]);

  const tabs = (
    <div className="order-tabs" role="tablist" aria-label="Lọc đơn hàng">
      {TABS.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={tab === t.key}
          className={tab === t.key ? "active" : undefined}
          onClick={() => setTab(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  if (error) {
    return (
      <p className="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
      </p>
    );
  }
  if (!orders) {
    return (
      <>
        {tabs}
        <div className="skeleton">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tải đơn hàng…
        </div>
      </>
    );
  }
  if (orders.length === 0) {
    return (
      <>
        {tabs}
        <EmptyState
          icon={faBoxOpen}
          title={
            tab ? "Chưa có đơn hàng nào ở mục này" : "Bạn chưa có đơn hàng nào"
          }
        >
          <p>Đơn hàng sẽ xuất hiện ở đây sau khi bạn đặt mua.</p>
          <Link className="btn" href="/#products">
            Mua sắm ngay
          </Link>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {tabs}
      <div className="order-cards">
        {orders.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`} className="order-card">
            <span className="ico" aria-hidden>
              <FontAwesomeIcon icon={STATUS_ICON[o.status]} />
            </span>
            <span className="meta">
              <strong>
                #{shortId(o.id)} ·{" "}
                <span className="price">{formatPrice(o.totalAmount)}</span>
              </strong>
              <span>
                {formatDate(o.createdAt)} ·{" "}
                {o.items
                  .map((i) => `${i.productName} ×${i.quantity}`)
                  .join(", ")}
              </span>
            </span>
            <StatusBadge status={o.status} transferClaimed={Boolean(o.transferClaimedAt)} />
            <FontAwesomeIcon icon={faChevronRight} className="muted" />
          </Link>
        ))}
      </div>
    </>
  );
}

export default function OrdersPage() {
  return (
    <section>
      <h1 className="page-title">
        <FontAwesomeIcon icon={faReceipt} /> Đơn hàng của tôi
      </h1>
      <RequireAuth>
        <OrderList />
      </RequireAuth>
    </section>
  );
}
