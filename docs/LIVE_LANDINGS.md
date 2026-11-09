# Live / Landings: campañas reales

## Campaña conectada para mostrar el funcionamiento

La tarjeta Pelota Saltarina corresponde a la landing real https://pelota-saltarina.pidedirecto.cyou/ que ya está con campaña. Muestra sus visitas, visitantes en vivo, ubicaciones, checkout y pedidos recibidos. No se generan personas, ventas ni pedidos simulados.

Abre CRM Dropea y el menú **Live / Landings**. Desde la tarjeta, **Abrir campaña real** abre la URL que ya está vendiendo. Para mostrar el funcionamiento, abre esa URL desde otro navegador o teléfono, abre el formulario e ingresa datos para ver el checkout. No envíes una compra si solo quieres comprobar la visita: esa landing procesa pedidos reales.

Los datos llegan mediante un permiso privado de lectura, limitado a Pelota Saltarina. No incluye tu contraseña de administrador, API Key del proveedor, token Meta, sesión WhatsApp ni datos personales de compradores. El permiso solo se instala en tu cuenta administrativa. Los miembros no reciben esas credenciales ni ven tus campañas por defecto.

La operación de pedidos de esa campaña continúa en su sistema actual (Nexora). CRM Dropea muestra los indicadores reales sin duplicar compras ni despachos. Llevar los pedidos a la cuenta Dropea requiere el ID de producto, variante y tienda correctos; no se inventa un ID ni se cambia la campaña activa para aparentar esa conexión.

La interfaz no muestra una sección de simulaciones. Sus endpoints de prueba fueron retirados y devuelven 410; sus datos históricos quedan excluidos de todos los totales reales. Si el informe de una campaña no responde, la vista muestra un aviso, conserva solamente los acumulados reales de la última lectura y marca la actividad en vivo como no disponible.

## Conectar landings propias directamente con CRM Dropea

1. En **Configuración**, conecta tu cuenta Dropea del país donde venderás, con tus propias credenciales.
2. En **Landings**, configura una oferta: ID del producto Dropea, variante, tienda, nombre para WhatsApp, precio y URL publicada. El servidor valida producto y tienda en esa cuenta.
3. En **Live / Landings → Conectar landing**, selecciona la misma oferta y su URL. Las ofertas con URL se incorporan al seguimiento automáticamente. Producto, país, precio y moneda provienen de la oferta.
4. Copia el script de visitas e insértalo antes de cerrar `</body>` en tu página.
5. Marca el botón que abre el formulario con `data-live-checkout` y el formulario con `data-live-checkout-form`. Si lo abre tu código, llama `window.CrmLandingLive.current.checkoutOpened()` al mostrarlo.
6. Pulsa **Copiar instrucciones para mi creador de landings** para obtener script, receptor de pedidos, campos JSON e instrucciones de respuesta. Al enviar el pedido, incluye session_id y visitor_id de `window.CrmLandingLive.current.context()` y conserva el request_id en los reintentos.
7. Vincula tu WhatsApp. El CRM guarda el pedido, solicita la confirmación y solo después intenta gestionarlo en Dropea.

Para enviar desde navegador, configura precio fijo y origen HTTPS exacto. Si envías desde tu servidor, la clave de la oferta se guarda en variables del servidor, nunca en HTML o JavaScript público. La compra se cuenta al guardar el pedido; no equivale a pago ni entrega completada.

Las landings de Europa usarán sus propios IDs, país, tienda y moneda. Cada mercado debe tener su cuenta y oferta correctas. Se conservan los rangos de fechas y la conversión de moneda del panel.

## Hosting y comunidad

El HTML puede estar alojado en tu propio servidor o un hosting estático. El CRM requiere un backend persistente para sesiones, métricas, pedidos y WhatsApp. El hosting gratuito tiene condiciones y límites: Vercel Hobby es para uso personal no comercial (https://vercel.com/docs/plans/hobby). No prometas costes de infraestructura inexistentes; sí puedes explicar que el sistema no requiere una licencia mensual de Shopify.

Cada miembro puede usar una instalación independiente con su dominio, base de datos, usuario, cuenta Dropea y WhatsApp. Esta instalación sigue siendo un solo workspace administrativo. No repartir `.env`, `data`, credenciales ni el permiso de lectura de tu campaña a los miembros. Varias personas en una misma instalación requieren separar toda la operación por organización y roles.

La geolocalización de las landings nativas se obtiene con DB-IP City Lite localmente en el VPS, guardando solo ciudad y país. LIVE_GEO_DATABASE indica la base; /etc/cron.d/dropea-live-geo actualiza mensualmente. Los campos LIVE_CAMPAIGN_REPORT_URL, LIVE_CAMPAIGN_TOKEN, LIVE_CAMPAIGN_OWNER y LIVE_CAMPAIGN_LANDING_ID configuran exclusivamente la campaña real conectada del administrador; no se exponen al navegador.

## Información de cada tarjeta

Cada campaña muestra visitantes ahora, ventas, sesiones y visitantes únicos, órdenes y conversión; luego las tres ubicaciones con más sesiones, visitantes nuevos y recurrentes, productos y comportamiento en vivo. Cada navegador reconocido cuenta una sola vez por landing y período: nuevo si solo tiene su primera sesión conocida; recurrente si vuelve en otra sesión, incluso dentro del mismo período. Recargar o los latidos de una misma sesión no lo convierten en recurrente. Cada navegador que vuelve se clasifica solo como recurrente, sin duplicarlo en ambos grupos. Las visitas posteriores al final del período no alteran informes anteriores. La IP se utiliza para la ubicación aproximada, no como identidad: redes compartidas, VPN y cambios de red impedirían identificar personas con precisión. Otro dispositivo, modo incógnito o borrar el almacenamiento puede contar como nuevo. Los compradores se conservan como una métrica separada del servidor. La campaña conectada entrega exclusivamente agregados de visitantes; no expone IP ni identificadores. Las barras de visitantes representan la proporción real y quedan vacías si el valor es cero o no hay desglose disponible. Los segmentos mínimos de las cuatro barras de métricas son decorativos; los números son los datos reales. La vista en lista o cuadrícula se guarda en el navegador.

## Interfaz móvil

La barra de controles reúne búsqueda, período, moneda, una actualización general, vista y conexión. Los contadores se presentan únicamente dentro de cada tarjeta. En celular, los controles se distribuyen en filas con objetivos táctiles de al menos 44 px. La información de geolocalización y su atribución se consulta desde el icono de información junto al título. Las notificaciones push quedan para una fase posterior.
