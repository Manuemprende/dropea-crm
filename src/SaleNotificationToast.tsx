import React, { useEffect, useState } from 'react';

export interface SaleEvent {
  id: string;
  orderCode: string;
  productName: string;
  quantity: number;
  totalAmount: number;
  currency: string;
  createdAt: number; // timestamp in ms
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 30) return 'Ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'Hace instantes';
  if (minutes === 1) return 'Hace 1 min';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `Hace ${hours} h`;
}

interface SaleToastItemProps {
  sale: SaleEvent;
  onDismiss: (id: string) => void;
}

function SaleToastItem({ sale, onDismiss }: SaleToastItemProps) {
  const [timeAgo, setTimeAgo] = useState(() => formatTimeAgo(sale.createdAt));
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(sale.createdAt));
    }, 10000);

    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(sale.id), 350);
    }, 9000);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [sale, onDismiss]);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => onDismiss(sale.id), 350);
  };

  const formattedMoney = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: sale.currency || 'CLP',
    maximumFractionDigits: sale.currency === 'CLP' ? 0 : 2
  }).format(sale.totalAmount);

  const itemsText = sale.quantity === 1 ? '1 producto' : `${sale.quantity} productos`;

  return (
    <article
      className={`sale-card ${exiting ? 'sale-card-exit' : 'sale-card-enter'}`}
      onClick={handleClose}
      role="status"
      aria-label={`Nueva venta: ${sale.productName}, ${formattedMoney}`}
      title="Click para cerrar"
    >
      {/* Specular flare effect */}
      <div className="sale-card-flare" />

      {/* Left: 100% Transparent Metallic D Logo (NO dark box, NO square container) */}
      <div className="sale-card-logo">
        <img
          src="/notification-logo-d.png"
          alt="Dropea"
          className="sale-d-img"
          width={44}
          height={44}
          loading="eager"
          decoding="sync"
        />
      </div>

      {/* Middle: Structured 3-row clean typography */}
      <div className="sale-card-body">
        <div className="sale-card-row1">
          <span className="sale-card-title">Nueva venta</span>
          <span className="sale-card-amount">{formattedMoney}</span>
          <span className="sale-card-time">{timeAgo}</span>
        </div>
        <div className="sale-card-row2">
          Pedido #{sale.orderCode} • {itemsText}
        </div>
        <div className="sale-card-row3" title={sale.productName}>
          {sale.productName}
        </div>
      </div>

      {/* Right: Shopping bag with green checkmark */}
      <div className="sale-card-bag">
        <img
          src="/notification-bag.png"
          alt=""
          className="sale-bag-img"
          width={36}
          height={36}
          loading="eager"
          decoding="sync"
        />
      </div>
    </article>
  );
}

interface SaleNotificationToastProps {
  sale?: SaleEvent | null;
  sales?: SaleEvent[];
  onDismiss: (id?: string) => void;
}

export default function SaleNotificationToast({ sale, sales, onDismiss }: SaleNotificationToastProps) {
  // Support either single sale prop or array of sales
  const items: SaleEvent[] = sales ?? (sale ? [sale] : []);

  if (!items.length) return null;

  return (
    <aside className="sale-toast-container" aria-label="Notificaciones de ventas">
      {items.map((s) => (
        <SaleToastItem key={s.id} sale={s} onDismiss={(id) => onDismiss(id)} />
      ))}
    </aside>
  );
}
