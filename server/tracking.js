import { DatabaseSync } from 'node:sqlite';

export function determineTrackingSteps(order, clock = () => new Date().toISOString(), market = 'CL') {
  const at = clock();
  const createdAt = order.created_at || at;
  const confirmedAt = order.confirmed_at || (order.state === 'CUSTOMER_CONFIRMED' || ['CONFIRMED', 'PROCESSING', 'SHIPPING', 'DELIVERED', 'FINISH'].includes(order.state || order.status) ? createdAt : null);
  const isDelivered = order.status === 'DELIVERED' || order.sub_status === 'DELIVERED' || (order.status === 'FINISH' && order.sub_status === 'PAID') || order.stage === 'delivered';
  const isRejected = ['CANCELLED', 'REFUSED', 'REJECTED'].includes(order.sub_status) || order.state === 'CUSTOMER_CANCELLED' || order.status === 'CANCELLED';
  const isIssue = order.status === 'ERROR' || ['DELIVERY_ATTEMPTED', 'DELIVERY_EXCEPTION', 'LOST_DAMAGED', 'REFUSED_LOST_DAMAGED', 'REVIEW', 'TECHNICAL_ERROR'].includes(order.sub_status) || order.stage === 'issue';
  const isOutForDelivery = order.sub_status === 'OUT_FOR_DELIVERY' || order.stage === 'delivery';
  const isDispatched = order.status === 'SHIPPING' || isOutForDelivery || isDelivered;
  const isPacking = ['PROCESSING', 'SHIPPING', 'DELIVERED', 'FINISH'].includes(order.status) || isDispatched;
  const isPreparing = order.state === 'SENT_TO_DROPEA' || ['CONFIRMED', 'PROCESSING', 'SHIPPING', 'DELIVERED', 'FINISH'].includes(order.status) || isPacking;
  const isConfirmed = Boolean(confirmedAt) || isPreparing;

  // Market timezones
  const marketTimezones = {
    CL: 'America/Santiago',
    ES: 'Europe/Madrid',
    IT: 'Europe/Rome',
    PT: 'Europe/Lisbon',
    MX: 'America/Mexico_City',
    CO: 'America/Bogota',
    PE: 'America/Lima'
  };
  const resolvedMarket = (order.market || order.country || market || 'CL').toUpperCase();
  const timeZone = marketTimezones[resolvedMarket] || 'America/Santiago';

  // Timestamps
  const tCreated = new Date(createdAt);
  const tConfirmed = confirmedAt ? new Date(confirmedAt) : new Date(tCreated.getTime() + 5 * 60000);
  const tPrep = new Date(tConfirmed.getTime() + 45 * 60000);
  const tPack = new Date(tPrep.getTime() + 60 * 60000);
  const tDispatch = new Date(tPack.getTime() + 3 * 3600000);
  const tRoute = new Date(tDispatch.getTime() + 18 * 3600000);
  const tDeliver = order.delivered_at ? new Date(order.delivered_at) : new Date(tRoute.getTime() + 9 * 3600000);

  const formatDate = (d, isEst = false) => {
    const formatted = d.toLocaleDateString('es-CL', {
      timeZone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return isEst ? `${formatted} (estimado)` : formatted;
  };

  const steps = [
    {
      key: 'received',
      label: 'Pedido recibido',
      icon: 'cart',
      state: 'completed',
      date: formatDate(tCreated),
      time: tCreated.toISOString()
    },
    {
      key: 'confirmed',
      label: 'Pedido confirmado',
      icon: 'payment',
      state: isConfirmed ? 'completed' : 'active',
      date: isConfirmed ? formatDate(tConfirmed) : '(esperando confirmación)',
      time: isConfirmed ? tConfirmed.toISOString() : null
    },
    {
      key: 'preparation',
      label: 'Preparación',
      icon: 'gear',
      state: isPreparing ? 'completed' : isConfirmed ? 'active' : 'upcoming',
      date: isPreparing ? formatDate(tPrep) : formatDate(tPrep, true),
      time: isPreparing ? tPrep.toISOString() : null
    },
    {
      key: 'packing',
      label: 'Empaque',
      icon: 'box',
      state: isPacking ? 'completed' : isPreparing ? 'active' : 'upcoming',
      date: isPacking ? formatDate(tPack) : formatDate(tPack, true),
      time: isPacking ? tPack.toISOString() : null
    },
    {
      key: 'dispatched',
      label: 'Despachado',
      icon: 'truck',
      state: isDispatched ? 'completed' : isPacking ? 'active' : 'upcoming',
      date: isDispatched ? formatDate(tDispatch) : formatDate(tDispatch, true),
      time: isDispatched ? tDispatch.toISOString() : null
    },
    {
      key: 'in_route',
      label: 'En ruta',
      icon: 'pin',
      state: isOutForDelivery ? 'active' : (isDelivered || isRejected) ? 'completed' : isDispatched ? 'active' : 'upcoming',
      date: (isOutForDelivery || isDelivered) ? formatDate(tRoute) : formatDate(tRoute, true),
      time: (isOutForDelivery || isDelivered) ? tRoute.toISOString() : null
    },
    {
      key: isRejected ? 'rejected' : isIssue ? 'issue' : 'delivered',
      label: isRejected ? 'Rechazado' : isIssue ? 'Reprogramado' : 'Entregado',
      icon: isRejected ? 'x' : isIssue ? 'warning' : 'check',
      state: isDelivered ? 'completed' : isRejected ? 'failed' : isIssue ? 'warning' : 'upcoming',
      date: isDelivered ? formatDate(tDeliver) : formatDate(tDeliver, true),
      time: isDelivered ? tDeliver.toISOString() : null
    }
  ];

  // Overall status badge & alert banner
  let pill = { label: 'Recibido', color: 'slate', icon: 'cart' };
  let banner = {
    title: 'Pedido recibido',
    description: 'Hemos recibido tu pedido y estamos esperando confirmación para procesarlo.',
    status: 'received'
  };

  if (isDelivered) {
    pill = { label: 'Entregado', color: 'emerald', icon: 'check' };
    banner = {
      title: '¡Tu pedido ha sido entregado!',
      description: 'El paquete fue recibido exitosamente en la dirección indicada.',
      status: 'delivered'
    };
  } else if (isRejected) {
    pill = { label: 'Rechazado', color: 'rose', icon: 'x' };
    banner = {
      title: 'Pedido rechazado o anulado',
      description: 'La orden fue cancelada o rechazada al momento de la entrega.',
      status: 'rejected'
    };
  } else if (isIssue) {
    pill = { label: 'Reprogramado / Incidencia', color: 'amber', icon: 'warning' };
    banner = {
      title: 'Entrega en reprogramación',
      description: 'El transportista tuvo un intento de entrega y coordinará una nueva visita.',
      status: 'issue'
    };
  } else if (isOutForDelivery) {
    pill = { label: 'En reparto', color: 'amber', icon: 'pin' };
    banner = {
      title: 'Tu pedido está en reparto hoy',
      description: 'El repartidor se encuentra en ruta hacia tu dirección de entrega.',
      status: 'route'
    };
  } else if (isDispatched) {
    pill = { label: 'En tránsito', color: 'indigo', icon: 'truck' };
    banner = {
      title: 'Tu pedido va en camino',
      description: 'Hemos despachado tu pedido y ya está en proceso de entrega.',
      status: 'transit'
    };
  } else if (isPacking || isPreparing) {
    pill = { label: 'En preparación', color: 'blue', icon: 'gear' };
    banner = {
      title: 'Tu pedido se está preparando',
      description: 'Nuestro almacén está alistando y empaquetando tus productos con cuidado.',
      status: 'prep'
    };
  } else if (isConfirmed) {
    pill = { label: 'Confirmado', color: 'cyan', icon: 'payment' };
    banner = {
      title: 'Pedido confirmado con éxito',
      description: 'Tus datos fueron validados y el pedido fue enviado al centro de logística.',
      status: 'confirmed'
    };
  }

  return { steps, pill, banner };
}

export function computeCustomerReliability(db, phone, currentOrderId = null) {
  if (!phone) {
    return {
      total: 0,
      delivered: 0,
      rejected: 0,
      deliveryRate: null,
      rejectionRate: null,
      level: 'NEW',
      label: 'Cliente Nuevo',
      color: '#3b82f6',
      badgeClass: 'badge-new'
    };
  }

  // Look up in wa_orders and landing_orders
  const waRows = db.prepare('SELECT state, sub_state, stage FROM wa_orders WHERE phone=?').all(phone);
  const landingRows = db.prepare('SELECT state FROM landing_orders WHERE phone=?').all(phone);

  let delivered = waRows.filter(r => r.stage === 'delivered' || r.state === 'DELIVERED' || r.sub_state === 'DELIVERED' || r.sub_state === 'PAID').length;
  let rejected = waRows.filter(r => r.stage === 'cancelled' || ['CANCELLED', 'REFUSED', 'REJECTED', 'LOST_DAMAGED'].includes(r.sub_state) || r.state === 'CUSTOMER_CANCELLED').length;
  rejected += landingRows.filter(r => r.state === 'CUSTOMER_CANCELLED').length;

  const total = Math.max(waRows.length, landingRows.length, delivered + rejected);
  const completed = delivered + rejected;

  // Also check Dropea external reliability if stored
  const ext = db.prepare('SELECT payload FROM wa_orders WHERE phone=? AND payload LIKE ? LIMIT 1').get(phone, '%customer_reliability%');
  let dropeaRate = null;
  let dropeaTotal = null;
  if (ext) {
    try {
      const p = JSON.parse(ext.payload);
      if (p.customer_reliability) {
        dropeaRate = p.customer_reliability.delivery_rate;
        dropeaTotal = p.customer_reliability.total_computable;
      }
    } catch {}
  }

  let rate = completed > 0 ? (delivered / completed) * 100 : dropeaRate !== null ? dropeaRate * 100 : null;
  let rejRate = completed > 0 ? (rejected / completed) * 100 : dropeaRate !== null ? (1 - dropeaRate) * 100 : null;

  let level = 'NEW';
  let label = 'Cliente Nuevo';
  let color = '#3b82f6';
  let badgeClass = 'badge-new';

  if (rate !== null && (completed >= 1 || (dropeaTotal && dropeaTotal >= 1))) {
    if (rate >= 80) {
      level = 'EXCELLENT';
      label = `Cliente Confiable (${rate.toFixed(0)}% entrega)`;
      color = '#10b981';
      badgeClass = 'badge-excellent';
    } else if (rate >= 50) {
      level = 'REGULAR';
      label = `Historial Regular (${rate.toFixed(0)}% entrega)`;
      color = '#f59e0b';
      badgeClass = 'badge-regular';
    } else {
      level = 'RISK';
      label = `Riesgo de Rechazo (${rate.toFixed(0)}% entrega)`;
      color = '#ef4444';
      badgeClass = 'badge-risk';
    }
  }

  return {
    total,
    delivered,
    rejected,
    completed,
    deliveryRate: rate !== null ? Math.round(rate) : null,
    rejectionRate: rejRate !== null ? Math.round(rejRate) : null,
    level,
    label,
    color,
    badgeClass,
    dropeaHistory: dropeaTotal ? { deliveryRate: dropeaRate, total: dropeaTotal } : null
  };
}

export function resolveCarrierInfo(order, orderCode = '') {
  const rawCarrier = String(
    order?.shipping_company ||
    order?.carrier ||
    order?.carrier_name ||
    order?.courier ||
    order?.transportista ||
    order?.shipping_method ||
    order?.shipping_service ||
    order?.shipping_lines?.[0]?.carrier ||
    order?.shipping_lines?.[0]?.title ||
    ''
  ).trim();

  const rawTracking = String(
    order?.tracking_number ||
    order?.tracking_code ||
    order?.tracking ||
    order?.shipping_lines?.[0]?.tracking_number ||
    order?.waybill ||
    order?.guia ||
    ''
  ).trim();

  const rawUrl = String(
    order?.tracking_url ||
    order?.shipping_lines?.[0]?.tracking_url ||
    ''
  ).trim();

  const textToInspect = `${rawCarrier} ${rawTracking} ${rawUrl}`.toLowerCase();

  // 1. Starken detection
  if (textToInspect.includes('starken') || textToInspect.includes('sk-') || /^st-/i.test(rawTracking)) {
    const num = rawTracking || `ST-${orderCode}`;
    return {
      shipping_company: 'Starken®',
      carrier_key: 'starken',
      tracking_number: num,
      tracking_url: rawUrl || `https://www.starken.cl/seguimiento?orden=${encodeURIComponent(num)}`
    };
  }

  // 2. Chilexpress detection
  if (textToInspect.includes('chilexpress') || /^cx-/i.test(rawTracking)) {
    const num = rawTracking || `CX-${orderCode}`;
    return {
      shipping_company: 'Chilexpress®',
      carrier_key: 'chilexpress',
      tracking_number: num,
      tracking_url: rawUrl || `https://www.chilexpress.cl/seguimiento?guia=${encodeURIComponent(num)}`
    };
  }

  // 3. Blue Express detection
  if (textToInspect.includes('blue') || textToInspect.includes('bx') || /^bx-/i.test(rawTracking) || /^(10|11|12)\d{8,10}$/.test(rawTracking)) {
    const num = rawTracking || `BX-${orderCode}`;
    return {
      shipping_company: 'Blue Express®',
      carrier_key: 'blue_express',
      tracking_number: num,
      tracking_url: rawUrl || `https://www.blue.cl/seguimiento/?tracking=${encodeURIComponent(num)}`
    };
  }

  // 4. Explicit name provided by platform
  if (rawCarrier) {
    const num = rawTracking || orderCode;
    return {
      shipping_company: rawCarrier,
      carrier_key: 'other',
      tracking_number: num,
      tracking_url: rawUrl || null
    };
  }

  // 5. Default fallback
  const num = rawTracking || `BX-${orderCode}`;
  return {
    shipping_company: 'Blue Express®',
    carrier_key: 'blue_express',
    tracking_number: num,
    tracking_url: rawUrl || `https://www.blue.cl/seguimiento/?tracking=BX-${orderCode}`
  };
}

export function createTrackingService({ db, clock = () => new Date().toISOString() }) {
  function getOrderTracking(identifier) {
    if (!identifier) return null;
    const cleanId = String(identifier).trim().replace(/^#/, '');

    // Search in landing_orders first
    let lo = db.prepare(
      'SELECT * FROM landing_orders WHERE confirmation_code=? OR id=? OR id LIKE ? OR phone=? ORDER BY created_at DESC LIMIT 1'
    ).get(cleanId, cleanId, `%${cleanId}%`, cleanId);

    // Search in wa_orders
    let wo = db.prepare(
      'SELECT * FROM wa_orders WHERE remote_id=? OR local_id=? OR phone=? OR id=? ORDER BY created_at DESC LIMIT 1'
    ).get(cleanId, cleanId, cleanId, cleanId);

    // Search in resources table (Dropea remote orders)
    let ro = null;
    if (!wo && /^\d+$/.test(cleanId)) {
      try {
        const row = db.prepare("SELECT payload FROM resources WHERE kind='orders' AND id=? LIMIT 1").get(cleanId);
        if (row) {
          ro = JSON.parse(row.payload);
        }
      } catch {}
    }

    if (!lo && !wo && !ro) return null;

    // Merge normalized view
    const orderCode = lo?.confirmation_code || wo?.remote_id || ro?.id || lo?.id?.slice(0, 8)?.toUpperCase() || cleanId;
    const productName = lo?.product_name || wo?.product || ro?.line_items?.[0]?.product_name || 'Producto';
    const quantity = lo?.quantity || wo?.quantity || ro?.line_items?.reduce((s, l) => s + l.quantity, 0) || 1;
    const totalAmount = lo ? (lo.unit_price * lo.quantity) : wo?.amount || ro?.total_amount || 19990;
    const currency = lo?.currency || wo?.currency || ro?.currency || 'CLP';

    let customer = {
      name: wo?.name || 'Cliente',
      phone: lo?.phone || wo?.phone || ro?.shipping_address?.phone_number || '',
      address: 'Dirección coordinada',
      city: 'Santiago',
      state: 'Región Metropolitana',
      country: 'CL'
    };

    if (lo?.customer) {
      try {
        const c = JSON.parse(lo.customer);
        customer.name = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || customer.name;
        customer.address = c.address_line_1 || customer.address;
        customer.city = c.city || customer.city;
        customer.state = c.state || customer.state;
      } catch {}
    } else if (ro?.shipping_address) {
      const a = ro.shipping_address;
      customer.name = a.full_name || [a.first_name, a.last_name].filter(Boolean).join(' ') || customer.name;
      customer.address = a.address_line_1 || customer.address;
      customer.city = a.city || customer.city;
      customer.state = a.state || customer.state;
    }

    const courier = resolveCarrierInfo({ ...ro, ...wo, ...lo }, orderCode);

    const orderMeta = {
      id: lo?.id || wo?.id || ro?.id,
      orderCode,
      productName,
      quantity,
      totalAmount,
      currency,
      market: lo?.market || ro?.market || 'CL',
      created_at: lo?.created_at || wo?.created_at || ro?.created_at,
      confirmed_at: lo?.confirmed_at || wo?.confirmed_at,
      delivered_at: wo?.delivered_at || ro?.delivered_at,
      state: lo?.state || wo?.state || ro?.status,
      status: ro?.status || wo?.state || lo?.state,
      sub_status: ro?.sub_status || wo?.sub_state,
      stage: wo?.stage || (lo?.state === 'CUSTOMER_CONFIRMED' ? 'confirmed' : 'received'),
      shipping_company: courier.shipping_company,
      carrier_key: courier.carrier_key,
      tracking_number: courier.tracking_number,
      tracking_url: courier.tracking_url
    };

    const tracking = determineTrackingSteps(orderMeta, clock);
    const reliability = computeCustomerReliability(db, customer.phone, orderMeta.id);

    return {
      order: orderMeta,
      customer,
      tracking,
      reliability
    };
  }

  function listTrackableOrders(limit = 50) {
    // Return recent orders from both landing_orders and wa_orders
    const landingList = db.prepare(
      'SELECT id, confirmation_code, product_name, phone, state, created_at, unit_price, quantity, currency, customer FROM landing_orders ORDER BY created_at DESC LIMIT ?'
    ).all(limit);

    return landingList.map(lo => {
      let cName = 'Cliente';
      let cCity = 'Santiago';
      try {
        const c = JSON.parse(lo.customer);
        cName = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || cName;
        cCity = c.city || cCity;
      } catch {}

      const stepsData = determineTrackingSteps({ ...lo, status: lo.state }, clock);
      const rel = computeCustomerReliability(db, lo.phone, lo.id);

      return {
        id: lo.id,
        orderCode: lo.confirmation_code || lo.id.slice(0, 8).toUpperCase(),
        productName: lo.product_name,
        quantity: lo.quantity,
        totalAmount: lo.unit_price * lo.quantity,
        currency: lo.currency || 'CLP',
        customerName: cName,
        customerCity: cCity,
        phone: lo.phone,
        state: lo.state,
        createdAt: lo.created_at,
        pill: stepsData.pill,
        reliability: rel
      };
    });
  }

  return {
    getOrderTracking,
    listTrackableOrders,
    determineTrackingSteps,
    computeCustomerReliability,
    resolveCarrierInfo
  };
}
