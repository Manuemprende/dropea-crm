# Guía de Implementación: Tarjeta Live / Landings (Estilo Nexora)

Documentación completa y lista para implementar en cualquier plataforma o CRM (por ejemplo Dropea, Shopify o Nexora).

---

## 1. URL de la plataforma oficial Nexora
- **URL de producción:** [https://nexora.wentixai.pro](https://nexora.wentixai.pro)
- **Ruta interna:** Menú lateral ➔ **Landings** (o vista Live Compras).

---

## 2. Paleta de Colores de Referencia (Nexora)

| Métrica / Sección | Color Principal | Degradado / Tonos | Propósito |
| :--- | :--- | :--- | :--- |
| **Total de ventas** | Verde | `linear-gradient(90deg, #16a34a, #86efac)` | Facturación y ventas confirmadas |
| **Total de órdenes** | Naranja | `linear-gradient(90deg, #f97316, #fdba74)` | Pedidos y tasa de checkout |
| **Visitantes ahora** | Celeste / Azul | `linear-gradient(90deg, #0ea5e9, #7dd3fc)` | Tráfico en vivo |
| **Total de sesiones** | Azul | `linear-gradient(90deg, #0284c7, #38bdf8)` | Sesiones y visitantes únicos |
| **Clientes Nuevos** | Naranja | `linear-gradient(90deg, #fb923c, #ea580c)` | Reemplaza al morado anterior |
| **Clientes Recurrentes** | Azul | `linear-gradient(90deg, #38bdf8, #2563eb)` | Retención de clientes |

---

## 3. Comportamiento en Vivo (Orbes 3D Cristalinos y Línea Posterior)

### Regla Fundamental:
La línea conectora horizontal **NUNCA debe atravesar los círculos**.  
Para garantizar esto de forma infalible en cualquier navegador:
1. El contenedor padre debe tener `isolation: isolate; position: relative;`.
2. La línea tiene `position: absolute; z-index: 1;`.
3. Cada globo/orbe tiene `position: relative; z-index: 5;` con un fondo **100% opaco** (sin transparencias que dejen ver la línea por detrás).
4. Cuando un orbe tiene usuarios activos (`count >= 1`), se agranda proporcionalmente (`scale(1.20)` a `scale(1.62)`), emite un halo incandescente y el número desciende dinámicamente para mantenerse legible.

---

### Código CSS de los Orbes y la Línea:

```css
/* Contenedor del funnel en vivo con aislamiento de capa */
.live-orbs,
.nxlc-behavior {
  position: relative !important;
  isolation: isolate !important;
  display: flex !important;
  justify-content: space-around !important;
  padding: 10px 0 6px !important;
  text-align: center !important;
  overflow: visible !important;
}

/* Línea horizontal continua colocada estrictamente DETRÁS de las esferas */
.live-orbs-line,
.live-orbs:before,
.nxlc-behavior:before {
  content: '' !important;
  position: absolute !important;
  top: 25px !important;
  left: 16% !important;
  right: 16% !important;
  height: 2px !important;
  background: linear-gradient(90deg, #38bdf8, #fb923c, #34d399) !important;
  z-index: 1 !important;
  pointer-events: none !important;
  opacity: 0.75 !important;
}

/* Columna de cada etapa (En landing, En checkout, Compras) */
.live-stage,
.nxlc-stage {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  position: relative !important;
  width: 33.333% !important;
  z-index: 3 !important;
}

/* Slot contenedor del orbe para mantener espacio cuando se agranda */
.live-orb-slot,
.nxlc-orb-slot {
  width: 56px !important;
  height: 52px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  position: relative !important;
  z-index: 4 !important;
}

/* Orbe 3D Cristalino - Estado Reposo (100% opaco) */
.live-orb,
.nxlc-orb {
  display: block !important;
  width: 30px !important;
  height: 30px !important;
  border-radius: 50% !important;
  position: relative !important;
  z-index: 5 !important;
  background: radial-gradient(circle at 34% 29%, #f0f9ff 0%, #7dd3fc 34%, #0284c7 74%, #0369a1 100%) !important;
  border: 1.5px solid #7dd3fc !important;
  box-shadow: 0 0 0 var(--orb-ring, 3px) rgba(56, 189, 248, 0.22), 0 3px 8px rgba(56, 189, 248, 0.32) !important;
  transform: scale(var(--orb-scale, 1)) !important;
  transform-origin: center center !important;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease, border-color 0.3s ease !important;
}

/* Orbe Naranja (Checkout) en reposo */
.live-orb.orange,
.nxlc-orb.orange {
  background: radial-gradient(circle at 34% 29%, #ffedd5 0%, #fdba74 34%, #ea580c 74%, #9a3412 100%) !important;
  border-color: #fb923c !important;
  box-shadow: 0 0 0 var(--orb-ring, 3px) rgba(249, 115, 22, 0.22), 0 3px 8px rgba(249, 115, 22, 0.32) !important;
}

/* Orbe Verde (Compras) en reposo */
.live-orb.green,
.nxlc-orb.green {
  background: radial-gradient(circle at 34% 29%, #dcfce7 0%, #86efac 34%, #16a34a 74%, #14532d 100%) !important;
  border-color: #4ade80 !important;
  box-shadow: 0 0 0 var(--orb-ring, 3px) rgba(34, 197, 94, 0.22), 0 3px 8px rgba(34, 197, 94, 0.32) !important;
}

/* Orbes ACTIVOS (con personas en vivo) - Incandescente brillante */
.live-orb.has-value,
.nxlc-orb.is-live-pulse {
  background: radial-gradient(circle at 34% 29%, #ffffff 0%, #bae6fd 26%, #0ea5e9 68%, #0284c7 100%) !important;
  border-color: #f0f9ff !important;
  box-shadow: 0 0 16px 4px rgba(14, 165, 233, 0.55), 0 3px 10px rgba(14, 165, 233, 0.4) !important;
}

.live-orb.orange.has-value,
.nxlc-orb.orange.is-live-pulse {
  background: radial-gradient(circle at 34% 29%, #ffffff 0%, #fed7aa 26%, #f97316 68%, #c2410c 100%) !important;
  border-color: #ffedd5 !important;
  box-shadow: 0 0 16px 4px rgba(249, 115, 22, 0.55), 0 3px 10px rgba(249, 115, 22, 0.4) !important;
}

.live-orb.green.has-value,
.nxlc-orb.green.is-live-pulse {
  background: radial-gradient(circle at 34% 29%, #ffffff 0%, #bbf7d0 26%, #22c55e 68%, #15803d 100%) !important;
  border-color: #f0fdf4 !important;
  box-shadow: 0 0 16px 4px rgba(34, 197, 94, 0.55), 0 3px 10px rgba(34, 197, 94, 0.4) !important;
}

/* Texto del número debajo del orbe */
.live-stage strong,
.nxlc-stage b {
  font-size: 16px !important;
  font-weight: 800 !important;
  line-height: 1.2 !important;
  margin-top: 4px !important;
  color: var(--app-text, #edf5ff) !important;
  transition: margin-top 0.35s ease, color 0.3s ease !important;
}
```

---

### Código JSX / HTML de la Sección:

```jsx
<section className="live-behavior-panel">
  <h4>
    Comportamiento en vivo <span className="nxlc-window">Tiempo real</span>
  </h4>

  <div className="live-orbs">
    {/* Línea conectora continua (detrás) */}
    <div className="live-orbs-line" aria-hidden="true" />

    {[
      { n: behavior.active_carts, label: 'En landing', color: 'blue' },
      { n: behavior.checking_out, label: 'En checkout', color: 'orange' },
      { n: behavior.purchased, label: 'Compras', color: 'green' }
    ].map(stage => {
      const count = Math.max(0, Number(stage.n || 0));
      // Escalado dinámico según cantidad de personas
      const scale = count === 0 ? 1 : count === 1 ? 1.20 : count === 2 ? 1.32 : count === 3 ? 1.44 : Math.min(1.62, 1.44 + (count - 3) * 0.045);
      const ring = count === 0 ? 3 : count === 1 ? 6 : count === 2 ? 8 : count === 3 ? 10 : 12;
      const glow = count === 0 ? 0.22 : count === 1 ? 0.38 : count === 2 ? 0.46 : count === 3 ? 0.54 : 0.62;
      const style = { '--orb-scale': scale, '--orb-ring': `${ring}px`, '--orb-glow': glow };
      // Ajuste dinámico para que el número baje y no choque con la pelota grande
      const numMarginTop = Math.max(4, Math.round((scale - 1) * 16 + 4));

      return (
        <div className={`live-stage ${stage.color} ${count ? 'has-value' : ''}`} key={stage.label}>
          <div className="live-orb-slot">
            <i className={`live-orb ${stage.color} ${count ? 'has-value' : ''}`} style={style} aria-hidden="true" />
          </div>
          <strong style={{ marginTop: numMarginTop }}>{count}</strong>
          <small>{stage.label}</small>
        </div>
      );
    })}
  </div>
</section>
```

---

## 4. Barras de Métricas con Segmento Base Visible (Evita barras vacías en \$0 o 0 pedidos)

En tarjetas vacías o con valores en 0, no dejar `width: 0%` porque la barra queda invisible. Usa una línea base mínima:

```jsx
// En el bloque de 4 métricas (Ventas, Órdenes, Sesiones, Visitantes):
<div className="live-stat-bar">
  <i style={{
    width: Math.max(k.key === 'sales' || k.key === 'orders' ? 22 : 18, Math.min(100, k.ratio * 100)) + '%'
  }} />
</div>

// En la sección Clientes (Nuevos / Recurrentes):
<div className={'live-bar ' + (c.label === 'Nuevos' ? 'orange' : 'blue')}>
  <i style={{
    width: totalCustomers && typeof c.n === 'number'
      ? Math.max(16, Math.min(100, (c.n / totalCustomers) * 100)) + '%'
      : '22%'
  }} />
</div>
```
