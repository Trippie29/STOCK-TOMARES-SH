import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import './App.css'

const GEMINI_KEY = 'AIzaSyD6oolRMPb5hEAtFHHspvze17BjNyKBop4'

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

function CaducidadesTab({ caducidades, cadBusqueda, setCadBusqueda, cadFiltro, setCadFiltro, supabase, showToast }) {
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

  const filtrados = caducidades.filter(c => {
    const est = estadoCaducidad(c.fecha_caducidad)
    const matchFiltro = cadFiltro === 'todos' || est.cls === cadFiltro
    const matchBus = c.nombre.toLowerCase().includes(cadBusqueda.toLowerCase())
    return matchFiltro && matchBus
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
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0
              ? <tr><td colSpan="5" className="empty">No hay productos que coincidan</td></tr>
              : filtrados.map(c => {
                const est = estadoCaducidad(c.fecha_caducidad)
                return (
                  <tr key={c.id} className={est.cls === 'caducado' ? 'row-out' : est.cls === 'muypronto' || est.cls === 'pronto' ? 'row-low' : ''}>
                    <td className="td-nombre">{c.nombre}</td>
                    <td className="td-cat">{c.categoria}</td>
                    <td className="td-time">{c.fecha_caducidad ? new Date(c.fecha_caducidad).toLocaleDateString('es-ES') : 'Sin fecha'}</td>
                    <td className={'td-stock stock-' + (est.cls === 'caducado' ? 'out' : est.cls === 'muypronto' || est.cls === 'pronto' ? 'low' : 'ok')}>
                      {est.dias !== null ? (est.dias < 0 ? est.dias + ' dias' : '+' + est.dias + ' dias') : '-'}
                    </td>
                    <td><span className={'badge badge-cad-' + est.cls}>{est.label}</span></td>
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
  const [productos, setProductos] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [caducidades, setCaducidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState('Todas')
  const [tab, setTab] = useState('stock')
  const [cadBusqueda, setCadBusqueda] = useState('')
  const [cadFiltro, setCadFiltro] = useState('todos')
  const [toast, setToast] = useState(null)

  const [modalProducto, setModalProducto] = useState(null)
  const [modalVenta, setModalVenta] = useState(null)
  const [modalEntrada, setModalEntrada] = useState(null)
  const [modalAlbaran, setModalAlbaran] = useState(false)
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
      const resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY,
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
      const texto = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : ''
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
      const resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'application/pdf', data: base64 } }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
          })
        }
      )
      const data = await resp.json()
      const texto = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : ''
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

  const eliminarProducto = async (id) => {
    if (!window.confirm('Eliminar este producto?')) return
    await supabase.from('productos').delete().eq('id', id)
    showToast('Eliminado')
  }

  if (loading) return <div className="loading-screen"><div className="loading-dot" /><span>Conectando...</span></div>

  return (
    <div className="app">
      {toast && <div className={'toast toast-' + toast.type}>{toast.msg}</div>}

      <header className="header">
        <div className="header-left">
          <div className="logo">Sinhumo Tomares Stock</div>
          <div className="realtime-badge"><span className="pulse" />EN VIVO</div>
        </div>
        <div className="header-right">
          <button className="btn-pdf" onClick={() => { setPdfFile(null); setPdfResultados([]); setPdfPaso(1); setModalVentasPDF(true) }}>PDF Ventas</button>
          <button className="btn-albaran" onClick={() => { setAlbaranImg(null); setAlbaranPreview(null); setAlbaranResultados([]); setAlbaranPaso(1); setModalAlbaran(true) }}>Escanear pedido</button>
          <button className="btn-cad" onClick={() => setTab('caducidades')}>Caducidades</button>
          <button className="btn-tabs" onClick={() => setTab(tab === 'stock' || tab === 'caducidades' ? 'historial' : 'stock')}>{tab === 'historial' ? 'Stock' : 'Historial'}</button>
          <button className="btn-primary" onClick={() => { setForm({ nombre: '', categoria: 'Nicotina', stock_actual: 0, stock_minimo: 5, precio: 0 }); setModalProducto('nuevo') }}>+ Nuevo producto</button>
        </div>
      </header>

      {tab === 'stock' ? (
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
                            <button className="btn-edit" onClick={() => { setForm({ nombre: p.nombre, categoria: p.categoria, stock_actual: p.stock_actual, stock_minimo: p.stock_minimo, precio: p.precio }); setModalProducto(p) }}>editar</button>
                            <button className="btn-del" onClick={() => eliminarProducto(p.id)}>x</button>
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
      ) : tab === 'caducidades' ? (
        <CaducidadesTab
          caducidades={caducidades}
          cadBusqueda={cadBusqueda}
          setCadBusqueda={setCadBusqueda}
          cadFiltro={cadFiltro}
          setCadFiltro={setCadFiltro}
          supabase={supabase}
          showToast={showToast}
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
    </div>
  )
}
