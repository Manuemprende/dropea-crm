# Configuración y Documentación: Validación de Pedidos con Google Maps

Este documento recopila la **API Key oficial**, los endpoints, las reglas de validación de direcciones, la caché y el código de integración utilizado para identificar y geocodificar pedidos automáticamente.

---

## 1. Credencial Oficial de Google Maps

- **Google Maps API Key:**
  ```text
  AIzaSyDrVvrPxwriqLCapp7sVEQ3w-teMSlroqQ
  ```

### APIs de Google Cloud asociadas:
1. **Geocoding API**: Para transformar el texto ingresado por el cliente en una dirección normalizada con latitud, longitud y código postal.
2. **Maps JavaScript API / Maps Embed API**: Para renderizar el mapa interactivo del domicilio con su pin de ubicación en la ficha del pedido.
3. **Places API (opcional)**: Para autocompletar calles y comunas en formularios de landing o checkout.

---

## 2. Endpoints y Parámetros de Solicitud

### A. Geocodificación y Validación de Dirección (Geocoding API)
```http
GET https://maps.googleapis.com/maps/api/geocode/json?address={DIRECCION_COMPLETA}&key=AIzaSyDrVvrPxwriqLCapp7sVEQ3w-teMSlroqQ&language=es&region=cl
```

- **Parámetros recomendados para Chile:**
  - `address`: Dirección concatenada con comuna y país (ej: `Avenida Providencia 1234, Providencia, Región Metropolitana, Chile`).
  - `language`: `es` (para nombres en español).
  - `region`: `cl` (sesga la búsqueda a territorio chileno evitando coincidencias en otros países).

---

### B. Enlace Directo para Repartidores / Despacho (Google Maps Navegación)
Genera el enlace para abrir en la app de Google Maps en el celular del transportista:
```text
https://www.google.com/maps/search/?api=1&query={LATITUD},{LONGITUD}
```
O por texto de dirección:
```text
https://www.google.com/maps/search/?api=1&query={DIRECCION_URL_ENCODED}
```

---

### C. Mapa Embebido en Iframe (Ficha de Pedido)
```html
<iframe
  width="100%"
  height="220"
  style="border:0; border-radius:8px;"
  loading="lazy"
  allowfullscreen
  src="https://www.google.com/maps/embed/v1/place?key=AIzaSyDrVvrPxwriqLCapp7sVEQ3w-teMSlroqQ&q={DIRECCION_URL_ENCODED}">
</iframe>
```

---

## 3. Lógica de Validación y Clasificación de Precisión

Google Maps devuelve en `geometry.location_type` y `address_components` la precisión con la que encontró el domicilio:

| Precisión | `location_type` | Condición | Badge en el CRM |
| :--- | :--- | :--- | :--- |
| **Exacta (Domicilio real)** | `ROOFTOP` | La calle y el número existen en el catastro exacto. | 🟢 `✓ Validada` |
| **Interpolada (Rango de calle)** | `RANGE_INTERPOLATED` | Número estimado dentro de la cuadra con calle válida. | 🟢 `✓ Validada` |
| **Aproximada (Falta número)** | `GEOMETRIC_CENTER` | Encontró la calle o la comuna pero NO el número de casa. | 🟡 `⚠ Revisar` |
| **Baja precisión** | `APPROXIMATE` | Solo ubicó la comuna o sector general. | 🔴 `⚠ Sin número / Inválida` |

---

## 4. Código Completo de Integración (JavaScript / React)

Este es el módulo implementado en `LandingOrdersPage.jsx` para validar y guardar en caché local:

```javascript
const GOOGLE_MAPS_API_KEY = 'AIzaSyDrVvrPxwriqLCapp7sVEQ3w-teMSlroqQ';
const GMAPS_CACHE_KEY = 'gmaps_geo_cache_v1';

// Cargar caché local para no consumir cuota repetida de Google Maps
function loadGmapsCache() {
  try {
    const raw = localStorage.getItem(GMAPS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGmapsCache(cacheObj) {
  try {
    localStorage.setItem(GMAPS_CACHE_KEY, JSON.stringify(cacheObj));
  } catch {}
}

/**
 * Valida y normaliza la dirección de un pedido contra Google Maps
 */
async function validateAddressWithGoogle(address, commune, region = 'Chile') {
  const cleanAddr = (address || '').trim();
  const cleanComm = (commune || '').trim();

  if (!cleanAddr) {
    return { status: 'missing', label: 'Sin dirección', formatted: '', exact: false };
  }

  const queryKey = `${cleanAddr}|${cleanComm}`.toLowerCase();
  const cache = loadGmapsCache();
  if (cache[queryKey]) {
    return cache[queryKey];
  }

  try {
    const fullQuery = `${cleanAddr}, ${cleanComm}, ${region}, Chile`;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullQuery)}&key=${GOOGLE_MAPS_API_KEY}&language=es&region=cl`;
    
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const r = data.results[0];
      const comps = r.address_components || [];
      const types = comps.flatMap(c => c.types || []);

      const hasStreetNumber = types.includes('street_number');
      const hasRoute = types.includes('route');
      const locType = r.geometry?.location_type || '';
      
      const postalComp = comps.find(c => (c.types || []).includes('postal_code'));
      const postalCode = postalComp ? postalComp.long_name : '';

      // Se considera exacta si tiene calle + número o es ROOFTOP / RANGE_INTERPOLATED sin coincidencia parcial
      const isExact = (hasStreetNumber && hasRoute) || 
                      (locType === 'ROOFTOP' && !r.partial_match) || 
                      (locType === 'RANGE_INTERPOLATED' && hasRoute && !r.partial_match);

      const result = {
        status: isExact ? 'valid' : 'approx',
        exact: isExact,
        label: isExact ? 'Dirección Validada' : 'Dirección Aproximada (Revisar)',
        formatted: r.formatted_address || fullQuery,
        postalCode,
        locationType: locType,
        lat: r.geometry?.location?.lat || null,
        lng: r.geometry?.location?.lng || null,
        partialMatch: Boolean(r.partial_match)
      };

      cache[queryKey] = result;
      saveGmapsCache(cache);
      return result;
    } else {
      const result = {
        status: 'invalid',
        exact: false,
        label: 'No encontrada',
        formatted: '',
        lat: null,
        lng: null
      };
      cache[queryKey] = result;
      saveGmapsCache(cache);
      return result;
    }
  } catch (e) {
    return { status: 'error', exact: false, label: 'Pendiente validar', formatted: '' };
  }
}
```

---

## 5. Plantillas de Mensajes WhatsApp basadas en la Validación

### Mensaje 1: Dirección Validada Correctamente (🟢 1 Clic)
> *¡Hola [Nombre]! Te saludamos de [Tienda]. Recibimos con éxito tu pedido #[N_PEDIDO] por [Producto] (Total a pagar al recibir: $[TOTAL]).*  
> *Confirmamos que tu dirección oficial fue validada correctamente:*  
> 📍 *[DIRECCION_FORMATEADA_GOOGLE]*  
> *¿Confirmas el despacho para preparar tu envío hoy mismo? Responde con un SÍ.*

### Mensaje 2: Dirección Aproximada o Falta Número de Casa (🟡 1 Clic)
> *¡Hola [Nombre]! Te saludamos de [Tienda]. Tenemos registrado tu pedido #[N_PEDIDO] por [Producto] para entrega en [Comuna].*  
> ⚠️ *Para que el repartidor no tenga demoras, notamos que nos falta el número exacto de tu casa / departamento o una referencia:*  
> *Dirección actual registrada: [DIRECCION_CLIENTE]*  
> *Por favor respóndenos con tu número exacto o pasaje/depto para despachártelo hoy. ¡Gracias!*
