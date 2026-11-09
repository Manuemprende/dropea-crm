import type { Data, Order } from './types';

const customers = [
  { name: 'Catalina Aravena', phone: '+56987654321', city: 'Santiago', address: 'Av. Providencia 1345, Depto 402', province: 'Región Metropolitana' },
  { name: 'Matías Valenzuela', phone: '+56976543210', city: 'Viña del Mar', address: 'Calle Los Leones 234', province: 'Valparaíso' },
  { name: 'Francisca Mella', phone: '+56965432109', city: 'Concepción', address: 'Av. Bernardo OHiggins 1290, Piso 3', province: 'Biobío' },
  { name: 'Sebastián Rojas', phone: '+56954321098', city: 'La Serena', address: 'Av. del Mar 4500, Torre B', province: 'Coquimbo' },
  { name: 'Antonia Fuentes', phone: '+56943210987', city: 'Temuco', address: 'Av. Alemania 540', province: 'Araucanía' },
  { name: 'Benjamín Soto', phone: '+56932109876', city: 'Antofagasta', address: 'Av. Angamos 890', province: 'Antofagasta' },
  { name: 'Javiera Contreras', phone: '+56921098765', city: 'Santiago', address: 'Pje. El Canelo 45, Maipú', province: 'Región Metropolitana' },
  { name: 'Tomás Sepúlveda', phone: '+56910987654', city: 'Rancagua', address: 'Calle Independencia 780', province: 'OHiggins' },
  { name: 'Isidora Pizarro', phone: '+56999887766', city: 'Valdivia', address: 'Av. Ramón Picarte 120', province: 'Los Ríos' },
  { name: 'Nicolás Baeza', phone: '+56988776655', city: 'Puerto Montt', address: 'Calle Diego Portales 310', province: 'Los Lagos' },
  { name: 'Camila Leiva', phone: '+56977665544', city: 'Santiago', address: 'Av. Las Condes 8900', province: 'Región Metropolitana' },
  { name: 'Vicente Salinas', phone: '+56966554433', city: 'Talca', address: 'Calle 1 Sur 940', province: 'Maule' },
];

const carriers = ['Blue Express', 'Starken', 'Chilexpress'];

export const demoProducts = [
  { id: 1, name: 'Audífonos inalámbricos Pro', status: 'PUBLIC', variants: [{ variant_id: 11, stock: 148, wholesale_price: 8990 }] },
  { id: 2, name: 'Organizador de cocina extensible', status: 'PUBLIC', variants: [{ variant_id: 12, stock: 86, wholesale_price: 6490 }] },
  { id: 3, name: 'Lámpara de escritorio recargable', status: 'PUBLIC', variants: [{ variant_id: 13, stock: 214, wholesale_price: 9990 }] },
  { id: 4, name: 'Botella térmica 750 ml', status: 'PUBLIC', variants: [{ variant_id: 14, stock: 63, wholesale_price: 4990 }] },
];

export function makeDemo(): Data {
  const orders: Order[] = Array.from({ length: 86 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(i / 9));
    date.setHours(8 + (i % 13), (i * 13) % 60, 0, 0);
    if (date > new Date()) date.setDate(date.getDate() - 1);
    const product = demoProducts[i % 4];
    const price = [24990, 18990, 29990, 14990][i % 4];
    const status = ['PENDING', 'PROCESSING', 'SHIPPING', 'FINISH', 'FINISH', 'CONFIRMED', 'FINISH', 'FINISH'][i % 8];
    const cust = customers[i % customers.length];
    const carrier = carriers[i % carriers.length];

    // Substatus with realistic delivery vs rejection behavior
    let sub_status: string | undefined = undefined;
    if (status === 'FINISH') {
      if (i % customers.length === 3) {
        sub_status = 'CANCELLED';
      } else if (i % 11 === 0) {
        sub_status = 'CANCELLED';
      } else {
        sub_status = 'DELIVERED';
      }
    } else if (status === 'PROCESSING') {
      sub_status = 'PICKING';
    } else if (status === 'SHIPPING') {
      sub_status = i % 2 === 0 ? 'OUT_FOR_DELIVERY' : 'IN_TRANSIT';
    }

    return {
      id: 1086 - i,
      order_code: `ORD-${1086 - i}`,
      status,
      sub_status,
      total_amount: price * (i % 7 === 0 ? 2 : 1),
      currency: 'CLP',
      store_id: (i % 3) + 1,
      created_at: date.toISOString(),
      estimated_profit: price * 0.32,
      carrier,
      shipping_company: carrier,
      tracking_number: `${carrier.substring(0, 2).toUpperCase()}-${849200 + i}`,
      shipping_address: {
        full_name: cust.name,
        phone_number: cust.phone,
        city: cust.city,
        address_line_1: cust.address,
        province: cust.province,
        email: `${cust.name.toLowerCase().replace(/\s+/g, '.')}@example.com`
      },
      line_items: [
        {
          product_id: product.id,
          variant_id: 11 + (i % 4),
          product_name: product.name,
          quantity: i % 7 === 0 ? 2 : 1,
          unit_price: price
        }
      ]
    };
  });

  return {
    orders,
    products: demoProducts,
    shops: [
      { id: 1, name: 'Tienda principal', store_type: 'SHOPIFY', domain: 'tienda-ejemplo.myshopify.com' },
      { id: 2, name: 'Venta directa', store_type: 'GENERIC' },
      { id: 3, name: 'Segunda tienda', store_type: 'SHOPIFY' }
    ],
    issues: [
      { id: 201, order_id: 1080, status: 'PENDING', is_active: true, description: 'Dirección de entrega incompleta' },
      { id: 202, order_id: 1065, status: 'MANAGING_WITH_CLIENT', is_active: true, description: 'Destinatario ausente' }
    ],
    events: []
  };
}
