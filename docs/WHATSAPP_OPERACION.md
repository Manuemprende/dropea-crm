# WhatsApp: operación y trazabilidad

La sección WhatsApp reúne Conversaciones, Pipeline y Clientes. La vinculación QR y la preferencia global de confirmación automática se administran en Configuración → WhatsApp.

- Los mensajes se guardan en SQLite antes del envío. Se correlaciona el ID de WhatsApp con los estados enviado, entregado y leído, sin hacer retroceder una lectura por un recibo atrasado. Un reinicio durante un envío deja un estado por verificar y no lo reenvía automáticamente.
- Las respuestas manuales usan una referencia idempotente. Las notas internas no se envían al cliente. Tomar atención pausa nuevos mensajes y nuevas confirmaciones automáticas para ese teléfono; las operaciones ya iniciadas en Dropea continúan su reconciliación.
- El pipeline tiene una tarjeta por pedido. El pedido de landing se une al remoto mediante su referencia CRM o su ID remoto y país. Los eventos antiguos se conservan en la trazabilidad sin retroceder el estado actual.
- La ficha del cliente agrupa sus pedidos por teléfono internacional. Los porcentajes propios se mantienen separados de customer_reliability de Dropea. El promedio de entrega usa fechas existentes; no se calcula una tasa de primer intento sin eventos suficientes.
- El historial es prospectivo, más lo que WhatsApp entregue en la sincronización. No se promete recuperar todo el pasado. Los audios, imágenes y documentos se identifican en el chat; su reproducción o descarga desde el CRM queda fuera de esta versión.
- La bandeja muestra hasta 500 contactos recientes, el pipeline hasta 1000 pedidos y la conversación carga bloques de 100 mensajes. Los datos almacenados no se eliminan al alcanzar esos límites.
- Las rutas requieren sesión, incluyendo el flujo SSE que actualiza la interfaz. No se publican credenciales de Dropea ni los archivos de autenticación de Baileys.

Validación: 69 pruebas de servidor y 27 pruebas de interfaz; incluye simulación de confirmaciones, duplicados, historial, atención humana y respuestas manuales. Las pruebas no envían mensajes reales ni crean pedidos en Dropea.

Las secciones visitadas conservan datos y filtros en memoria durante la navegación. React Activity suspende los efectos de las páginas ocultas y revalida al regresar sin vaciar la última lectura. La memoria se destruye al cerrar sesión; no se guardan conversaciones en el almacenamiento local del navegador. WhatsApp utiliza la altura de la ventana con desplazamiento interno. Clientes muestra porcentaje de entrega y tiempo medio en su listado, con acceso desde el chat mediante Ver estadísticas.
