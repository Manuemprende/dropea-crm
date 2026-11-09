# 🚀 Dropea CRM · By Wentix AI (Community Edition)

> **Centro de Operaciones y Automatización E-Commerce para Dropshipping & COD (Cash On Delivery)**  
> Conectado nativamente con **Dropea** (Chile, España, Italia, Portugal, México), **Meta Ads**, **TikTok Ads** y **WhatsApp** (Baileys QR & Meta Cloud API).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: 24+](https://img.shields.io/badge/Node.js-24%2B-green.svg)](https://nodejs.org/)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![Vite: 6+](https://img.shields.io/badge/Vite-6%2B-purple.svg)](https://vitejs.dev/)
[![Status: Production Ready](https://img.shields.io/badge/Status-Production%20Ready-emerald.svg)](#)

---

## 📖 Tabla de Contenidos

1. [¿Qué es Dropea CRM?](#-qué-es-dropea-crm)
2. [Arquitectura del Sistema](#-arquitectura-del-sistema)
3. [Módulos y Características Principales](#-módulos-y-características-principales)
4. [Requisitos Previos](#-requisitos-previos)
5. [Instalación Rápida](#-instalación-rápida)
6. [Guía de Credenciales y Conexiones](#-guía-de-credenciales-y-conexiones)
   - [1. Integración con Dropea](#1-integración-con-dropea)
   - [2. Meta Ads (Graph API v20.0)](#2-meta-ads-graph-api-v200)
   - [3. TikTok Marketing API](#3-tiktok-marketing-api)
   - [4. WhatsApp: Conexión QR Directa (Baileys)](#4-whatsapp-conexión-qr-directa-baileys)
   - [5. WhatsApp: Meta Cloud API Oficial](#5-whatsapp-meta-cloud-api-oficial)
   - [6. Live Landings & Pixel Tracking](#6-live-landings--pixel-tracking)
7. [Calculadora Proyecto Libertad (Drop Profit Calculator)](#-calculadora-proyecto-libertad)
8. [Despliegue en Producción (VPS Ubuntu con Nginx y SSL)](#-despliegue-en-producción-vps-ubuntu)
9. [Seguridad y Protección de Datos](#-seguridad-y-protección-de-datos)
10. [Licencia Legal (MIT) & Comunidad](#-licencia-legal-mit--comunidad)

---

## 💡 ¿Qué es Dropea CRM?

**Dropea CRM** es una plataforma de código abierto desarrollada por **Wentix AI** y la comunidad de dropshippers para unificar en un solo panel de control:

- **La operativa logística:** Conexión en tiempo real con las cuentas de Dropea para múltiples países.
- **La pauta publicitaria:** Monitorización y reglas de auto-escalado / stop-loss para Meta Ads y TikTok Ads.
- **La confirmación y retención de pedidos:** Bot inteligente de WhatsApp que contacta al comprador de inmediato, responde dudas frecuentes sobre tiempos y medios de pago, y confirma o cancela el despacho antes de enviarlo a bodega, reduciendo drásticamente las devoluciones (RTO).
- **El seguimiento de embudo:** Live Landings con mapa en vivo de visitantes, carritos y pedidos en tiempo real.

---

## 🏛 Arquitectura del Sistema

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          Dropea CRM (Frontend)                         │
│           React 19 + TypeScript + Vite + Tailwind + Phosphor           │
│        (Diseño Mobile-First optimizado para Smartphone y Desktop)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / Server-Sent Events (SSE)
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Express Backend (Node.js 24)                     │
├───────────────────────────────────┬────────────────────────────────────┤
│ 📦 Motores Integrados:            │ 🔒 Seguridad & Almacenamiento:     │
│  • Core Dropea API (REST v2)      │  • SQLite Nativo (node:sqlite)     │
│  • Meta Ads Graph API (v20.0)     │  • Cifrado AES-256-GCM             │
│  • WhatsApp Agent (Baileys QR)    │  • Autenticación con Salt & Hash   │
│  • WhatsApp Meta Cloud API Engine │  • Aislamiento por Mercado/Tenant  │
│  • Live Landings & Geo Tracker    │  • Webhooks HMAC SHA-256           │
└───────────────────┬───────────────┴─────────────────┬──────────────────┘
                    │                                 │
     ┌──────────────▼──────────────┐   ┌──────────────▼─────────────┐
     │      Servicios Externos     │   │      Canales de Venta      │
     │  • Dropea API (CL/ES/IT/PT) │   │  • Landings Externas (JS)  │
     │  • Meta Graph API (Ads/WA)  │   │  • Shopify / WooCommerce   │
     │  • TikTok Marketing API     │   │  • WhatsApp Buyer Direct   │
     └─────────────────────────────┘   └────────────────────────────┘
```

---

## ✨ Módulos y Características Principales

### 1. Panel de Pedidos Multipaís
- Visualización unificada de pedidos por estado: *Todos*, *Pendientes*, *En camino*, *Entregados*, *Cancelados* y *Alto Riesgo*.
- Filtros por país: **Chile (CL)**, **España (ES)**, **Italia (IT)**, **Portugal (PT)** y **México (MX)**.
- Formato adaptativo: Tabla avanzada en escritorio y tarjetas táctiles con ficha desplegable en celulares.
- Exportación en CSV sanitizado contra inyecciones de fórmulas.

### 2. Gestor de Anuncios (Meta & TikTok Ads)
- Sincronización en vivo con **Meta Graph API v20.0** y **TikTok Marketing API**.
- Desglose jerárquico: Campañas ➔ Conjuntos de Anuncios ➔ Creativos.
- Reproductor de video HD y visualizador modal de creativos en vivo.
- **Motor de Reglas Automáticas**:
  - *Auto-Scale:* Incrementa +20% el presupuesto diario de campañas ganadoras con alto volumen de pedidos.
  - *Stop-Loss (Kill Switch):* Pausa automáticamente anuncios o campañas con gasto superior al umbral configurado sin ventas.

### 3. Calculadora de Precios Dropshipping (Proyecto Libertad)
- Basada en el modelo de reversa financiera para e-commerce COD:
  - Meta mensual de facturación ($).
  - Cálculo de pedidos necesarios por día y mes.
  - Presupuesto publicitario diario recomendado.
  - CPA máximo permisible para mantener márgenes saludables.
  - Calculadora de producto: Costo proveedor, flete promedio, tasa de entrega (COD), IVA y precio sugerido.

### 4. WhatsApp Confirmation & Retention Hub
- **Doble Modalidad**:
  - **Baileys Multi-Device (QR):** Vinculación directa con el teléfono del negocio sin costos por mensaje ni aprobaciones previas.
  - **Meta Cloud API Oficial:** Conexión mediante WABA y System User Token con validación en vivo.
- Mensaje saliente instantáneo al recibir pedido desde una landing con variables dinámicas reales (nombre, producto, comuna, total).
- Detección inteligente de respuestas del comprador:
  - *Confirmación:* Crea o confirma el pedido en Dropea automáticamente.
  - *Cancelación:* Anula el pedido y libera stock sin costo de despacho.
  - *Preguntas frecuentes:* Responde automáticamente plazos de entrega, garantías y medios de pago.
  - *Atención Humana:* Pausa la automatización en el chat para traspaso al operador.
- Bandeja de entrada en vivo con historial, avatares, notas internas y evaluación de cliente (tasa de entrega histórica).

### 5. Live Landings & Geolocalización
- Mapa interactivo de visitantes en vivo.
- Registro de sesiones, carritos y pedidos en tiempo real.
- Snippet ligero de JavaScript para incrustar en cualquier landing page externa.

---

## 📋 Requisitos Previos

- **Node.js**: Versión 24.x o superior LTS.
- **NPM**: Versión 10.x o superior.
- **Sistema Operativo**: Linux (Ubuntu 22.04+ recomendado para VPS), macOS o Windows.
- **Memoria RAM**: Mínimo 1 GB (2 GB recomendado para producción con Baileys).

---

## ⚡ Instalación Rápida

### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/dropea-crm.git
cd dropea-crm
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Copia la plantilla de entorno:
```bash
cp .env.example .env
```
Edita `.env` con tus preferencias (consulta la sección [Guía de Credenciales](#-guía-de-credenciales-y-conexiones)).

### 4. Compilar y ejecutar
**Modo Desarrollo:**
```bash
npm run dev
```
Accede en tu navegador a: `http://localhost:5173`

**Modo Producción:**
```bash
npm run build
npm start
```
El servidor escuchará en el puerto configurado (predeterminado: `http://localhost:3001`).

---

## 🔑 Guía de Credenciales y Conexiones

### 1. Integración con Dropea
Para sincronizar pedidos, productos y catálogo:
1. Inicia sesión en tu cuenta de [Dropea](https://dropea.com/).
2. Ve a **Configuración** ➔ **API Keys**.
3. Genera una nueva API Key con permisos de lectura y escritura para pedidos, productos y tiendas.
4. En Dropea CRM, ve a **Integración Dropea**, selecciona el país (CL, ES, IT, PT, MX) e ingresa la **API Key**.
5. (Opcional) Si usarás Webhooks de Dropea, ingresa el **Signing Secret** para verificar la firma HMAC SHA-256.

### 2. Meta Ads (Graph API v20.0)
Para sincronizar tus campañas, conjuntos, creativos y métricas:
1. Entra en [Meta for Developers](https://developers.facebook.com/) y crea una App de tipo **Business**.
2. Ve al **Business Manager** ➔ **Usuarios del Sistema (System Users)**.
3. Genera un **System User Access Token** permanente con los siguientes permisos:
   - `ads_read`
   - `ads_management`
   - `read_insights`
4. Copia el identificador de tu cuenta publicitaria (ejemplo: `act_123456789012345`).
5. En Dropea CRM, ve a **Meta & TikTok Ads** ➔ **Configuración Meta Graph API**, ingresa el Account ID, el Token y el Pixel ID, y presiona **Guardar y Verificar**.

### 3. TikTok Marketing API
Para gestionar pauta en TikTok:
1. Regístrate en [TikTok for Business Developer Center](https://business-api.tiktok.com/).
2. Crea tu aplicación y obtén tu **App ID**, **Secret Key** y **Access Token**.
3. Obtén tu **Advertiser ID** desde TikTok Ads Manager.
4. En Dropea CRM, ingresa tus datos en la pestaña de TikTok y guarda las credenciales.

### 4. WhatsApp: Conexión QR Directa (Baileys) ⭐ *Recomendada*
Es la opción nativa más potente y sin costos:
1. En Dropea CRM, entra a **Canales** ➔ **WhatsApp**.
2. Selecciona la pestaña **Conexión directa por QR (Baileys)**.
3. Haz clic en **Vincular con QR**.
4. En tu teléfono (WhatsApp Business o normal): Ve a **Dispositivos Vinculados** ➔ **Vincular un dispositivo** y escanea el código que aparece en pantalla.
5. ¡Listo! En segundos tu número quedará enlazado para despachar mensajes automáticos a cada comprador.

### 5. WhatsApp: Meta Cloud API Oficial
Para operar con la API oficial de Meta para empresas:
1. En Meta for Developers, añade el producto **WhatsApp**.
2. Obtén tu **Phone Number ID** y tu **WhatsApp Business Account ID (WABA)**.
3. Genera un Token Permanente con permiso `whatsapp_business_messaging`.
4. En Dropea CRM, entra a **Canales** ➔ **WhatsApp** ➔ **WhatsApp Business API (Meta Cloud)**.
5. Pega el Token, Phone Number ID y WABA ID, y haz clic en **Guardar y Validar Conexión con Meta**. El CRM consultará en vivo a Meta para validar la calidad del número y su verificación.
6. Puedes enviar un mensaje de prueba ingresando tu teléfono en el panel inferior.

### 6. Live Landings & Pixel Tracking
Para capturar pedidos y visitantes desde tus páginas de venta:
1. En Dropea CRM, ve a **Live Landings** ➔ **Conectar Landing**.
2. Define el nombre de la oferta, URL y país destino. El sistema generará un identificador único (`public_id`) y una llave secreta (`X-Landing-Key`).
3. Inserta el script de tracking en el `<head>` de tu landing page:
```html
<script src="https://tu-dominio-crm.com/api/landing-tracker.js?id=TU_PUBLIC_ID" async></script>
```
4. El script captura eventos de visita, añade el formulario contra entrega y envía las órdenes seguras al endpoint:
`POST /api/landings/{public_id}/orders` con encabezado `X-Landing-Key: TU_LLAVE`.

---

## 📊 Calculadora Proyecto Libertad

La calculadora integrada permite proyectar con precisión quirúrgica tus finanzas:

$$\text{Pedidos Mes} = \frac{\text{Meta de Facturación mensual}}{\text{Ticket Promedio de Venta}}$$

$$\text{Gasto Diario Meta} = \text{Pedidos Día} \times \text{CPA Objetivo}$$

$$\text{Precio Sugerido} = \frac{\text{Costo Producto} + \text{Flete Promedio} + \text{CPA Objetivo}}{\text{Tasa de Entrega Real (COD)} \times (1 - \text{Margen Deseado})}$$

---

## 🖥 Despliegue en Producción (VPS Ubuntu)

### 1. Preparar el Servidor
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx git
```

### 2. Instalar y Compilar el CRM
```bash
cd /var/www
sudo git clone https://github.com/tu-usuario/dropea-crm.git
cd dropea-crm
sudo npm install
sudo npm run build
```

### 3. Servicio de Sistema (systemd)
Crea el archivo de servicio `/etc/systemd/system/dropea-crm.service`:
```ini
[Unit]
Description=Dropea CRM Node.js Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/dropea-crm
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001
EnvironmentFile=/var/www/dropea-crm/.env

[Install]
WantedBy=multi-user.target
```

Inicia y habilita el servicio:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dropea-crm
```

### 4. Nginx Reverse Proxy & SSL
Configura tu sitio en `/etc/nginx/sites-available/dropeacrm`:
```nginx
server {
    server_name tu-dominio-crm.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Habilita el sitio y genera tu certificado SSL gratuito:
```bash
sudo ln -s /etc/nginx/sites-available/dropeacrm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tu-dominio-crm.com
```

---

## 🔒 Seguridad y Protección de Datos

- **Cifrado de alta seguridad:** Todas las credenciales sensibles (tokens de WhatsApp, API keys y secretos) se almacenan cifradas con **AES-256-GCM** mediante la clave de entorno `CONNECTION_ENCRYPTION_KEY`.
- **Protección de rutas:** Autenticación por sesión protegida con cookie `HttpOnly`, `SameSite=Lax` y contraseñas hasheadas con algoritmo seguro.
- **Aislamiento absoluto:** Los datos locales en SQLite están estrictamente separados por mercado y origen.
- **Exclusiones de Git:** Archivos `.env`, bases de datos SQLite (`data/*.db`), sesiones de WhatsApp y certificados están excluidos en `.gitignore` para prevenir fugas accidentales.

---

## ⚖ Licencia Legal (MIT) & Comunidad

Este proyecto es software libre y de código abierto bajo los términos de la **[Licencia MIT](LICENSE)**.

```text
Copyright (c) 2026 Wentix AI / Comunidad Dropea CRM
Autor y Mantenedor: Manuel Bustos & Wentix AI Community
```

Puedes utilizarlo, modificarlo, redistribuirlo o implementarlo en tu negocio sin costos de licencia. La única condición legal es mantener el aviso de copyright y la atribución a la comunidad de **Wentix AI**.

---

<p align="center">
  Hecho con dedicación por y para la comunidad dropshipping de <strong>Wentix AI</strong> · 2026
</p>
