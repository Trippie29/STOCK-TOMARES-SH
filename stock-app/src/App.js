import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import './App.css'

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwjvT661HK307w25F_AMxT4-KfkaCp6BSqMthKgw-R5vGrjFZmWMxhD4uqP63PPm236TA/exec'

const detectarPestana = (nombre) => {
  const n = nombre.toLowerCase()
  if (n.includes('minilongfill')) return 'MiniLongfill'
  if (n.includes('longfill')) return 'Longfill'
  if (n.startsWith('sales') || n.startsWith('sale ')) return 'Sales'
  if (n.includes('aromanic')) return 'Aromanic'
  if (n.startsWith('aroma')) return 'Aromas'
  if (n.includes('base') || n.includes('bases')) return 'Bases'
  if (n.includes('nicokit')) return 'Nicokits'
  if (n.includes('cafeina') || n.includes('nicotina') || n.includes('pouche')) return 'Cafeina & Nicotina'
  return 'Desechables'
}

const sheetsLeer = async (pestana) => {
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ accion: 'leer', pestana })
  })
  const data = await resp.json()
  if (data.error) throw new Error(data.error)
  return data.valores || []
}

const sheetsEscribir = async (pestana, fila, columna, valor) => {
  await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ accion: 'escribir', pestana, fila, columna, valor })
  })
}

const sheetsAnyadir = async (pestana, fila) => {
  await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ accion: 'anyadir', pestana, fila })
  })
}

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
    // SIEMPRE devuelve YYYY-MM-01 (ignoramos el día, solo mes y año)
    if (!fechaStr) return null
    const s = fechaStr.trim().replace(/\s/g, '')
    const partes = s.split('/')
    if (partes.length === 2) {
      // Formato M/AA → "1/29" = enero 2029
      const mes = parseInt(partes[0])
      const anioCorto = parseInt(partes[1])
      if (isNaN(mes) || isNaN(anioCorto)) return null
      const anio = anioCorto < 100 ? 2000 + anioCorto : anioCorto
      if (mes < 1 || mes > 12) return null
      return `${anio}-${String(mes).padStart(2,'0')}-01`
    } else if (partes.length === 3) {
      // Formato D/M/AA → "15/11/27" = noviembre 2027 (ignoramos el día 15)
      const mes = parseInt(partes[1])
      const anioCorto = parseInt(partes[2])
      if (isNaN(mes) || isNaN(anioCorto)) return null
      const anio = anioCorto < 100 ? 2000 + anioCorto : anioCorto
      if (mes < 1 || mes > 12) return null
      return `${anio}-${String(mes).padStart(2,'0')}-01`
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

      // Preparar lista de caducidades para la IA
      const listaCaducidades = caducidades.slice(0, 300).map(c => ({
        id: c.id,
        nombre: c.nombre,
        fecha: c.fecha_caducidad ? c.fecha_caducidad.slice(0,7) : null
      }))

      const prompt = `Eres un asistente para una tienda de vapeo en España. Analiza este albarán de Sinhumo.

ESTRUCTURA DEL ALBARÁN:
- Tabla con columnas: UB (primera columna izquierda), Producto, Cant.
- En la columna UB hay fechas escritas a mano (números con barras /) o nada

CÓMO LEER LAS FECHAS:
- Formato MES/AÑO: "1/29"=2029-01, "12/28"=2028-12, "7/28"=2028-07
- Formato DIA/MES/AÑO: "15/11/27"=2027-11, "17/07/26"=2026-07
- Si no hay fecha → ignora ese producto

PRODUCTOS YA EN CADUCIDADES (id, nombre, fecha YYYY-MM):
${JSON.stringify(listaCaducidades)}

Para cada producto del albarán con fecha:
1. Busca si existe en la lista anterior por nombre similar
2. Si existe Y misma fecha (año-mes) → accion "ignorar"  
3. Si existe Y fecha diferente → accion "actualizar", pon su id en id_existente
4. Si no existe → accion "crear"

Responde SOLO con JSON válido sin texto extra:
{"productos": [{"nombre": "nombre completo", "fecha_raw": "fecha escrita", "accion": "crear|actualizar|ignorar", "id_existente": null}]}

Si no hay productos con fecha: {"productos": []}` 

      const texto = await callOpenAI(prompt, base64, fechasImg.type || 'image/jpeg')
      if (!texto) throw new Error('La IA no devolvio respuesta')

      const jsonMatch = texto.match(/\{[\s\S]*\}/)
      if (!jsonMatch) { setFechasResultados([]); setFechasPaso(2); return }

      const parsed = JSON.parse(jsonMatch[0])
      const items = parsed.productos || []

      if (items.length === 0) { setFechasResultados([]); setFechasPaso(2); return }

      // Función para comparar solo año y mes
      const anioMes = (f) => {
        if (!f) return null
        return String(f).trim().slice(0, 7)
      }

      const resultados = items
        .filter(item => item.accion !== 'ignorar') // ignorar los que ya tienen la misma fecha
        .map(item => {
          try {
            const fechaISO = parsearFechaAlbaran(item.fecha_raw || item.fecha || '')
            if (!fechaISO) return null
            const existente = item.id_existente ? caducidades.find(c => c.id === item.id_existente) : null
            return {
              nombre: item.nombre,
              fecha_raw: item.fecha_raw || item.fecha || '',
              fecha: fechaISO,
              accion: item.accion || 'crear', // 'crear' o 'actualizar'
              id_existente: item.id_existente || null,
              encontrado: existente || null,
              ignorar: false,
              yaExiste: false
            }
          } catch(e) { return null }
        }).filter(item => item && item.fecha)

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
    let creados = 0
    let ignorados = 0
    let actualizados = 0

    try {
      for (const item of fechasResultados) {
        if (item.ignorar) continue

        const pestana = detectarPestana(item.nombre)
        const filas = await sheetsLeer(pestana)
        if (!filas || filas.length === 0) continue

        // Detectar columnas de caducidad en cabecera
        const cabecera = filas[0].map(c => (c || '').toLowerCase())
        const colsCaducidad = []
        cabecera.forEach((c, i) => {
          if (c.includes('caducidad')) colsCaducidad.push(i)
        })
        if (colsCaducidad.length === 0) continue

        // Buscar producto en la hoja
        const nombreItem = item.nombre.toLowerCase().replace(/opciones[^,]*/gi, '').trim()
        const palabrasItem = nombreItem.split(' ').filter(w => w.length > 3)

        let filaIdx = -1
        let mejorScore = 0
        for (let i = 1; i < filas.length; i++) {
          const nombreFila = (filas[i][1] || '').toLowerCase()
          const score = palabrasItem.filter(w => nombreFila.includes(w)).length
          if (score >= 2 && score > mejorScore) {
            mejorScore = score
            filaIdx = i
          }
        }

        // Formato fecha MM/YYYY para el Sheet
        const fechaSheet = item.fecha ? item.fecha.slice(5, 7) + '/' + item.fecha.slice(0, 4) : ''
        const anioMesItem = item.fecha ? item.fecha.slice(0, 7) : ''

        if (filaIdx >= 0) {
          const fila = filas[filaIdx]
          let yaExiste = false
          let colVacia = -1

          for (const col of colsCaducidad) {
            const val = (fila[col] || '').trim()
            if (!val || val === 'SIN FECHA') {
              if (colVacia === -1) colVacia = col
            } else {
              const partes = val.split('/')
              if (partes.length === 2) {
                const anioMesFila = partes[1] + '-' + partes[0].padStart(2, '0')
                if (anioMesFila === anioMesItem) { yaExiste = true; break }
              }
            }
          }

          if (yaExiste) {
            ignorados++
          } else if (colVacia >= 0) {
            await sheetsEscribir(pestana, filaIdx + 1, colVacia + 1, fechaSheet)
            actualizados++
          } else {
            // Todas llenas → sobrescribir la más antigua
            let colMasAntigua = colsCaducidad[0]
            let fechaMasAntigua = null
            for (const col of colsCaducidad) {
              const val = (fila[col] || '').trim()
              if (val && val !== 'SIN FECHA') {
                const partes = val.split('/')
                if (partes.length === 2) {
                  const fechaCol = new Date(parseInt(partes[1]), parseInt(partes[0]) - 1)
                  if (!fechaMasAntigua || fechaCol < fechaMasAntigua) {
                    fechaMasAntigua = fechaCol
                    colMasAntigua = col
                  }
                }
              }
            }
            await sheetsEscribir(pestana, filaIdx + 1, colMasAntigua + 1, fechaSheet)
            actualizados++
          }
        } else {
          // No existe → crear fila nueva
          await sheetsAnyadir(pestana, ['', item.nombre, fechaSheet])
          creados++
        }
      }
    } catch(e) {
      console.error('Sheets error:', e)
      showToast('Error: ' + e.message, 'error')
      setFechasLoading(false)
      return
    }

    let msg = ''
    if (creados > 0) msg += creados + ' nuevas'
    if (actualizados > 0) msg += (msg ? ' · ' : '') + actualizados + ' actualizadas'
    if (ignorados > 0) msg += (msg ? ' · ' : '') + ignorados + ' ya existian'
    if (!msg) msg = 'Sin cambios'
    showToast(msg)
    setModalFechas(false)
    setFechasImg(null); setFechasPreview(null); setFechasResultados([]); setFechasPaso(1)
    setFechasLoading(false)
  }


