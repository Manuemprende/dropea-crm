import { randomUUID } from 'node:crypto';

export function normalizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,!¡?¿:;()_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatMoney(amount, currency = 'CLP') {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: currency === 'CLP' ? 0 : 2
  }).format(amount);
}

export function classifyIntent(text) {
  const norm = normalizeText(text);
  if (!norm) return 'UNKNOWN';

  // Human agent requested
  if (/\b(human[oa]|asesor|asesora|ejecutiv[oa]|operador|operadora|persona real|alguien real|hablar con (alguien|una persona)|atencion al cliente)\b/i.test(norm)) {
    return 'HUMAN';
  }

  // Address modification
  if (/\b(cambiar.*?(direccion|comuna|depto|dpto|ciudad)|cambio.*?(direccion)|otra direccion|me equivoqu[eé]|me equivoco|corregir.*?(direccion)|nueva direccion)\b/i.test(norm)) {
    return 'CHANGE_ADDRESS';
  }

  // Shipping & delivery time
  if (/\b(cuand[oa].*?(llega|entregan|recibo)|cuant[oa].*?(tarda|demora)|plazo|tiempo.*?(entrega|envio)|que dia|que fecha|a que hora|despacho|envio|llegada|reparto|demoran|tardan)\b/i.test(norm)) {
    return 'SHIPPING';
  }

  // Payment method & COD
  if (/\b(com[oa].*?(paga|cancela)|medio.*?(pago)|forma.*?(pago)|tarjeta|transferencia|efectivo|contra ?entrega|contraentrega|pagar al recibir|se paga antes|redcompra|pos|debito)\b/i.test(norm)) {
    return 'PAYMENT';
  }

  // Guarantee & trust
  if (/\b(garanti[aa]|falla|defecto|roto|dañad[oa]|devoluci[on]|cambio de producto|es seguro|es confiable|estafa)\b/i.test(norm)) {
    return 'GUARANTEE';
  }

  // Order status inquiry
  if (/\b(estado|mi pedido|mi compra|donde.*?(va|esta)|seguimiento|rastreo|tracking|que paso con)\b/i.test(norm)) {
    return 'STATUS';
  }

  // Greetings
  if (/^(hola|buen[oa]s? (dias?|tardes?|noches?)|qu[eé] tal|alo|al[oó]|hey|ola)\b/i.test(norm)) {
    return 'GREETING';
  }

  return 'UNKNOWN';
}

export function createWhatsAppAgent({ db, whatsapp, inbox, clock = () => new Date().toISOString(), delayMs }) {
  const lastReplyByPhone = new Map();
  const processedMessageIds = new Set();

  const isTestEnv = () => Boolean(
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_TEST_CONTEXT ||
    process.execArgv.includes('--test') ||
    process.argv.some(a => a.includes('.test.'))
  );

  function getHumanDelay() {
    if (typeof delayMs === 'function') return delayMs();
    if (typeof delayMs === 'number') return delayMs;
    if (isTestEnv()) return 0;
    // Pausa aleatoria entre 7 y 10 segundos para simular lectura humana
    return Math.floor(Math.random() * (10000 - 7000 + 1)) + 7000;
  }

  function getLatestOrder(phone) {
    // 1. Try to get a pending order first
    let order = db.prepare(
      "SELECT * FROM landing_orders WHERE phone=? AND state IN ('WA_PENDING','WA_SENDING','WAITING_CONFIRMATION','MESSAGE_ERROR','MESSAGE_UNKNOWN') AND expires_at>? ORDER BY created_at DESC LIMIT 1"
    ).get(phone, clock());

    // 2. Otherwise get the most recent order of any state
    if (!order) {
      order = db.prepare(
        "SELECT * FROM landing_orders WHERE phone=? ORDER BY created_at DESC LIMIT 1"
      ).get(phone);
    }
    return order || null;
  }

  function getOrderById(orderId) {
    if (!orderId) return null;
    return db.prepare("SELECT * FROM landing_orders WHERE id=?").get(orderId) || null;
  }

  function getCustomerInfo(order, phone) {
    let firstName = 'Cliente';
    let address = 'tu dirección';
    let city = 'tu ciudad';
    let brand = order?.brand_name || 'Nexora Store';

    if (order?.customer) {
      try {
        const c = JSON.parse(order.customer);
        if (c.first_name) firstName = c.first_name.trim();
        if (c.address_line_1) address = c.address_line_1.trim();
        if (c.city) city = c.city.trim();
      } catch {}
    } else {
      const contact = db.prepare("SELECT name FROM wa_customers WHERE phone=?").get(phone);
      if (contact?.name && contact.name !== phone) {
        firstName = contact.name.trim().split(/\s+/)[0];
      }
    }
    return { firstName, address, city, brand };
  }

  function canReply(phone, messageId) {
    if (!whatsapp.connected()) return false;
    if (inbox && !inbox.canAutomate(phone)) return false;
    if (messageId && processedMessageIds.has(messageId)) return false;

    const nowMs = Date.now();
    const last = lastReplyByPhone.get(phone) || 0;
    if (nowMs - last < 2500) return false; // 2.5s anti-flood debounce
    return true;
  }

  function markReplied(phone, messageId) {
    lastReplyByPhone.set(phone, Date.now());
    if (messageId) {
      processedMessageIds.add(messageId);
      if (processedMessageIds.size > 500) {
        const first = processedMessageIds.values().next().value;
        if (first) processedMessageIds.delete(first);
      }
    }
  }

  async function sendReply(phone, text, orderId = null) {
    try {
      const delay = getHumanDelay();
      if (delay > 0) {
        if (typeof whatsapp.sendPresence === 'function') {
          whatsapp.sendPresence(phone, 'composing').catch(() => {});
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        if (typeof whatsapp.sendPresence === 'function') {
          whatsapp.sendPresence(phone, 'paused').catch(() => {});
        }
      }
      await whatsapp.send(phone, text, { origin: 'automatic', orderId: orderId || undefined });
      lastReplyByPhone.set(phone, Date.now());
      return true;
    } catch (err) {
      console.error(`WhatsApp Agent error sending to ${phone}:`, err.message);
      return false;
    }
  }

  return {
    classifyIntent,
    getLatestOrder,
    getHumanDelay,

    async handleConfirmation(order, messageId) {
      if (!order || !canReply(order.phone, messageId)) return false;
      const { firstName, address, city, brand } = getCustomerInfo(order, order.phone);
      const totalStr = formatMoney(order.unit_price * order.quantity, order.currency);
      const currencySuffix = (order.currency && order.currency !== 'CLP') ? ` (${order.currency})` : '';

      const text =
        `¡Excelente, ${firstName}! 🎉 Tu pedido #${order.confirmation_code} ha sido confirmado con éxito.\n\n` +
        `📦 *Detalle confirmado:*\n` +
        `• Producto: ${order.quantity} × ${order.product_name}\n` +
        `• Total a pagar: *${totalStr}*${currencySuffix} (Pago contra entrega 💵)\n` +
        `• Despacho a: ${address}, ${city}\n\n` +
        `🚚 *Tiempos de entrega:*\n` +
        `• Santiago: 24/48 horas.\n` +
        `• Regiones: 2 a 4 días hábiles.\n\n` +
        `El repartidor se comunicará con usted al momento de la entrega. ¡Muchas gracias por tu compra en ${brand}! 🙌`;

      markReplied(order.phone, messageId);
      return await sendReply(order.phone, text, order.id);
    },

    async handleCancellation(order, messageId) {
      if (!order || !canReply(order.phone, messageId)) return false;
      const { firstName, brand } = getCustomerInfo(order, order.phone);

      const text =
        `Hola ${firstName}, confirmamos que tu pedido #${order.confirmation_code} ha sido cancelado con éxito. ❌\n\n` +
        `No se realizará ningún cobro ni despacho hacia tu domicilio.\n\n` +
        `Si en el futuro deseas adquirir alguno de nuestros productos o necesitas cualquier ayuda, estaremos encantados de atenderte por este mismo chat.\n\n` +
        `¡Muchas gracias por avisarnos y que tengas un excelente día en ${brand}! 🙏`;

      markReplied(order.phone, messageId);
      return await sendReply(order.phone, text, order.id);
    },

    async handleIncoming({ phone, text, messageId, confirmedOrCancelled = false, rawKey = null }) {
      if (!phone || typeof text !== 'string' || !text.trim()) return false;
      if (!whatsapp.connected()) return false;
      if (inbox && !inbox.canAutomate(phone)) return false;

      // Paso 1: Activar las palomitas azules de inmediato (mark as read)
      if (rawKey && typeof whatsapp.markRead === 'function') {
        whatsapp.markRead(rawKey).catch(() => {});
      }

      const order = getLatestOrder(phone);

      // If already processed as a confirmation or cancellation by landingFlow
      if (confirmedOrCancelled) {
        if (!order) return false;
        if (order.state === 'CUSTOMER_CONFIRMED') {
          return await this.handleConfirmation(order, messageId);
        } else if (order.state === 'CUSTOMER_CANCELLED') {
          return await this.handleCancellation(order, messageId);
        }
        return false;
      }

      if (!canReply(phone, messageId)) return false;

      const intent = classifyIntent(text);
      if (intent === 'UNKNOWN') return false;

      const { firstName, brand } = getCustomerInfo(order, phone);
      const isPending = order && ['WA_PENDING', 'WA_SENDING', 'WAITING_CONFIRMATION', 'MESSAGE_ERROR', 'MESSAGE_UNKNOWN'].includes(order.state);
      const orderPrompt = isPending
        ? `\n\n👉 Para confirmar el despacho de tu pedido responde SÍ o CONFIRMO.`
        : '';

      let replyText = '';

      switch (intent) {
        case 'SHIPPING': {
          replyText =
            `🚚 *Plazos de Despacho y Entrega:*\n\n` +
            `• Santiago: 24/48 horas.\n` +
            `• Regiones: 2 a 4 días hábiles.\n\n` +
            `📦 Los repartidores realizan entregas de lunes a sábado entre las 9 y las 19 horas y se comunicarán con usted.` +
            orderPrompt;
          break;
        }

        case 'PAYMENT': {
          replyText =
            `💵 *Medio de Pago 100% Contra Entrega:*\n\n` +
            `¡Pagas únicamente cuando recibes el producto en tus manos!\n\n` +
            `• *Efectivo:* Monto exacto o con vuelto para el repartidor.\n` +
            `• *Transferencia o Tarjeta:* La gran mayoría de los repartidores cuenta con máquina POS para tarjeta de débito o te facilitan los datos para transferir en el momento.` +
            orderPrompt;
          break;
        }

        case 'GUARANTEE': {
          replyText =
            `🛡️ *Garantía y Confianza:*\n\n` +
            `• Todos nuestros productos cuentan con *garantía oficial* ante cualquier falla de fábrica o daño en el transporte.\n` +
            `• Si al recibir tu paquete notas cualquier inconveniente, nos escribes inmediatamente a este mismo WhatsApp con una foto o video y te gestionamos el cambio o solución de inmediato sin costo extra.`;
          break;
        }

        case 'CHANGE_ADDRESS': {
          replyText =
            `📍 *Actualización de Datos de Envío:*\n\n` +
            `Hemos tomado nota de tu mensaje. Por favor escríbenos aquí mismo:\n` +
            `1. Calle y número exacto (o depto / block / oficina)\n` +
            `2. Comuna y Ciudad\n` +
            `3. Referencia adicional de entrega\n\n` +
            `Un asesor verificará los datos antes de emitir la guía de despacho.` +
            orderPrompt;

          if (inbox) {
            try {
              const contact = inbox.customer(phone);
              if (contact) {
                let conv = db.prepare("SELECT id FROM wa_conversations WHERE customer_id=?").get(contact.id);
                if (!conv) {
                  const cid = randomUUID();
                  const acc = inbox.account ? inbox.account() : 'default';
                  db.prepare("INSERT INTO wa_conversations(id,customer_id,account,last_at) VALUES (?,?,?,?)").run(cid, contact.id, acc, clock());
                  conv = { id: cid };
                }
                inbox.note(conv.id, `Cliente solicitó cambio de dirección: "${text.slice(0, 300)}"`);
              }
            } catch {}
          }
          break;
        }

        case 'HUMAN': {
          replyText =
            `👤 Te estamos comunicando con un asesor de soporte humano.\n\n` +
            `En breves momentos un miembro de nuestro equipo te atenderá directamente por este chat. ¡Muchas gracias por tu paciencia!`;

          if (inbox) {
            try {
              const contact = inbox.customer(phone);
              if (contact) {
                let conv = db.prepare("SELECT id FROM wa_conversations WHERE customer_id=?").get(contact.id);
                if (!conv) {
                  const cid = randomUUID();
                  const acc = inbox.account ? inbox.account() : 'default';
                  db.prepare("INSERT INTO wa_conversations(id,customer_id,account,last_at) VALUES (?,?,?,?)").run(cid, contact.id, acc, clock());
                  conv = { id: cid };
                }
                inbox.mode(conv.id, 'human');
              }
            } catch {}
          }
          break;
        }

        case 'STATUS': {
          if (!order) {
            replyText =
              `Hola ${firstName}, no encontramos ningún pedido registrado con este número telefónico. Si hiciste una compra recientemente, indícanos tu nombre completo o número de orden para ayudarte.`;
          } else if (isPending) {
            replyText =
              `📦 Tu pedido #${order.confirmation_code} de *${order.product_name}* está registrado y a la espera de confirmación.\n\n` +
              `Para enviarlo hoy mismo a preparación y despacho, por favor responde *SÍ* o *CONFIRMO* ✅.`;
          } else if (['CUSTOMER_CONFIRMED', 'CREATING', 'CREATE_PENDING', 'CONFIRMING', 'CONFIRM_PENDING', 'SENT_TO_DROPEA'].includes(order.state)) {
            replyText =
              `📦 Tu pedido #${order.confirmation_code} de *${order.product_name}* ya está *confirmado* y en proceso de empaque y logística. Te avisaremos cuando el repartidor esté en camino. 🚚`;
          } else if (order.state === 'CUSTOMER_CANCELLED') {
            replyText =
              `Tu pedido #${order.confirmation_code} se encuentra *cancelado* en nuestro sistema. Si deseas reactivarlo, con gusto te ayudamos por aquí.`;
          } else {
            replyText =
              `Tu pedido #${order.confirmation_code} de *${order.product_name}* se encuentra en gestión logística. Pronto recibirás actualizaciones de despacho.`;
          }
          break;
        }

        case 'GREETING': {
          if (isPending) {
            const totalStr = formatMoney(order.unit_price * order.quantity, order.currency);
            replyText =
              `¡Hola ${firstName}! 👋 Te saludamos de ${brand}.\n\n` +
              `Vemos que tienes un pedido pendiente por *${order.product_name}* (${totalStr} con pago contra entrega).\n\n` +
              `¿Están todos tus datos correctos para prepararlo y coordinar el despacho? Por favor responde *SÍ* o *CONFIRMO* ✅.`;
          } else {
            replyText =
              `¡Hola! 👋 Te estás comunicando con atención al cliente de ${brand}. ¿En qué podemos ayudarte hoy?`;
          }
          break;
        }

        default:
          return false;
      }

      markReplied(phone, messageId);
      return await sendReply(phone, replyText, order?.id || null);
    }
  };
}
