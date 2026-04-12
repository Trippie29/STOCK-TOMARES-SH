# StockControl — App de gestión de stock en tiempo real

## Tecnologías
- **React** (frontend)
- **Supabase** (base de datos en tiempo real)
- **Vercel** (hosting gratuito)

## Cómo publicar en Vercel (5 pasos)

### Opción A — Sin código (recomendada)

1. Ve a [vercel.com](https://vercel.com) y crea una cuenta gratuita con GitHub
2. Sube esta carpeta a un repositorio de GitHub:
   - Ve a [github.com](https://github.com), crea un repo nuevo
   - Sube todos los archivos de esta carpeta
3. En Vercel → "Add New Project" → selecciona tu repo de GitHub
4. Vercel detecta React automáticamente → pulsa "Deploy"
5. En ~2 minutos tendrás una URL pública como `https://tu-tienda-stock.vercel.app`

### Opción B — Con terminal (si tienes Node.js instalado)

```bash
cd stock-app
npm install
npm run build         # genera la carpeta /build
npx vercel --prod     # sube a Vercel
```

## Uso de la app

### Añadir productos
- Botón "+ Nuevo producto" → rellena nombre, categoría, stock y precio
- El producto aparece al instante en la tabla

### Registrar una venta
- En cualquier producto → "− Venta" → introduce las unidades vendidas
- El stock se actualiza automáticamente en todos los dispositivos

### Añadir stock (entrada de mercancía)
- En cualquier producto → "+ Entrada" → añade 1 unidad (o edita el producto para cantidades mayores)

### Alertas automáticas
- 🟡 **Stock bajo**: cuando quedan igual o menos unidades que el mínimo configurado
- 🔴 **Sin stock**: cuando llega a 0

### Historial
- Botón "📋 Historial" → ver todos los movimientos con fecha y hora

## Tiempo real
La app usa WebSockets de Supabase. Cualquier cambio (venta, entrada, nuevo producto)
se refleja al instante en todos los dispositivos que tengan la app abierta.

## Estructura de archivos
```
stock-app/
├── public/index.html
├── src/
│   ├── index.js       # entrada React
│   ├── App.js         # lógica y UI completa
│   ├── App.css        # estilos
│   └── supabase.js    # conexión a Supabase
├── package.json
└── vercel.json
```
