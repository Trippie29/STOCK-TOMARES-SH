import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import './App.css'

const OPENAI_KEY = ['sk-proj-WUCN3UA','1g2h-gRCqSJ2YGd','gOYNTR3jwudNegM','bhcwmFFytR718-2','LzcDQNh1Z2e2-OI','JKk71-zT3BlbkFJ','zb0PWnkjJI09hpt','8vxdaEbn0Tn1KO_','uGZ02OyRboRxqcG','aF1nurCvE0vLxXe','ySwAUNVCVsW-cA'].join('')

const CATEGORIAS_TREE = [
  { nombre: 'Nicotina', sub: [] },
  { nombre: 'Bases', sub: [] },
  { nombre: 'Sales de Nicotina', sub: [] },
  { nombre: 'Bolsas / Pouches', sub: ['Bolsas de Nicotina', 'Bolsas de Cafeina'] },
  { nombre: 'Liquidos', sub: [] },
  { nombre: 'Desechables', sub: [] },
  { nombre: 'Pods', sub: [] },
  { nombre: 'Mods', sub: [] },
  { nombre: 'Resistencias', sub: [] },
  { nombre: 'Accesorios', sub: [] },
  { nombre: 'Otros', sub: [] },
]

const CATEGORIAS_SELECTOR = CATEGORIAS_TREE.flatMap(c =>
  c.sub.length > 0
    ? c.sub.map(s => ({ label: c.nombre + ' > ' + s, value: s, grupo: c.nombre }))
    : [{ label: c.nombre, value: c.nombre, grupo: null }]
)

const TODAS_CATS = ['Todas', ...CATEGORIAS_TREE.flatMap(c =>
  c.sub.length > 0 ? [c.nombre, ...c.sub] : [c.nombre]
)]

function timeAgo(ts) {
  if (!ts) return '-'
  const s = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (s < 60) return 'ahora mismo'
  if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min'
  if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h'
  return new Date(ts).toLocaleDateString('es-ES')
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={'modal' + (wide ? ' modal-wide' : '')} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        {children}
      </div>
    </div>
  )
}



function InformeTab({ movimientos, productos }) {
  const [periodo, setPeriodo] = React.useState('hoy')
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const getInicio = () => {
    const d = new Date(hoy)
    if (periodo === 'hoy') return d
    if (periodo === 'semana') { d.setDate(d.getDate() - 6); return d }
    d.setDate(1); return d
  }

  const inicio = getInicio()
  const movPeriodo = movimientos.filter(m => new Date(m.created_at) >= inicio)
  const ventasPeriodo = movPeriodo.filter(m => m.tipo === 'venta')
  const entradasPeriodo = movPeriodo.filter(m => m.tipo === 'entrada')
  const totalVendidas = ventasPeriodo.reduce((s, m) => s + Math.abs(m.cantidad), 0)
  const totalEntradas = entradasPeriodo.reduce((s, m) => s + m.cantidad, 0)
  const sinStock = productos.filter(p => p.stock_actual === 0).length
  const stockBajo = productos.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo).length

  const ventasPorProducto = {}
  ventasPeriodo.forEach(m => {
    const nombre = m.productos ? m.productos.nombre : 'Desconocido'
    if (!ventasPorProducto[nombre]) ventasPorProducto[nombre] = 0
    ventasPorProducto[nombre] += Math.abs(m.cantidad)
  })
  const topVentas = Object.entries(ventasPorProducto).sort((a, b) => b[1] - a[1]).slice(0, 15)
  const maxVenta = topVentas.length > 0 ? topVentas[0][1] : 1

  const ventasPorCat = {}
  ventasPeriodo.forEach(m => {
    const prod = productos.find(p => p.id === m.producto_id)
    const cat = prod ? prod.categoria : 'Otros'
    if (!ventasPorCat[cat]) ventasPorCat[cat] = 0
    ventasPorCat[cat] += Math.abs(m.cantidad)
  })
  const topCats = Object.entries(ventasPorCat).sort((a, b) => b[1] - a[1])
  const maxCat = topCats.length > 0 ? topCats[0][1] : 1

  const dias7 = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(d.getDate() - i)
    const label = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
    const total = movimientos.filter(m => {
      const md = new Date(m.created_at)
      md.setHours(0,0,0,0)
      return md.getTime() === d.getTime() && m.tipo === 'venta'
    }).reduce((s, m) => s + Math.abs(m.cantidad), 0)
    dias7.push({ label, total })
  }
  const maxDia = Math.max(...dias7.map(d => d.total), 1)
  const fechaHoy = hoy.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="historial">
      <div className="informe-header">
        <div className="informe-fecha">{fechaHoy}</div>
        <div className="periodo-tabs">
          {[['hoy','Hoy'],['semana','Esta semana'],['mes','Este mes']].map(([v,l]) => (
            <button key={v} className={'periodo-btn' + (periodo === v ? ' active' : '')} onClick={() => setPeriodo(v)}>{l}</button>
          ))}
          <button className="periodo-btn export-btn" onClick={() => exportarInformePDF({ periodo, fechaHoy, totalVendidas, totalEntradas, stockBajo, sinStock, topVentas, topCats, dias7 })}>📄 Exportar PDF</button>
        </div>
      </div>
      <div className="metrics" style={{marginBottom: '1.5rem'}}>
        <div className="metric"><div className="metric-label">Uds vendidas</div><div className="metric-value">{totalVendidas}</div></div>
        <div className="metric"><div className="metric-label">Uds recibidas</div><div className="metric-value">{totalEntradas}</div></div>
        <div className="metric warn"><div className="metric-label">Stock bajo</div><div className="metric-value">{stockBajo}</div></div>
        <div className="metric danger"><div className="metric-label">Sin stock</div><div className="metric-value">{sinStock}</div></div>
      </div>
      <div className="graf-titulo">Ventas por dia (ultimos 7 dias)</div>
      <div className="graf-barras">
        {dias7.map((d, i) => (
          <div key={i} className="graf-col">
            <div className="graf-bar-wrap">
              <div className="graf-bar-val">{d.total > 0 ? d.total : ''}</div>
              <div className="graf-bar" style={{height: Math.max(4, (d.total / maxDia) * 140) + 'px'}} />
            </div>
            <div className="graf-label">{d.label}</div>
          </div>
        ))}
      </div>
      <div className="informe-grid" style={{marginTop: '1.5rem'}}>
        <div className="informe-col">
          <div className="informe-titulo">Top productos mas vendidos</div>
          {topVentas.length === 0
            ? <div className="empty" style={{padding: '1.5rem 0'}}>Sin ventas en este periodo</div>
            : topVentas.map(([nombre, qty], i) => (
              <div key={nombre} className="rank-row">
                <span className="rank-num">{i + 1}</span>
                <div className="rank-info">
                  <div className="rank-nombre">{nombre}</div>
                  <div className="rank-bar-wrap">
                    <div className="rank-bar" style={{width: Math.max(4, (qty / maxVenta) * 100) + '%'}} />
                  </div>
                </div>
                <span className="rank-qty">-{qty}</span>
              </div>
            ))
          }
        </div>
        <div className="informe-col">
          <div className="informe-titulo">Ventas por categoria</div>
          {topCats.length === 0
            ? <div className="empty" style={{padding: '1.5rem 0'}}>Sin ventas en este periodo</div>
            : topCats.map(([cat, qty]) => (
              <div key={cat} className="rank-row">
                <div className="rank-info">
                  <div className="rank-nombre">{cat}</div>
                  <div className="rank-bar-wrap">
                    <div className="rank-bar rank-bar-cat" style={{width: Math.max(4, (qty / maxCat) * 100) + '%'}} />
                  </div>
                </div>
                <span className="rank-qty">{qty} uds</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

function exportarInformePDF({ periodo, fechaHoy, totalVendidas, totalEntradas, stockBajo, sinStock, topVentas, topCats, dias7 }) {
  const periodoLabel = periodo === 'hoy' ? 'Hoy' : periodo === 'semana' ? 'Esta semana' : 'Este mes'
  const maxDia = Math.max(...dias7.map(d => d.total), 1)
  const maxVenta = topVentas.length > 0 ? topVentas[0][1] : 1
  const maxCat = topCats.length > 0 ? topCats[0][1] : 1

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; background: #fff; color: #111; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #111; }
  .logo { font-size: 28px; font-weight: 900; letter-spacing: 0.1em; }
  .logo-sub { font-size: 10px; color: #2196f3; letter-spacing: 0.3em; text-transform: uppercase; margin-top: 2px; }
  .fecha { font-size: 11px; color: #666; text-align: right; }
  .periodo-badge { background: #111; color: #fff; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 20px; margin-top: 6px; display: inline-block; }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
  .metric { background: #f5f5f5; border-radius: 8px; padding: 16px; }
  .metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 6px; }
  .metric-value { font-size: 28px; font-weight: 700; }
  .metric-value.red { color: #e74c3c; }
  .metric-value.amber { color: #f39c12; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #666; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #eee; }
  .graf { display: flex; align-items: flex-end; gap: 8px; height: 120px; margin-bottom: 8px; }
  .graf-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
  .graf-bar { width: 100%; background: #2196f3; border-radius: 3px 3px 0 0; min-height: 3px; }
  .graf-label { font-size: 9px; color: #999; margin-top: 4px; text-align: center; }
  .graf-val { font-size: 9px; color: #333; margin-bottom: 2px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .rank-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
  .rank-num { font-size: 11px; color: #999; min-width: 18px; text-align: right; }
  .rank-nombre { font-size: 11px; color: #111; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rank-bar-wrap { width: 80px; background: #f0f0f0; border-radius: 2px; height: 4px; }
  .rank-bar { height: 4px; background: #2196f3; border-radius: 2px; }
  .rank-bar-cat { background: #fb923c; }
  .rank-qty { font-size: 11px; color: #666; min-width: 35px; text-align: right; }
  .empty { font-size: 12px; color: #999; padding: 16px 0; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #999; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">SINHUMO</div>
      <div class="logo-sub">GINES STOCK</div>
    </div>
    <div class="fecha">
      <div>${fechaHoy}</div>
      <div class="periodo-badge">${periodoLabel}</div>
    </div>
  </div>

  <div class="metrics">
    <div class="metric"><div class="metric-label">Uds vendidas</div><div class="metric-value">${totalVendidas}</div></div>
    <div class="metric"><div class="metric-label">Uds recibidas</div><div class="metric-value">${totalEntradas}</div></div>
    <div class="metric"><div class="metric-label">Stock bajo</div><div class="metric-value amber">${stockBajo}</div></div>
    <div class="metric"><div class="metric-label">Sin stock</div><div class="metric-value red">${sinStock}</div></div>
  </div>

  <div class="section">
    <div class="section-title">Ventas por dia (ultimos 7 dias)</div>
    <div class="graf">
      ${dias7.map(d => `
        <div class="graf-col">
          <div class="graf-val">${d.total > 0 ? d.total : ''}</div>
          <div class="graf-bar" style="height:${Math.max(3, (d.total / maxDia) * 100)}px"></div>
          <div class="graf-label">${d.label}</div>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="grid2">
    <div class="section">
      <div class="section-title">Top productos mas vendidos</div>
      ${topVentas.length === 0
        ? '<div class="empty">Sin ventas en este periodo</div>'
        : topVentas.map(([nombre, qty], i) => `
          <div class="rank-row">
            <span class="rank-num">${i + 1}</span>
            <span class="rank-nombre">${nombre}</span>
            <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.max(4, (qty / maxVenta) * 100)}%"></div></div>
            <span class="rank-qty">-${qty}</span>
          </div>
        `).join('')
      }
    </div>
    <div class="section">
      <div class="section-title">Ventas por categoria</div>
      ${topCats.length === 0
        ? '<div class="empty">Sin ventas en este periodo</div>'
        : topCats.map(([cat, qty]) => `
          <div class="rank-row">
            <span class="rank-nombre">${cat}</span>
            <div class="rank-bar-wrap"><div class="rank-bar rank-bar-cat" style="width:${Math.max(4, (qty / maxCat) * 100)}%"></div></div>
            <span class="rank-qty">${qty} uds</span>
          </div>
        `).join('')
      }
    </div>
  </div>

  <div class="footer">Sinhumo Gines Stock — Generado el ${new Date().toLocaleString('es-ES')}</div>
</body>
</html>`

  const ventana = window.open('', '_blank')
  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  setTimeout(() => ventana.print(), 500)
}

function estadoCaducidad(fecha) {
  if (!fecha) return { cls: 'nodate', label: 'Sin fecha', dias: null }
  const hoy = new Date()
  hoy.setHours(0,0,0,0)
  const f = new Date(fecha)
  const dias = Math.floor((f - hoy) / 86400000)
  if (dias < 0) return { cls: 'caducado', label: 'Caducado', dias }
  if (dias <= 30) return { cls: 'muypronto', label: 'Muy proximo', dias }
  if (dias <= 60) return { cls: 'pronto', label: 'Caduca pronto', dias }
  return { cls: 'ok', label: 'Correcto', dias }
}

function CaducidadesTab({ caducidades, cadBusqueda, setCadBusqueda, cadFiltro, setCadFiltro, supabase, showToast, esAdmin }) {
  const [cadFabricante, setCadFabricante] = React.useState('Todos')
  const [editando, setEditando] = React.useState(null)
  const [editFecha, setEditFecha] = React.useState('')

  const guardarEdicion = async () => {
    if (!editando) return
    const { error } = await supabase.from('caducidades').update({ fecha_caducidad: editFecha || null }).eq('id', editando.id)
    if (error) { showToast('Error al guardar', 'error'); return }
    showToast('Fecha actualizada')
    setEditando(null)
  }

  const eliminarCaducidad = async (id) => {
    if (!window.confirm('¿Eliminar este registro de caducidad?')) return
    await supabase.from('caducidades').delete().eq('id', id)
    showToast('Registro eliminado')
  }

  const filtros = [
    { value: 'todos', label: 'Todos' },
    { value: 'caducado', label: 'Caducados' },
    { value: 'muypronto', label: 'Muy proximos' },
    { value: 'pronto', label: 'Caduca pronto' },
    { value: 'ok', label: 'Correctos' },
    { value: 'nodate', label: 'Sin fecha' },
  ]

  const caducado = caducidades.filter(c => estadoCaducidad(c.fecha_caducidad).cls === 'caducado').length
  const muypronto = caducidades.filter(c => estadoCaducidad(c.fecha_caducidad).cls === 'muypronto').length
  const pronto = caducidades.filter(c => estadoCaducidad(c.fecha_caducidad).cls === 'pronto').length

  // Get unique categories for filter
  const categorias = ['Todos', ...new Set(caducidades.map(c => c.categoria).filter(Boolean).sort())]

  const filtrados = caducidades.filter(c => {
    const est = estadoCaducidad(c.fecha_caducidad)
    const matchFiltro = cadFiltro === 'todos' || est.cls === cadFiltro
    const matchBus = c.nombre.toLowerCase().includes(cadBusqueda.toLowerCase())
    const matchCat = cadFabricante === 'Todos' || c.categoria === cadFabricante
    return matchFiltro && matchBus && matchCat
  })

  return (
    <div className="historial">
      <div className="cad-metrics">
        <div className="cad-metric caducado-bg">
          <div className="metric-label">Caducados</div>
          <div className="metric-value">{caducado}</div>
        </div>
        <div className="cad-metric muypronto-bg">
          <div className="metric-label">Muy proximos</div>
          <div className="metric-value">{muypronto}</div>
        </div>
        <div className="cad-metric pronto-bg">
          <div className="metric-label">Caduca pronto</div>
          <div className="metric-value">{pronto}</div>
        </div>
        <div className="cad-metric">
          <div className="metric-label">Total registros</div>
          <div className="metric-value">{caducidades.length}</div>
        </div>
      </div>

      <div className="toolbar" style={{marginTop: '1rem'}}>
        <input className="search" placeholder="Buscar producto..." value={cadBusqueda} onChange={e => setCadBusqueda(e.target.value)} />
        <select className="search" style={{width: 'auto'}} value={cadFabricante} onChange={e => setCadFabricante(e.target.value)}>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="cat-filters">
          {filtros.map(f => (
            <button key={f.value} className={'cat-btn' + (cadFiltro === f.value ? ' active' : '')} onClick={() => setCadFiltro(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap" style={{marginTop: '1rem'}}>
        <table className="tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoria</th>
              <th>Fecha caducidad</th>
              <th>Dias restantes</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0
              ? <tr><td colSpan="6" className="empty">No hay productos que coincidan</td></tr>
              : filtrados.map(c => {
                const est = estadoCaducidad(c.fecha_caducidad)
                return (
                  <tr key={c.id} className={est.cls === 'caducado' ? 'row-out' : est.cls === 'muypronto' || est.cls === 'pronto' ? 'row-low' : ''}>
                    <td className="td-nombre">{c.nombre}</td>
                    <td className="td-cat">{c.categoria}</td>
                    <td className="td-time">
                      {editando && editando.id === c.id
                        ? <input type="date" value={editFecha} onChange={e => setEditFecha(e.target.value)} className="qty-small" style={{width:'140px'}} autoFocus />
                        : (c.fecha_caducidad ? new Date(c.fecha_caducidad).toLocaleDateString('es-ES') : 'Sin fecha')
                      }
                    </td>
                    <td className={'td-stock stock-' + (est.cls === 'caducado' ? 'out' : est.cls === 'muypronto' || est.cls === 'pronto' ? 'low' : 'ok')}>
                      {est.dias !== null ? (est.dias < 0 ? est.dias + ' dias' : '+' + est.dias + ' dias') : '-'}
                    </td>
                    <td><span className={'badge badge-cad-' + est.cls}>{est.label}</span></td>
                    <td>
                      <div className="acciones">
                        {editando && editando.id === c.id
                          ? <>
                              <button className="btn-entrada" onClick={guardarEdicion}>Guardar</button>
                              <button className="btn-cancel" style={{padding:'4px 8px',fontSize:'11px'}} onClick={() => setEditando(null)}>Cancelar</button>
                            </>
                          : <>
                              <button className="btn-edit" title="Editar fecha" onClick={() => { setEditando(c); setEditFecha(c.fecha_caducidad || '') }}>✏️</button>
                              {esAdmin && <button className="btn-del" title="Eliminar" onClick={() => eliminarCaducidad(c.id)}>x</button>}
                            </>
                        }
                      </div>
                    </td>
                  </tr>
                )
              })
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function App() {
  const [usuario, setUsuario] = useState(() => sessionStorage.getItem('usuario') || null)
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')

  const USUARIOS = {
    'admin': { pass: '2910', rol: 'admin' },
    'user': { pass: '1029', rol: 'user' }
  }

  const handleLogin = () => {
    const u = USUARIOS[loginUser.toLowerCase()]
    if (u && u.pass === loginPass) {
      sessionStorage.setItem('usuario', loginUser.toLowerCase())
      sessionStorage.setItem('rol', u.rol)
      setUsuario(loginUser.toLowerCase())
      setLoginError('')
    } else {
      setLoginError('Usuario o contraseña incorrectos')
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('usuario')
    sessionStorage.removeItem('rol')
    setUsuario(null)
    setLoginUser('')
    setLoginPass('')
  }

  const rol = sessionStorage.getItem('rol') || 'user'
  const esAdmin = rol === 'admin'

  const [productos, setProductos] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [caducidades, setCaducidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState('Todas')
  const [tab, setTab] = useState('stock')
  const [cadBusqueda, setCadBusqueda] = useState('')
  const [cadFiltro, setCadFiltro] = useState('todos')
  const [temaOscuro, setTemaOscuro] = useState(() => localStorage.getItem('tema') !== 'claro')
  const [toast, setToast] = useState(null)

  const [modalProducto, setModalProducto] = useState(null)
  const [modalVenta, setModalVenta] = useState(null)
  const [modalEntrada, setModalEntrada] = useState(null)
  const [modalAlbaran, setModalAlbaran] = useState(false)
  const [modalFechas, setModalFechas] = useState(false)
  const [modalVentasPDF, setModalVentasPDF] = useState(false)

  const [form, setForm] = useState({ nombre: '', categoria: 'Nicotina', stock_actual: 0, stock_minimo: 5, precio: 0 })
  const [ventaForm, setVentaForm] = useState({ cantidad: 1, referencia: '' })
  const [entradaForm, setEntradaForm] = useState({ cantidad: 1, referencia: '' })

  const [albaranImg, setAlbaranImg] = useState(null)
  const [albaranPreview, setAlbaranPreview] = useState(null)
  const [albaranLoading, setAlbaranLoading] = useState(false)
  const [albaranResultados, setAlbaranResultados] = useState([])
  const [albaranPaso, setAlbaranPaso] = useState(1)
  const fileRef = useRef()

  const [fechasImg, setFechasImg] = useState(null)
  const [fechasPreview, setFechasPreview] = useState(null)
  const [fechasLoading, setFechasLoading] = useState(false)
  const [fechasResultados, setFechasResultados] = useState([])
  const [fechasPaso, setFechasPaso] = useState(1)
  const fechasRef = useRef()

  const [pdfFile, setPdfFile] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfResultados, setPdfResultados] = useState([])
  const [pdfPaso, setPdfPaso] = useState(1)
  const pdfRef = useRef()

  const showToast = (msg, type) => {
    setToast({ msg, type: type || 'ok' })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchProductos = useCallback(async () => {
    const { data, error } = await supabase.from('productos').select('*').order('nombre')
    if (!error) setProductos(data || [])
    setLoading(false)
  }, [])

  const fetchCaducidades = useCallback(async () => {
    const { data } = await supabase
      .from('caducidades')
      .select('*')
      .order('fecha_caducidad', { ascending: true, nullsFirst: false })
    setCaducidades(data || [])
  }, [])

  const fetchMovimientos = useCallback(async () => {
    const { data } = await supabase
      .from('movimientos')
      .select('*, productos(nombre)')
      .order('created_at', { ascending: false })
      .limit(150)
    setMovimientos(data || [])
  }, [])

  useEffect(() => {
    fetchProductos()
    fetchMovimientos()
    fetchCaducidades()
    const chanProd = supabase.channel('prod-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, fetchProductos)
      .subscribe()
    const chanMov = supabase.channel('mov-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movimientos' }, fetchMovimientos)
      .subscribe()
    const chanCad = supabase.channel('cad-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caducidades' }, fetchCaducidades)
      .subscribe()
    return () => { supabase.removeChannel(chanProd); supabase.removeChannel(chanMov); supabase.removeChannel(chanCad) }
  }, [fetchProductos, fetchMovimientos, fetchCaducidades])

  const estadoProducto = (p) => {
    if (p.stock_actual === 0) return { cls: 'out', label: 'Sin stock' }
    if (p.stock_actual <= p.stock_minimo) return { cls: 'low', label: 'Stock bajo' }
    return { cls: 'ok', label: 'Correcto' }
  }

  const totalProductos = productos.length
  const valorTotal = productos.reduce((s, p) => s + (p.stock_actual * p.precio), 0)
  const stockBajo = productos.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo).length
  const sinStock = productos.filter(p => p.stock_actual === 0).length

  // Al filtrar por categoria padre, incluye tambien sus subcategorias
  const productosFiltrados = productos.filter(p => {
    if (catFiltro === 'Todas') return true
    const catTree = CATEGORIAS_TREE.find(c => c.nombre === catFiltro)
    if (catTree && catTree.sub.length > 0) {
      return catTree.sub.includes(p.categoria) || p.categoria === catFiltro
    }
    return p.categoria === catFiltro
  }).filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  const handleFotoAlbaran = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAlbaranImg(file)
    setAlbaranPreview(URL.createObjectURL(file))
    setAlbaranPaso(1)
    setAlbaranResultados([])
  }

  const callOpenAI = async (prompt, base64, mimeType) => {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_KEY },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 3000,
        temperature: 0.05,
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
        ]}]
      })
    })
    const data = await resp.json()
    if (data.error) throw new Error(data.error.message || 'OpenAI error')
    return data.choices?.[0]?.message?.content || ''
  }

  const analizarAlbaran = async () => {
    if (!albaranImg) return
    setAlbaranLoading(true)
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result.split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(albaranImg)
      })
      const prompt = 'Eres un asistente para una tienda de vapeo en Espana. Analiza esta imagen: puede ser un albaran, factura, lista de pedido o foto de productos/cajas. Extrae TODOS los productos visibles con sus cantidades. Si no hay cantidad visible, pon 1. Responde UNICAMENTE con JSON valido sin texto extra: {"productos": [{"nombre": "nombre completo del producto", "cantidad": numero}]}. Si no puedes identificar productos responde: {"productos": []}. Incluye marca, modelo, sabor, nicotina y cualquier detalle del nombre.'
      const texto = await callOpenAI(prompt, base64, albaranImg.type || 'image/jpeg')
      const jsonMatch = texto.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Sin respuesta')
      const parsed = JSON.parse(jsonMatch[0])
      const items = parsed.productos || []
      const resultados = items.map(item => {
        const palabras = item.nombre.toLowerCase().split(' ').filter(w => w.length > 3)
        const encontrado = productos.find(p => palabras.some(w => p.nombre.toLowerCase().includes(w)))
        return { nombre: item.nombre, cantidad: item.cantidad || 1, encontrado: encontrado || null, producto_id: encontrado ? encontrado.id : null, crear_nuevo: !encontrado, categoria: 'Otros', ignorar: false }
      })
      setAlbaranResultados(resultados)
      setAlbaranPaso(2)
    } catch (err) {
      showToast('Error al analizar la imagen.', 'error')
    }
    setAlbaranLoading(false)
  }

  const confirmarAlbaran = async () => {
    setAlbaranLoading(true)
    let ok = 0
    for (const item of albaranResultados) {
      if (item.ignorar) continue
      if (item.encontrado && item.producto_id) {
        const prod = productos.find(p => p.id === item.producto_id)
        if (prod) {
          await supabase.from('productos').update({ stock_actual: prod.stock_actual + parseInt(item.cantidad), updated_at: new Date().toISOString() }).eq('id', item.producto_id)
          await supabase.from('movimientos').insert([{ producto_id: item.producto_id, tipo: 'entrada', cantidad: parseInt(item.cantidad), referencia: 'Pedido escaneado IA' }])
          ok++
        }
      } else if (item.crear_nuevo) {
        const res = await supabase.from('productos').insert([{ nombre: item.nombre, categoria: item.categoria || 'Otros', stock_actual: parseInt(item.cantidad), stock_minimo: 3, precio: 0, updated_at: new Date().toISOString() }]).select().single()
        if (res.data) {
          await supabase.from('movimientos').insert([{ producto_id: res.data.id, tipo: 'entrada', cantidad: parseInt(item.cantidad), referencia: 'Pedido escaneado IA - nuevo' }])
          ok++
        }
      }
    }
    showToast(ok + ' productos anadidos al stock')
    setModalAlbaran(false)
    setAlbaranImg(null); setAlbaranPreview(null); setAlbaranResultados([]); setAlbaranPaso(1)
    setAlbaranLoading(false)
  }

  const handlePdfVentas = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPdfFile(file)
    setPdfPaso(1)
    setPdfResultados([])
  }

  const analizarPdfVentas = async () => {
    if (!pdfFile) return
    setPdfLoading(true)
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result.split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(pdfFile)
      })
      const prompt = 'Eres un asistente para una tienda de vapeo en Espana. Este es un PDF de ventas del dia. Extrae TODOS los productos vendidos con sus cantidades. El formato suele ser: nombre del producto seguido de la cantidad al final de la linea. Responde UNICAMENTE con JSON valido sin texto extra: {"productos": [{"nombre": "nombre completo del producto", "cantidad": numero}]}. Si no puedes identificar productos responde: {"productos": []}. Incluye todos los detalles del nombre: marca, modelo, sabor, mg, ml, etc.'
      const texto = await callOpenAI(prompt, base64, 'image/jpeg')
      const jsonMatch = texto.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Sin respuesta')
      const parsed = JSON.parse(jsonMatch[0])
      const items = parsed.productos || []
      const resultados = items.map(item => {
        const palabras = item.nombre.toLowerCase().split(' ').filter(w => w.length > 3)
        const encontrado = productos.find(p => palabras.some(w => p.nombre.toLowerCase().includes(w)))
        return { nombre: item.nombre, cantidad: item.cantidad || 1, encontrado: encontrado || null, producto_id: encontrado ? encontrado.id : null, ignorar: false }
      })
      setPdfResultados(resultados)
      setPdfPaso(2)
    } catch (err) {
      showToast('Error al leer el PDF.', 'error')
    }
    setPdfLoading(false)
  }

  const confirmarPdfVentas = async () => {
    setPdfLoading(true)
    let ok = 0
    let noEncontrados = 0
    const fecha = new Date().toLocaleDateString('es-ES')
    for (const item of pdfResultados) {
      if (item.ignorar) continue
      if (item.encontrado && item.producto_id) {
        const prod = productos.find(p => p.id === item.producto_id)
        if (prod) {
          const nuevoStock = Math.max(0, prod.stock_actual - parseInt(item.cantidad))
          await supabase.from('productos').update({ stock_actual: nuevoStock, updated_at: new Date().toISOString() }).eq('id', item.producto_id)
          await supabase.from('movimientos').insert([{ producto_id: item.producto_id, tipo: 'venta', cantidad: -parseInt(item.cantidad), referencia: 'Ventas PDF ' + fecha }])
          ok++
        }
      } else {
        noEncontrados++
      }
    }
    let msg = ok + ' productos descontados del stock'
    if (noEncontrados > 0) msg += ' - ' + noEncontrados + ' no encontrados'
    showToast(msg)
    setModalVentasPDF(false)
    setPdfFile(null); setPdfResultados([]); setPdfPaso(1)
    setPdfLoading(false)
  }

  const guardarProducto = async () => {
    if (!form.nombre.trim()) return showToast('El nombre es obligatorio', 'error')
    if (modalProducto === 'nuevo') {
      const { error } = await supabase.from('productos').insert([{ nombre: form.nombre.trim(), categoria: form.categoria, stock_actual: parseInt(form.stock_actual) || 0, stock_minimo: parseInt(form.stock_minimo) || 5, precio: parseFloat(form.precio) || 0, updated_at: new Date().toISOString() }])
      if (error) return showToast('Error al crear', 'error')
      showToast('Producto creado')
    } else {
      const { error } = await supabase.from('productos').update({ nombre: form.nombre.trim(), categoria: form.categoria, stock_minimo: parseInt(form.stock_minimo) || 5, precio: parseFloat(form.precio) || 0, updated_at: new Date().toISOString() }).eq('id', modalProducto.id)
      if (error) return showToast('Error al guardar', 'error')
      showToast('Actualizado')
    }
    setModalProducto(null)
  }

  const registrarVenta = async () => {
    const qty = parseInt(ventaForm.cantidad) || 1
    if (qty > modalVenta.stock_actual) return showToast('Stock insuficiente', 'error')
    await supabase.from('productos').update({ stock_actual: modalVenta.stock_actual - qty, updated_at: new Date().toISOString() }).eq('id', modalVenta.id)
    await supabase.from('movimientos').insert([{ producto_id: modalVenta.id, tipo: 'venta', cantidad: -qty, referencia: ventaForm.referencia || null }])
    showToast('Venta: -' + qty + ' uds')
    setModalVenta(null)
    setVentaForm({ cantidad: 1, referencia: '' })
  }

  const registrarEntrada = async () => {
    const qty = parseInt(entradaForm.cantidad) || 1
    if (qty <= 0) return showToast('Cantidad invalida', 'error')
    await supabase.from('productos').update({ stock_actual: modalEntrada.stock_actual + qty, updated_at: new Date().toISOString() }).eq('id', modalEntrada.id)
    await supabase.from('movimientos').insert([{ producto_id: modalEntrada.id, tipo: 'entrada', cantidad: qty, referencia: entradaForm.referencia || 'Entrada manual' }])
    showToast('+' + qty + ' uds anadidas al stock')
    setModalEntrada(null)
    setEntradaForm({ cantidad: 1, referencia: '' })
  }


  const handleFotoFechas = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFechasImg(file)
    setFechasPreview(URL.createObjectURL(file))
    setFechasPaso(1)
    setFechasResultados([])
  }

  const parsearFechaAlbaran = (fechaStr) => {
    // Normaliza fechas escritas a mano en albaranes Sinhumo
    // Formatos posibles: "7/28", "1/29", "12/28" (mes/año) o "15/11/27", "17/07/26" (dia/mes/año)
    if (!fechaStr) return null
    const s = fechaStr.trim().replace(/\s/g, '')
    const partes = s.split('/')
    if (partes.length === 2) {
      // Formato M/AA o MM/AA → primer dia del mes
      const mes = parseInt(partes[0])
      const anioCorto = parseInt(partes[1])
      if (isNaN(mes) || isNaN(anioCorto)) return null
      const anio = anioCorto < 100 ? 2000 + anioCorto : anioCorto
      if (mes < 1 || mes > 12) return null
      return `${anio}-${String(mes).padStart(2,'0')}-01`
    } else if (partes.length === 3) {
      // Formato D/M/AA o DD/MM/AA
      const dia = parseInt(partes[0])
      const mes = parseInt(partes[1])
      const anioCorto = parseInt(partes[2])
      if (isNaN(dia) || isNaN(mes) || isNaN(anioCorto)) return null
      const anio = anioCorto < 100 ? 2000 + anioCorto : anioCorto
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
      return `${anio}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
    }
    return null
  }

  const analizarFechas = async () => {
    if (!fechasImg) return
    setFechasLoading(true)
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result.split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(fechasImg)
      })

      const prompt = `Eres un asistente para una tienda de vapeo en España. Analiza este albarán de Sinhumo con mucho cuidado.

ESTRUCTURA DEL ALBARÁN:
- Es una tabla con columnas: UB (primera columna izquierda), Producto, Cant.
- En la columna UB hay anotaciones escritas a mano con bolígrafo azul/negro
- Esas anotaciones son fechas de caducidad o una X (sin caducidad)

CÓMO IDENTIFICAR LAS FECHAS:
- Busca números escritos a mano en la columna izquierda (UB), antes del nombre del producto
- Formato corto MES/AÑO: "7/28" = julio 2028, "1/29" = enero 2029, "12/28" = diciembre 2028
- Formato largo DIA/MES/AÑO: "15/11/27" = 15 nov 2027, "17/07/26" = 17 jul 2026, "27/06/27" = 27 jun 2027
- Si hay una X escrita → NO tiene fecha, ignora ese producto
- Si hay guión, está en blanco, o no hay nada → ignora ese producto

INSTRUCCIONES:
1. Recorre cada fila de la tabla de arriba a abajo
2. Para cada fila, mira si la columna UB tiene una fecha escrita a mano (números con barras /)
3. Si tiene fecha, anota el nombre completo del producto de esa misma fila y la fecha tal como está escrita
4. La fecha devuélvela EXACTAMENTE como aparece escrita (ej: "7/28", "15/11/27"), yo la convertiré

Responde ÚNICAMENTE con este JSON válido sin texto adicional, sin markdown, sin explicaciones:
{"productos": [{"nombre": "nombre completo del producto", "fecha_raw": "fecha tal como está escrita"}]}

Si no hay ningún producto con fecha escrita responde exactamente: {"productos": []}`

      const texto = await callOpenAI(prompt, base64, fechasImg.type || 'image/jpeg')
      if (!texto) throw new Error('La IA no devolvio respuesta')

      const jsonMatch = texto.match(/\{[\s\S]*\}/)
      if (!jsonMatch) { setFechasResultados([]); setFechasPaso(2); return }

      const parsed = JSON.parse(jsonMatch[0])
      const items = parsed.productos || []

      if (items.length === 0) { setFechasResultados([]); setFechasPaso(2); return }

      console.log('Caducidades cargadas:', caducidades.length, caducidades.slice(0,3))
      const resultados = items.map(item => {
        // Convertir fecha_raw a formato YYYY-MM-DD
        const fechaISO = parsearFechaAlbaran(item.fecha_raw || item.fecha || '')
        // Buscar si ya existe en caducidades con coincidencia flexible de nombre
        const palabras = item.nombre.toLowerCase().split(' ').filter(w => w.length > 3)
        // Puntuamos cada caducidad por cuántas palabras coinciden
        const conPuntuacion = caducidades.map(c => {
          const nombreCad = c.nombre.toLowerCase()
          const coincidencias = palabras.filter(w => nombreCad.includes(w)).length
          return { c, coincidencias }
        }).filter(x => x.coincidencias >= 2) // al menos 2 palabras en común
        conPuntuacion.sort((a, b) => b.coincidencias - a.coincidencias)
        const encontrado = conPuntuacion.length > 0 ? conPuntuacion[0].c : null
        // yaExiste: mismo producto Y mismo año+mes (ignoramos el día)
        // Normaliza cualquier formato de fecha a YYYY-MM para comparar solo año y mes
        const anioMes = (f) => {
          if (!f) return null
          const s = String(f).trim().slice(0, 7) // coge "YYYY-MM" de cualquier formato
          return s
        }
        const anioMesFechaISO = anioMes(fechaISO)
        // Comprobamos contra TODAS las entradas del mismo producto en caducidades
        const todasDelProducto = caducidades.filter(c => {
          const nombreCad = c.nombre.toLowerCase()
          const coincidencias = palabras.filter(w => nombreCad.includes(w)).length
          return coincidencias >= 2
        })
        const yaExiste = !!(fechaISO && anioMesFechaISO && todasDelProducto.some(c => {
          const anioMesCad = anioMes(c.fecha_caducidad)
          return anioMesCad === anioMesFechaISO
        }))
        return {
          nombre: item.nombre,
          fecha_raw: item.fecha_raw || item.fecha || '',
          fecha: fechaISO || '',
          encontrado: encontrado || null,
          ignorar: !fechaISO || yaExiste,
          yaExiste
        }
      }).filter(item => item.fecha && !item.yaExiste) // quitar sin fecha válida y los que ya existen

      setFechasResultados(resultados)
      setFechasPaso(2)
    } catch (err) {
      console.error('Fechas error:', err)
      showToast('Error: ' + (err.message || 'Fallo al analizar'), 'error')
    }
    setFechasLoading(false)
  }

  const confirmarFechas = async () => {
    setFechasLoading(true)
    let ok = 0
    let repetidas = 0
    for (const item of fechasResultados) {
      if (item.ignorar || item.yaExiste) { if (item.yaExiste) repetidas++; continue }
      const { error } = await supabase.from('caducidades').insert([{
        nombre: item.nombre,
        categoria: item.encontrado ? item.encontrado.categoria : 'Otros',
        fecha_caducidad: item.fecha,
        hoja_origen: 'Albaran escaneado'
      }])
      if (!error) ok++
    }
    let msg = ok + ' fechas nuevas anadidas'
    if (repetidas > 0) msg += ' - ' + repetidas + ' ya existian (no duplicadas)'
    showToast(msg)
    setModalFechas(false)
    setFechasImg(null); setFechasPreview(null); setFechasResultados([]); setFechasPaso(1)
    setFechasLoading(false)
  }

  const eliminarProducto = async (id) => {
    if (!window.confirm('Eliminar este producto?')) return
    await supabase.from('productos').delete().eq('id', id)
    showToast('Eliminado')
  }

  if (!usuario) return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">
          <span className="logo-main">SINHUMO</span>
          <span className="logo-sub">GINES STOCK</span>
        </div>
        <div className="login-form">
          <label>Usuario</label>
          <input
            type="text"
            placeholder="admin / user"
            value={loginUser}
            onChange={e => setLoginUser(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            autoComplete="off"
          />
          <label>Contraseña</label>
          <input
            type="password"
            placeholder="••••"
            value={loginPass}
            onChange={e => setLoginPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          {loginError && <div className="login-error">{loginError}</div>}
          <button className="btn-primary login-btn" onClick={handleLogin}>Entrar</button>
        </div>
      </div>
    </div>
  )

  if (loading) return <div className="loading-screen"><div className="loading-dot" /><span>Conectando...</span></div>

  return (
    <div className={'app' + (temaOscuro ? '' : ' tema-claro')}>
      {toast && <div className={'toast toast-' + toast.type}>{toast.msg}</div>}

      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-main">SINHUMO</span>
            <span className="logo-sub">GINES STOCK</span>
          </div>
          <div className="realtime-badge"><span className="pulse" />EN VIVO</div>
        </div>
        <div className="header-right">
          {esAdmin && <button className="btn-pdf" onClick={() => { setPdfFile(null); setPdfResultados([]); setPdfPaso(1); setModalVentasPDF(true) }}>PDF Ventas</button>}
          {esAdmin && <button className="btn-albaran" onClick={() => { setAlbaranImg(null); setAlbaranPreview(null); setAlbaranResultados([]); setAlbaranPaso(1); setModalAlbaran(true) }}>📦 Stock pedido</button>}
          {esAdmin && <button className="btn-fechas" onClick={() => { setFechasImg(null); setFechasPreview(null); setFechasResultados([]); setFechasPaso(1); setModalFechas(true) }}>📅 Fechas pedido</button>}
          <button className={"btn-tabs" + (tab === 'sinstock' ? ' btn-tab-active' : '')} onClick={() => setTab('sinstock')}>Sin Stock</button>
          <button className={"btn-tabs" + (tab === 'stock' ? ' btn-tab-active' : '')} onClick={() => setTab('stock')}>Stock</button>
          <button className={"btn-cad" + (tab === 'caducidades' ? ' btn-tab-active' : '')} onClick={() => setTab('caducidades')}>Caducidades</button>
          <button className={"btn-tabs" + (tab === 'historial' ? ' btn-tab-active' : '')} onClick={() => setTab('historial')}>Historial</button>
          <button className={"btn-informe" + (tab === 'informe' ? ' btn-tab-active' : '')} onClick={() => setTab('informe')}>Informe</button>
          <button className="btn-tema" onClick={() => { const nuevo = !temaOscuro; setTemaOscuro(nuevo); localStorage.setItem('tema', nuevo ? 'oscuro' : 'claro') }}>{temaOscuro ? '☀️' : '🌙'}</button>
          <div className="user-badge">{usuario}</div>
          <button className="btn-logout" onClick={handleLogout}>Salir</button>
          {esAdmin && <button className="btn-primary" onClick={() => { setForm({ nombre: '', categoria: 'Nicotina', stock_actual: 0, stock_minimo: 5, precio: 0 }); setModalProducto('nuevo') }}>+ Nuevo producto</button>}
        </div>
      </header>

      {tab === 'sinstock' ? (
        <>
          <div className="metrics">
            <div className="metric danger"><div className="metric-label">Sin stock</div><div className="metric-value">{sinStock}</div></div>
            <div className="metric warn"><div className="metric-label">Stock bajo</div><div className="metric-value">{stockBajo}</div></div>
            <div className="metric"><div className="metric-label">Total productos</div><div className="metric-value">{totalProductos}</div></div>
            <div className="metric"><div className="metric-label">Valor inventario</div><div className="metric-value">€{valorTotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
          </div>
          <div className="toolbar">
            <input className="search" placeholder="Buscar producto sin stock..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table className="tabla">
              <thead><tr><th>Producto</th><th>Categoria</th><th>Minimo</th><th>Precio</th><th>Acciones</th></tr></thead>
              <tbody>
                {productos.filter(p => p.stock_actual === 0 && p.nombre.toLowerCase().includes(busqueda.toLowerCase())).length === 0
                  ? <tr><td colSpan="5" className="empty">No hay productos sin stock</td></tr>
                  : productos.filter(p => p.stock_actual === 0 && p.nombre.toLowerCase().includes(busqueda.toLowerCase())).map(p => (
                    <tr key={p.id} className="row-out">
                      <td className="td-nombre">{p.nombre}</td>
                      <td className="td-cat">{p.categoria}</td>
                      <td className="td-min">{p.stock_minimo}</td>
                      <td className="td-precio">€{Number(p.precio).toFixed(2)}</td>
                      <td>
                        <div className="acciones">
                          <button className="btn-entrada" onClick={() => { setModalEntrada(p); setEntradaForm({ cantidad: 1, referencia: '' }) }}>+ Entrada</button>
                          {esAdmin && <button className="btn-edit" onClick={() => { setForm({ nombre: p.nombre, categoria: p.categoria, stock_actual: p.stock_actual, stock_minimo: p.stock_minimo, precio: p.precio }); setModalProducto(p) }}>editar</button>}
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </>
      ) : tab === 'stock' ? (
        <>
          <div className="metrics">
            <div className="metric"><div className="metric-label">Total productos</div><div className="metric-value">{totalProductos}</div></div>
            <div className="metric"><div className="metric-label">Valor inventario</div><div className="metric-value">{'EUR' + valorTotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
            <div className="metric warn"><div className="metric-label">Stock bajo</div><div className="metric-value">{stockBajo}</div></div>
            <div className="metric danger"><div className="metric-label">Sin stock</div><div className="metric-value">{sinStock}</div></div>
          </div>

          <div className="toolbar">
            <input className="search" placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <div className="cat-filters">
              {TODAS_CATS.map(c => {
                const esSub = CATEGORIAS_TREE.some(cat => cat.sub.includes(c))
                return (
                  <button
                    key={c}
                    className={'cat-btn' + (catFiltro === c ? ' active' : '') + (esSub ? ' cat-sub' : '')}
                    onClick={() => setCatFiltro(c)}
                  >
                    {esSub ? '  › ' + c : c}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="table-wrap">
            <table className="tabla">
              <thead>
                <tr><th>Producto</th><th>Categoria</th><th>Stock</th><th>Minimo</th><th>Precio</th><th>Estado</th><th>Actualizado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {productosFiltrados.length === 0
                  ? <tr><td colSpan="8" className="empty">No hay productos que coincidan</td></tr>
                  : productosFiltrados.map(p => {
                    const est = estadoProducto(p)
                    return (
                      <tr key={p.id} className={est.cls === 'out' ? 'row-out' : est.cls === 'low' ? 'row-low' : ''}>
                        <td className="td-nombre">{p.nombre}</td>
                        <td className="td-cat">{p.categoria}</td>
                        <td className={'td-stock stock-' + est.cls}>{p.stock_actual}</td>
                        <td className="td-min">{p.stock_minimo}</td>
                        <td className="td-precio">{'EUR' + Number(p.precio).toFixed(2)}</td>
                        <td><span className={'badge badge-' + est.cls}>{est.label}</span></td>
                        <td className="td-time">{timeAgo(p.updated_at)}</td>
                        <td>
                          <div className="acciones">
                            <button className="btn-venta" onClick={() => { setModalVenta(p); setVentaForm({ cantidad: 1, referencia: '' }) }}>- Venta</button>
                            <button className="btn-entrada" onClick={() => { setModalEntrada(p); setEntradaForm({ cantidad: 1, referencia: '' }) }}>+ Entrada</button>
                            {esAdmin && <button className="btn-edit" onClick={() => { setForm({ nombre: p.nombre, categoria: p.categoria, stock_actual: p.stock_actual, stock_minimo: p.stock_minimo, precio: p.precio }); setModalProducto(p) }}>editar</button>}
                            {esAdmin && <button className="btn-del" onClick={() => eliminarProducto(p.id)}>x</button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        </>
      ) : tab === 'informe' ? (
        <InformeTab movimientos={movimientos} productos={productos} />
      ) : tab === 'caducidades' ? (
        <CaducidadesTab
          caducidades={caducidades}
          cadBusqueda={cadBusqueda}
          setCadBusqueda={setCadBusqueda}
          cadFiltro={cadFiltro}
          setCadFiltro={setCadFiltro}
          supabase={supabase}
          showToast={showToast}
          esAdmin={esAdmin}
        />
      ) : (
        <div className="historial">
          <h2 className="historial-title">Historial de movimientos</h2>
          <div className="table-wrap">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Referencia</th></tr></thead>
              <tbody>
                {movimientos.length === 0
                  ? <tr><td colSpan="5" className="empty">No hay movimientos aun</td></tr>
                  : movimientos.map(m => (
                    <tr key={m.id}>
                      <td className="td-time">{new Date(m.created_at).toLocaleString('es-ES')}</td>
                      <td className="td-nombre">{m.productos ? m.productos.nombre : '-'}</td>
                      <td><span className={'badge badge-' + (m.tipo === 'venta' ? 'out' : 'ok')}>{m.tipo}</span></td>
                      <td className={'td-stock stock-' + (m.cantidad < 0 ? 'out' : 'ok')}>{m.cantidad > 0 ? '+' + m.cantidad : m.cantidad}</td>
                      <td className="td-cat">{m.referencia || '-'}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalProducto && (
        <Modal title={modalProducto === 'nuevo' ? 'Nuevo producto' : 'Editar producto'} onClose={() => setModalProducto(null)}>
          <div className="modal-body">
            <label>Nombre del producto</label>
            <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Nicokit 50/50 15mg By Sinhumo" />
            <label>Categoria</label>
            <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS_SELECTOR.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {modalProducto === 'nuevo' && (
              <>
                <label>Stock inicial</label>
                <input type="number" min="0" value={form.stock_actual} onChange={e => setForm({ ...form, stock_actual: e.target.value })} />
              </>
            )}
            <label>Alerta stock minimo</label>
            <input type="number" min="0" value={form.stock_minimo} onChange={e => setForm({ ...form, stock_minimo: e.target.value })} />
            <label>Precio unitario (EUR)</label>
            <input type="number" min="0" step="0.01" value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} />
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setModalProducto(null)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarProducto}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}

      {modalEntrada && (
        <Modal title={'+ Entrada - ' + modalEntrada.nombre} onClose={() => setModalEntrada(null)}>
          <div className="modal-body">
            <div className="venta-info">Stock actual: <strong>{modalEntrada.stock_actual} uds</strong></div>
            <label>Unidades a anadir</label>
            <input type="number" min="1" value={entradaForm.cantidad} onChange={e => setEntradaForm({ ...entradaForm, cantidad: e.target.value })} />
            <label>Referencia (opcional)</label>
            <input value={entradaForm.referencia} onChange={e => setEntradaForm({ ...entradaForm, referencia: e.target.value })} placeholder="Ej: Pedido mayo, Albaran #123" />
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setModalEntrada(null)}>Cancelar</button>
              <button className="btn-entrada-modal" onClick={registrarEntrada}>+ Confirmar entrada</button>
            </div>
          </div>
        </Modal>
      )}

      {modalVenta && (
        <Modal title={'Venta - ' + modalVenta.nombre} onClose={() => setModalVenta(null)}>
          <div className="modal-body">
            <div className="venta-info">Stock disponible: <strong>{modalVenta.stock_actual} uds</strong></div>
            <label>Unidades vendidas</label>
            <input type="number" min="1" max={modalVenta.stock_actual} value={ventaForm.cantidad} onChange={e => setVentaForm({ ...ventaForm, cantidad: e.target.value })} />
            <label>Referencia (opcional)</label>
            <input value={ventaForm.referencia} onChange={e => setVentaForm({ ...ventaForm, referencia: e.target.value })} placeholder="Ticket #1234" />
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setModalVenta(null)}>Cancelar</button>
              <button className="btn-danger" onClick={registrarVenta}>Confirmar venta</button>
            </div>
          </div>
        </Modal>
      )}

      {modalAlbaran && (
        <Modal title="Escanear pedido con IA" onClose={() => setModalAlbaran(false)} wide>
          <div className="modal-body">
            {albaranPaso === 1 && (
              <>
                <div className="albaran-zona" onClick={() => fileRef.current.click()}>
                  {albaranPreview
                    ? <img src={albaranPreview} alt="Albaran" className="albaran-preview" />
                    : <div className="albaran-placeholder">
                        <div className="albaran-icon">foto</div>
                        <div className="albaran-hint">Toca para subir foto del albaran o pedido</div>
                        <div className="albaran-sub">Funciona con albaranes, facturas o fotos de cajas</div>
                      </div>
                  }
                </div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFotoAlbaran} />
                {albaranPreview && !albaranLoading && (
                  <div className="modal-footer">
                    <button className="btn-cancel" onClick={() => { setAlbaranImg(null); setAlbaranPreview(null) }}>Cambiar foto</button>
                    <button className="btn-primary" onClick={analizarAlbaran}>Analizar con IA</button>
                  </div>
                )}
                {albaranLoading && <div className="albaran-loading"><div className="loading-dot" /><span>La IA esta leyendo el albaran...</span></div>}
              </>
            )}
            {albaranPaso === 2 && (
              <>
                <div className="albaran-resumen">La IA encontro <strong>{albaranResultados.length} productos</strong>. Revisa y ajusta:</div>
                <div className="albaran-lista">
                  {albaranResultados.map((item, i) => (
                    <div key={i} className={'albaran-item' + (item.ignorar ? ' ignorado' : '')}>
                      <div className="albaran-item-top">
                        <div className="albaran-item-nombre">
                          <input className="albaran-nombre-input" value={item.nombre} onChange={e => { const c = [...albaranResultados]; c[i] = { ...c[i], nombre: e.target.value }; setAlbaranResultados(c) }} />
                          {item.encontrado ? <span className="badge badge-ok">Existe</span> : <span className="badge badge-new">Nuevo</span>}
                        </div>
                        <div className="albaran-item-qty">
                          <label>Uds</label>
                          <input type="number" min="1" value={item.cantidad} className="qty-small" onChange={e => { const c = [...albaranResultados]; c[i] = { ...c[i], cantidad: e.target.value }; setAlbaranResultados(c) }} />
                        </div>
                        <button className={'btn-ignorar' + (item.ignorar ? ' btn-ignorar-on' : '')} onClick={() => { const c = [...albaranResultados]; c[i] = { ...c[i], ignorar: !c[i].ignorar }; setAlbaranResultados(c) }}>
                          {item.ignorar ? 'Incluir' : 'Ignorar'}
                        </button>
                      </div>
                      {item.crear_nuevo && !item.ignorar && (
                        <div className="albaran-cat-sel">
                          <label>Categoria:</label>
                          <select value={item.categoria || 'Otros'} onChange={e => { const c = [...albaranResultados]; c[i] = { ...c[i], categoria: e.target.value }; setAlbaranResultados(c) }}>
                            {CATEGORIAS_SELECTOR.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="modal-footer">
                  <button className="btn-cancel" onClick={() => setAlbaranPaso(1)}>Volver</button>
                  <button className="btn-primary" onClick={confirmarAlbaran} disabled={albaranLoading}>
                    {albaranLoading ? 'Actualizando...' : 'Anadir ' + albaranResultados.filter(r => !r.ignorar).length + ' al stock'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {modalVentasPDF && (
        <Modal title="Descontar ventas del PDF" onClose={() => setModalVentasPDF(false)} wide>
          <div className="modal-body">
            {pdfPaso === 1 && (
              <>
                <div className="pdf-info-box">La IA leera tu PDF de ventas y descontara automaticamente cada producto del stock.</div>
                <div className="albaran-zona" onClick={() => pdfRef.current.click()}>
                  {pdfFile
                    ? <div className="pdf-seleccionado">
                        <div className="pdf-icon">PDF</div>
                        <div className="pdf-nombre">{pdfFile.name}</div>
                        <div className="albaran-sub">Listo para analizar</div>
                      </div>
                    : <div className="albaran-placeholder">
                        <div className="albaran-icon">PDF</div>
                        <div className="albaran-hint">Toca para subir el PDF de ventas del dia</div>
                        <div className="albaran-sub">El mismo PDF que exportas de Velneo cada dia</div>
                      </div>
                  }
                </div>
                <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handlePdfVentas} />
                {pdfFile && !pdfLoading && (
                  <div className="modal-footer">
                    <button className="btn-cancel" onClick={() => setPdfFile(null)}>Cambiar PDF</button>
                    <button className="btn-primary" onClick={analizarPdfVentas}>Analizar con IA</button>
                  </div>
                )}
                {pdfLoading && <div className="albaran-loading"><div className="loading-dot" /><span>La IA esta leyendo las ventas...</span></div>}
              </>
            )}
            {pdfPaso === 2 && (
              <>
                <div className="albaran-resumen">La IA encontro <strong>{pdfResultados.length} productos vendidos</strong>. Revisa antes de descontar:</div>
                <div className="albaran-lista">
                  {pdfResultados.map((item, i) => (
                    <div key={i} className={'albaran-item' + (item.ignorar ? ' ignorado' : '')}>
                      <div className="albaran-item-top">
                        <div className="albaran-item-nombre">
                          <span className="albaran-nombre-txt">{item.nombre}</span>
                          {item.encontrado ? <span className="badge badge-ok">En stock</span> : <span className="badge badge-warn">No encontrado</span>}
                        </div>
                        <div className="albaran-item-qty">
                          <label>Vendidas</label>
                          <input type="number" min="1" value={item.cantidad} className="qty-small" onChange={e => { const c = [...pdfResultados]; c[i] = { ...c[i], cantidad: e.target.value }; setPdfResultados(c) }} />
                        </div>
                        <button className={'btn-ignorar' + (item.ignorar ? ' btn-ignorar-on' : '')} onClick={() => { const c = [...pdfResultados]; c[i] = { ...c[i], ignorar: !c[i].ignorar }; setPdfResultados(c) }}>
                          {item.ignorar ? 'Incluir' : 'Ignorar'}
                        </button>
                      </div>
                      {item.encontrado && !item.ignorar && (
                        <div className="pdf-stock-preview">
                          Stock actual: <strong>{item.encontrado.stock_actual}</strong> despues: <strong className={item.encontrado.stock_actual - item.cantidad <= 0 ? 'txt-red' : item.encontrado.stock_actual - item.cantidad <= item.encontrado.stock_minimo ? 'txt-amber' : 'txt-green'}>{Math.max(0, item.encontrado.stock_actual - parseInt(item.cantidad))}</strong>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="modal-footer">
                  <button className="btn-cancel" onClick={() => setPdfPaso(1)}>Volver</button>
                  <button className="btn-danger" onClick={confirmarPdfVentas} disabled={pdfLoading}>
                    {pdfLoading ? 'Descontando...' : 'Descontar ' + pdfResultados.filter(r => !r.ignorar && r.encontrado).length + ' productos'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {modalFechas && (
        <Modal title="📅 Actualizar fechas de caducidad" onClose={() => setModalFechas(false)} wide>
          <div className="modal-body">
            {fechasPaso === 1 && (<>
              <div className="pdf-info-box">
                Sube foto del albaran con las fechas escritas a mano. La IA leeara solo las fechas, sin tocar el stock.
              </div>
              <div className="albaran-zona" onClick={() => fechasRef.current.click()}>
                {fechasPreview
                  ? <img src={fechasPreview} alt="Albaran fechas" className="albaran-preview" />
                  : <div className="albaran-placeholder">
                      <div className="albaran-icon">📅</div>
                      <div className="albaran-hint">Foto del albaran con fechas escritas a mano</div>
                      <div className="albaran-sub">La IA leera las fechas junto a cada producto</div>
                    </div>
                }
              </div>
              <input ref={fechasRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFotoFechas} />
              {fechasPreview && !fechasLoading && (
                <div className="modal-footer">
                  <button className="btn-cancel" onClick={() => { setFechasImg(null); setFechasPreview(null) }}>Cambiar foto</button>
                  <button className="btn-primary" onClick={analizarFechas}>📅 Analizar fechas con IA</button>
                </div>
              )}
              {fechasLoading && <div className="albaran-loading"><div className="loading-dot" /><span>La IA esta leyendo las fechas...</span></div>}
            </>)}

            {fechasPaso === 2 && (<>
              {fechasResultados.length === 0
                ? <div className="albaran-resumen" style={{color:'var(--amber)'}}>⚠️ La IA no encontró ningún producto con fecha de caducidad en esta imagen. Asegúrate de que se vean bien las anotaciones escritas a mano.</div>
                : <div className="albaran-resumen">La IA encontró <strong>{fechasResultados.length} productos con fecha</strong>. Revisa y corrige si hace falta:</div>
              }
              <div className="albaran-lista">
                {fechasResultados.map((item, i) => (
                  <div key={i} className={'albaran-item' + (item.ignorar ? ' ignorado' : '')}>
                    <div className="albaran-item-top">
                      <div className="albaran-item-nombre">
                        <span className="albaran-nombre-txt">{item.nombre}</span>
                        {item.yaExiste
                          ? <span className="badge badge-warn">Ya existe</span>
                          : item.encontrado
                            ? <span className="badge badge-ok">En caducidades</span>
                            : <span className="badge badge-new">Nuevo</span>
                        }
                      </div>
                      <div className="albaran-item-qty" style={{flexDirection:'column', alignItems:'flex-end', gap:'2px'}}>
                        {item.fecha_raw && <span style={{fontSize:'10px', color:'var(--text3)', fontFamily:'var(--mono)'}}>leído: {item.fecha_raw}</span>}
                        <input type="date" value={item.fecha || ''} className="qty-small" style={{width: '140px'}}
                          onChange={e => { const c = [...fechasResultados]; c[i] = { ...c[i], fecha: e.target.value, yaExiste: false }; setFechasResultados(c) }} />
                      </div>
                      <button className={'btn-ignorar' + (item.ignorar ? ' btn-ignorar-on' : '')}
                        onClick={() => { const c = [...fechasResultados]; c[i] = { ...c[i], ignorar: !c[i].ignorar }; setFechasResultados(c) }}>
                        {item.ignorar ? 'Incluir' : 'Ignorar'}
                      </button>
                    </div>
                    {item.yaExiste && !item.ignorar && (
                      <div className="pdf-stock-preview" style={{color: 'var(--amber)'}}>
                        Esta fecha ya existe en caducidades — no se duplicará
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setFechasPaso(1)}>Volver a analizar</button>
                <button className="btn-primary" onClick={confirmarFechas} disabled={fechasLoading || fechasResultados.filter(r => !r.ignorar && !r.yaExiste).length === 0}>
                  {fechasLoading ? 'Guardando...' : 'Guardar ' + fechasResultados.filter(r => !r.ignorar && !r.yaExiste).length + ' fechas nuevas'}
                </button>
              </div>
            </>)}
          </div>
        </Modal>
      )}

    </div>
  )
}
