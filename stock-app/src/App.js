import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import './App.css'

const GEMINI_KEY = 'AIzaSyD6oolRMPb5hEAtFHHspvze17BjNyKBop4'
const CATEGORIAS = ['Todas', 'Líquidos', 'Desechables', 'Pods', 'Mods', 'Resistencias', 'Accesorios', 'Nicotina', 'Otros']

function timeAgo(ts) {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (s < 60) return 'ahora mismo'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return new Date(ts).toLocaleDateString('es-ES')
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const [productos, setProductos] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState('Todas')
  const [tab, setTab] = useState('stock')
  const [toast, setToast] = useState(null)

  const [modalProducto, setModalProducto] = useState(null)
  const [modalVenta, setModalVenta] = useState(null)
  const [modalAlbaran, setModalAlbaran] = useState(false)

  const [form, setForm] = useState({ nombre: '', categoria: 'Líquidos', stock_actual: 0, stock_minimo: 5, precio: 0 })
  const [ventaForm, setVentaForm] = useState({ cantidad: 1, referencia: '' })

  const [albaranImg, setAlbaranImg] = useState(null)
  const [albaranPreview, setAlbaranPreview] = useState(null)
  const [albaranLoading, setAlbaranLoading] = useState(false)
  const [albaranResultados, setAlbaranResultados] = useState([])
  const [albaranPaso, setAlbaranPaso] = useState(1)
  const fileRef = useRef()

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchProductos = useCallback(async () => {
    const { data, error } = await supabase.from('productos').select('*').order('nombre')
    if (!error) setProductos(data || [])
    setLoading(false)
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
    const chanProd = supabase.channel('prod-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, fetchProductos)
      .subscribe()
    const chanMov = supabase.channel('mov-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movimientos' }, fetchMovimientos)
      .subscribe()
    return () => { supabase.removeChannel(chanProd); supabase.removeChannel(chanMov) }
  }, [fetchProductos, fetchMovimientos])

  const estadoProducto = (p) => {
    if (p.stock_actual === 0) return { cls: 'out', label: 'Sin stock' }
    if (p.stock_actual <= p.stock_minimo) return { cls: 'low', label: 'Stock bajo' }
    return { cls: 'ok', label: 'Correcto' }
  }

  const totalProductos = productos.length
  const valorTotal = productos.reduce((s, p) => s + (p.stock_actual * p.precio), 0)
  const stockBajo = productos.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo).length
  const sinStock = productos.filter(p => p.stock_actual === 0).length

  const productosFiltrados = productos.filter(p => {
    const matchCat = catFiltro === 'Todas' || p.categoria === catFiltro
    const matchBus = p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return matchCat && matchBus
  })

  // ── ALBARÁN CON IA ──────────────────────────────────────────────
  const handleFotoAlbaran = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAlbaranImg(file)
    setAlbaranPreview(URL.createObjectURL(file))
    setAlbaranPaso(1)
    setAlbaranResultados([])
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

      const prompt = `Eres un asistente para una tienda de vapeo en España. Analiza esta imagen: puede ser un albarán, factura, lista de pedido o foto de productos/cajas.

Extrae TODOS los productos visibles con sus cantidades. Si no hay cantidad visible, pon 1.

Responde ÚNICAMENTE con JSON válido sin texto extra:
{"productos": [{"nombre": "nombre completo del producto", "cantidad": número}]}

Si no puedes identificar productos responde: {"productos": []}

Incluye marca, modelo, sabor, nicotina y cualquier detalle del nombre.`

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: albaranImg.type || 'image/jpeg', data: base64 } }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
          })
        }
      )

      const data = await resp.json()
      const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const jsonMatch = texto.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Sin respuesta')
      const parsed = JSON.parse(jsonMatch[0])
      const items = parsed.productos || []

      const resultados = items.map(item => {
        const nombreLower = item.nombre.toLowerCase()
        const palabras = nombreLower.split(' ').filter(w => w.length > 3)
        const encontrado = productos.find(p => palabras.some(w => p.nombre.toLowerCase().includes(w)))
        return {
          nombre: item.nombre,
          cantidad: item.cantidad || 1,
          encontrado: encontrado || null,
          producto_id: encontrado?.id || null,
          crear_nuevo: !encontrado,
          categoria: 'Otros',
          ignorar: false
        }
      })

      setAlbaranResultados(resultados)
      setAlbaranPaso(2)
    } catch (err) {
      showToast('Error al analizar la imagen. Inténtalo de nuevo.', 'error')
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
        const { data: nuevo } = await supabase.from('productos').insert([{
          nombre: item.nombre, categoria: item.categoria || 'Otros',
          stock_actual: parseInt(item.cantidad), stock_minimo: 3, precio: 0, updated_at: new Date().toISOString()
        }]).select().single()
        if (nuevo) {
          await supabase.from('movimientos').insert([{ producto_id: nuevo.id, tipo: 'entrada', cantidad: parseInt(item.cantidad), referencia: 'Pedido escaneado IA - nuevo' }])
          ok++
        }
      }
    }
    showToast(`✓ ${ok} productos actualizados desde el albarán`)
    setModalAlbaran(false)
    setAlbaranImg(null); setAlbaranPreview(null); setAlbaranResultados([]); setAlbaranPaso(1)
    setAlbaranLoading(false)
  }

  // ── PRODUCTO ────────────────────────────────────────────────────
  const guardarProducto = async () => {
    if (!form.nombre.trim()) return showToast('El nombre es obligatorio', 'error')
    if (modalProducto === 'nuevo') {
      const { error } = await supabase.from('productos').insert([{ nombre: form.nombre.trim(), categoria: form.categoria, stock_actual: parseInt(form.stock_actual) || 0, stock_minimo: parseInt(form.stock_minimo) || 5, precio: parseFloat(form.precio) || 0, updated_at: new Date().toISOString() }])
      if (error) return showToast('Error al crear', 'error')
      showToast('Producto creado ✓')
    } else {
      const { error } = await supabase.from('productos').update({ nombre: form.nombre.trim(), categoria: form.categoria, stock_minimo: parseInt(form.stock_minimo) || 5, precio: parseFloat(form.precio) || 0, updated_at: new Date().toISOString() }).eq('id', modalProducto.id)
      if (error) return showToast('Error al guardar', 'error')
      showToast('Actualizado ✓')
    }
    setModalProducto(null)
  }

  const registrarVenta = async () => {
    const qty = parseInt(ventaForm.cantidad) || 1
    if (qty > modalVenta.stock_actual) return showToast('Stock insuficiente', 'error')
    await supabase.from('productos').update({ stock_actual: modalVenta.stock_actual - qty, updated_at: new Date().toISOString() }).eq('id', modalVenta.id)
    await supabase.from('movimientos').insert([{ producto_id: modalVenta.id, tipo: 'venta', cantidad: -qty, referencia: ventaForm.referencia || null }])
    showToast(`Venta: -${qty} uds ✓`)
    setModalVenta(null)
    setVentaForm({ cantidad: 1, referencia: '' })
  }

  const eliminarProducto = async (id) => {
    if (!window.confirm('¿Eliminar?')) return
    await supabase.from('productos').delete().eq('id', id)
    showToast('Eliminado')
  }

  const abrirAlbaran = () => { setAlbaranImg(null); setAlbaranPreview(null); setAlbaranResultados([]); setAlbaranPaso(1); setModalAlbaran(true) }

  if (loading) return <div className="loading-screen"><div className="loading-dot" /><span>Conectando...</span></div>

  return (
    <div className="app">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <header className="header">
        <div className="header-left">
          <div className="logo">◈ VapeStock</div>
          <div className="realtime-badge"><span className="pulse" />EN VIVO</div>
        </div>
        <div className="header-right">
          <button className="btn-albaran" onClick={abrirAlbaran}>📷 Escanear pedido</button>
          <button className="btn-tabs" onClick={() => setTab(tab === 'stock' ? 'historial' : 'stock')}>{tab === 'stock' ? '📋 Historial' : '◈ Stock'}</button>
          <button className="btn-primary" onClick={() => { setForm({ nombre: '', categoria: 'Líquidos', stock_actual: 0, stock_minimo: 5, precio: 0 }); setModalProducto('nuevo') }}>+ Nuevo producto</button>
        </div>
      </header>

      {tab === 'stock' ? (<>
        <div className="metrics">
          <div className="metric"><div className="metric-label">Total productos</div><div className="metric-value">{totalProductos}</div></div>
          <div className="metric"><div className="metric-label">Valor inventario</div><div className="metric-value">€{valorTotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
          <div className="metric warn"><div className="metric-label">Stock bajo</div><div className="metric-value">{stockBajo}</div></div>
          <div className="metric danger"><div className="metric-label">Sin stock</div><div className="metric-value">{sinStock}</div></div>
        </div>

        <div className="toolbar">
          <input className="search" placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <div className="cat-filters">
            {CATEGORIAS.map(c => <button key={c} className={`cat-btn ${catFiltro === c ? 'active' : ''}`} onClick={() => setCatFiltro(c)}>{c}</button>)}
          </div>
        </div>

        <div className="table-wrap">
          <table className="tabla">
            <thead><tr><th>Producto</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Precio</th><th>Estado</th><th>Actualizado</th><th>Acciones</th></tr></thead>
            <tbody>
              {productosFiltrados.length === 0
                ? <tr><td colSpan="8" className="empty">No hay productos que coincidan</td></tr>
                : productosFiltrados.map(p => {
                  const est = estadoProducto(p)
                  return (
                    <tr key={p.id} className={est.cls === 'out' ? 'row-out' : est.cls === 'low' ? 'row-low' : ''}>
                      <td className="td-nombre">{p.nombre}</td>
                      <td className="td-cat">{p.categoria}</td>
                      <td className={`td-stock stock-${est.cls}`}>{p.stock_actual}</td>
                      <td className="td-min">{p.stock_minimo}</td>
                      <td className="td-precio">€{Number(p.precio).toFixed(2)}</td>
                      <td><span className={`badge badge-${est.cls}`}>{est.label}</span></td>
                      <td className="td-time">{timeAgo(p.updated_at)}</td>
                      <td>
                        <div className="acciones">
                          <button className="btn-venta" onClick={() => { setModalVenta(p); setVentaForm({ cantidad: 1, referencia: '' }) }}>− Venta</button>
                          <button className="btn-entrada" onClick={async () => {
                            await supabase.from('productos').update({ stock_actual: p.stock_actual + 1, updated_at: new Date().toISOString() }).eq('id', p.id)
                            await supabase.from('movimientos').insert([{ producto_id: p.id, tipo: 'entrada', cantidad: 1, referencia: 'Entrada manual' }])
                            showToast('+1 unidad ✓')
                          }}>+ Entrada</button>
                          <button className="btn-edit" onClick={() => { setForm({ nombre: p.nombre, categoria: p.categoria, stock_actual: p.stock_actual, stock_minimo: p.stock_minimo, precio: p.precio }); setModalProducto(p) }}>✎</button>
                          <button className="btn-del" onClick={() => eliminarProducto(p.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      </>) : (
        <div className="historial">
          <h2 className="historial-title">Historial de movimientos</h2>
          <div className="table-wrap">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Referencia</th></tr></thead>
              <tbody>
                {movimientos.length === 0
                  ? <tr><td colSpan="5" className="empty">No hay movimientos aún</td></tr>
                  : movimientos.map(m => (
                    <tr key={m.id}>
                      <td className="td-time">{new Date(m.created_at).toLocaleString('es-ES')}</td>
                      <td className="td-nombre">{m.productos?.nombre || '—'}</td>
                      <td><span className={`badge badge-${m.tipo === 'venta' ? 'out' : 'ok'}`}>{m.tipo}</span></td>
                      <td className={`td-stock stock-${m.cantidad < 0 ? 'out' : 'ok'}`}>{m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</td>
                      <td className="td-cat">{m.referencia || '—'}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Producto */}
      {modalProducto && (
        <Modal title={modalProducto === 'nuevo' ? 'Nuevo producto' : 'Editar producto'} onClose={() => setModalProducto(null)}>
          <div className="modal-body">
            <label>Nombre del producto</label>
            <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Elf Bar 600 Mango Ice" />
            <label>Categoría</label>
            <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.filter(c => c !== 'Todas').map(c => <option key={c}>{c}</option>)}
            </select>
            {modalProducto === 'nuevo' && <><label>Stock inicial</label><input type="number" min="0" value={form.stock_actual} onChange={e => setForm({ ...form, stock_actual: e.target.value })} /></>}
            <label>Alerta stock mínimo</label>
            <input type="number" min="0" value={form.stock_minimo} onChange={e => setForm({ ...form, stock_minimo: e.target.value })} />
            <label>Precio unitario (€)</label>
            <input type="number" min="0" step="0.01" value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} />
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setModalProducto(null)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarProducto}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Venta */}
      {modalVenta && (
        <Modal title={`Venta — ${modalVenta.nombre}`} onClose={() => setModalVenta(null)}>
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

      {/* Modal Albarán */}
      {modalAlbaran && (
        <Modal title="📷 Escanear pedido con IA" onClose={() => setModalAlbaran(false)} wide>
          <div className="modal-body">
            {albaranPaso === 1 && (<>
              <div className="albaran-zona" onClick={() => fileRef.current.click()}>
                {albaranPreview
                  ? <img src={albaranPreview} alt="Albarán" className="albaran-preview" />
                  : <div className="albaran-placeholder">
                      <div className="albaran-icon">📷</div>
                      <div className="albaran-hint">Toca para subir foto del albarán o pedido</div>
                      <div className="albaran-sub">Funciona con albaranes, facturas o fotos de cajas</div>
                    </div>
                }
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFotoAlbaran} />
              {albaranPreview && !albaranLoading && (
                <div className="modal-footer">
                  <button className="btn-cancel" onClick={() => { setAlbaranImg(null); setAlbaranPreview(null) }}>Cambiar foto</button>
                  <button className="btn-primary" onClick={analizarAlbaran}>✦ Analizar con IA</button>
                </div>
              )}
              {albaranLoading && <div className="albaran-loading"><div className="loading-dot" /><span>La IA está leyendo el albarán...</span></div>}
            </>)}

            {albaranPaso === 2 && (<>
              <div className="albaran-resumen">
                La IA encontró <strong>{albaranResultados.length} productos</strong>. Revisa y ajusta si es necesario:
              </div>
              <div className="albaran-lista">
                {albaranResultados.map((item, i) => (
                  <div key={i} className={`albaran-item ${item.ignorar ? 'ignorado' : ''}`}>
                    <div className="albaran-item-top">
                      <div className="albaran-item-nombre">
                        <input className="albaran-nombre-input" value={item.nombre}
                          onChange={e => { const c = [...albaranResultados]; c[i] = { ...c[i], nombre: e.target.value }; setAlbaranResultados(c) }} />
                        {item.encontrado
                          ? <span className="badge badge-ok">✓ Existe en stock</span>
                          : <span className="badge badge-new">Producto nuevo</span>
                        }
                      </div>
                      <div className="albaran-item-qty">
                        <label>Uds</label>
                        <input type="number" min="1" value={item.cantidad} className="qty-small"
                          onChange={e => { const c = [...albaranResultados]; c[i] = { ...c[i], cantidad: e.target.value }; setAlbaranResultados(c) }} />
                      </div>
                      <button className={`btn-ignorar ${item.ignorar ? 'btn-ignorar-on' : ''}`}
                        onClick={() => { const c = [...albaranResultados]; c[i] = { ...c[i], ignorar: !c[i].ignorar }; setAlbaranResultados(c) }}>
                        {item.ignorar ? 'Incluir' : 'Ignorar'}
                      </button>
                    </div>
                    {item.crear_nuevo && !item.ignorar && (
                      <div className="albaran-cat-sel">
                        <label>Categoría:</label>
                        <select value={item.categoria || 'Otros'}
                          onChange={e => { const c = [...albaranResultados]; c[i] = { ...c[i], categoria: e.target.value }; setAlbaranResultados(c) }}>
                          {CATEGORIAS.filter(c => c !== 'Todas').map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setAlbaranPaso(1)}>Volver</button>
                <button className="btn-primary" onClick={confirmarAlbaran} disabled={albaranLoading}>
                  {albaranLoading ? 'Actualizando...' : `✓ Confirmar ${albaranResultados.filter(r => !r.ignorar).length} productos`}
                </button>
              </div>
            </>)}
          </div>
        </Modal>
      )}
    </div>
  )
}
