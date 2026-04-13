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
          <img src="data:image/jpeg;base64,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" alt="Sinhumo" className="logo-img" />
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
