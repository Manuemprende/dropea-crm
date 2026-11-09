# Landings → WhatsApp → Dropea

En el CRM, abre **WhatsApp** y vincula el teléfono del negocio mediante el QR.
Después abre **Landings** y crea una conexión por oferta: nombre de campaña,
país, ID de producto y nombre de tienda para WhatsApp. El precio fijo es opcional:
puedes enviarlo como `unit_price` desde el servidor de tu plataforma. La variante
se resuelve automáticamente cuando hay una sola; con varias, elige cuál vender.
Si solo hay una tienda activa en Dropea, también se asigna automáticamente.

La landing y el formulario los creas en tu plataforma habitual. En la conexión
pulsa **API / JSON** y **Copiar instrucciones para mi plataforma**. El bloque
incluye URL del receptor, método POST, JSON, campos obligatorios y tratamiento
de respuestas. No necesitas insertar un formulario adicional.

La URL es opcional para una integración desde el servidor de tu plataforma con
`X-Landing-Key`. Si envías directamente desde el navegador, registra la URL HTTPS
para autorizar su origen exacto y configura un precio fijo; en ese modo no se
expone una clave privada ni se aceptan precios enviados por el navegador.
Puedes añadir o actualizar la URL después de crear la conexión.

La clave es específica de la landing, no es la API Key de Dropea. Se muestra al
crear la conexión; si la pierdes puedes generar una nueva en **API / JSON**.
Esto invalida la anterior y debes actualizarla en el servidor de tu plataforma.

El formulario listo para insertar sigue disponible como opción secundaria cuando
hay una URL registrada. Los formularios actuales no se modifican automáticamente.

## Formulario propio

`POST https://dropeacrm.cyou/api/landings/IDENTIFICADOR_PUBLICO/orders`

Desde el navegador, la solicitud debe llevar el origen HTTPS exacto registrado
para esa landing. El identificador público permite enviar un formulario, no leer
pedidos. Desde un backend, utiliza la clave específica de esa landing en el
encabezado `X-Landing-Key`. La clave solo se muestra al crear la conexión.

```json
{
  "request_id": "UN-UUID-POR-PEDIDO",
  "first_name": "Nombre",
  "last_name": "Apellido",
  "email": "cliente@example.com",
  "phone": "+56912345678",
  "address": "Calle y número",
  "city": "Santiago",
  "state": "Metropolitana",
  "postal_code": "",
  "quantity": 1,
  "consent": true,
  "website": ""
}
```

Obtén el consentimiento del comprador mediante una casilla explícita antes de
enviar `consent: true`. El teléfono debe incluir el prefijo internacional. El
código postal es obligatorio fuera de Chile. `website` es un campo trampa que
debe quedar vacío. Cantidad: 1–5.

Puedes incluir `product_id` en el JSON para comprobar que corresponde a la conexión.
El servidor asigna país, moneda, tienda y variante desde la configuración. Si hay
un precio fijo, también lo asigna desde la conexión. Sin precio fijo, exige un
`unit_price` positivo enviado desde el backend autenticado con `X-Landing-Key`;
la validación del precio real de la oferta debe hacerse en ese backend. La misma
referencia de pedido no admite cambiar el precio al reintentar. En todos los casos,
no acepta que el visitante cambie esos valores. Conserva el mismo `request_id`
al reintentar el mismo pedido. Respuesta 202: `{ "id": "...", "state":
"WA_PENDING", "duplicate": false }`. Esto significa recibido, todavía sin
despacho. No devuelve datos personales ni el código de confirmación.

## Confirmación y estados

El sistema envía el resumen automáticamente al recibir el formulario: no hace
falta abrir el chat ni pulsar Enviar. Identifica a la tienda e incluye una referencia
de pedido, nombre del comprador, producto, dirección y total contra entrega.
Si llegan varios pedidos, se procesan por orden de llegada, con un intervalo mínimo
de cinco segundos entre mensajes. La sincronización del catálogo y las respuestas
lentas de Dropea no bloquean el proceso de WhatsApp. Los contadores de la pantalla
WhatsApp muestran los pedidos en cola y los que esperan respuesta.

El comprador responde «sí», «confirmo», «sí, confirmo», «todo correcto» u otra
expresión afirmativa admitida desde su WhatsApp. El servidor busca la asociación
activa entre ese teléfono y un pedido pendiente cuyo mensaje ya se solicitó enviar.
No hace falta copiar un código cuando hay un único pedido pendiente.

Si hay varios pedidos pendientes para el mismo teléfono, una respuesta genérica
no selecciona ninguno: el sistema envía una aclaración por la misma cola. El cliente
puede usar **Responder** sobre el mensaje del pedido en WhatsApp, o indicar
`CONFIRMO REFERENCIA`. Se aceptan referencias abreviadas de al menos dos caracteres
si son únicas, también frente a referencias de pedidos recientes ya cerrados.
Una referencia incorrecta no se sustituye automáticamente por otro pedido.

Las preguntas y respuestas con cambios, como «sí pero cambia la dirección», no
confirman. No se utiliza coincidencia de palabras sueltas dentro de cualquier frase.
Los IDs de mensajes se registran para evitar reprocesar respuestas, y las respuestas
citadas o con fechas anteriores al pedido no se reasignan a compras nuevas.

La asociación activa termina al confirmar, cancelar o vencer, aunque el teléfono
permanece en el historial del pedido. El comprador puede realizar otra compra y
confirmarla de nuevo desde el mismo número.

Solo entonces el servidor crea el pedido contra entrega y solicita su confirmación
en Dropea. «Cancelar» cancela cuando hay un único pedido pendiente; con varios,
se aplica la misma aclaración de referencia o respuesta citada. Sin respuesta vence
a las 24 horas. El mensaje muestra «Total a pagar».

En **Pedidos → Pedidos de landings** se muestran los estados y errores por país.
Si el envío por WhatsApp quedó ambiguo tras una desconexión, revisa el chat antes
de pulsar Reenviar. Los reintentos de Dropea conservan las claves de idempotencia
y consultan las operaciones pendientes para evitar creaciones duplicadas.

Permisos de Dropea necesarios: `orders:create`, `orders:confirm`, `orders:read`,
`stores:read` y `products:read` para elegir desde el catálogo. Dropea sigue
validando dirección, stock y reglas de despacho. Una confirmación del cliente
no garantiza que Dropea acepte el pedido.

El teléfono se vincula usando Baileys. Sus credenciales se guardan cifradas en
SQLite con la clave del servidor. Al reiniciar se recupera la vinculación, mientras
el dispositivo siga autorizado en WhatsApp. Sin conexión, los pedidos quedan
en cola. Un cambio de la API Key bloquea el envío de las conexiones anteriores
para evitar usar otra cuenta por accidente; configura una nueva conexión y revisa
los pedidos anteriores antes de gestionarlos.

Este módulo utiliza el workspace administrativo existente. Aún no ofrece cuentas
independientes ni aislamiento entre miembros de una comunidad.

## Visitas y campañas en vivo

El menú **Live / Landings** permite conectar el seguimiento de tu página publicada y asociarlo a estas conexiones de pedidos. Consulta [la guía completa](docs/LIVE_LANDINGS.md). No incluye claves privadas en el script del navegador.
