# Benchmark competitivo · Leuk Iluminación

App web para comparar **precios y datos técnicos** de los productos de Leuk contra la competencia (**Vonderk, Artelum, World Leds Go**).

🔗 **App:** https://martinaleukgroup.github.io/leuk-benchmark/ — requiere iniciar sesión.

---

## 📖 Cómo se usa (equipo comercial)

1. **Ingresar.** La app pide usuario y contraseña. Sin sesión no se ve nada (ni la app ni los datos).
2. **Inicio.** Página de bienvenida con accesos rápidos y esta guía.
3. **Catálogo.** Buscá un producto Leuk por SKU o nombre y abrilo. Vas a ver sus equivalentes en cada competidor, con:
   - **Precio neto** (con el descuento de cada marca) y la **diferencia %**.
   - **Nivel de match** por 3 señales: **técnica** (ficha), **forma** (etiquetado visual) e **imagen**. Cuantas más señales coinciden, más confiable (≥2 = confiable; 1 = “a revisar”).
4. **Seleccionar.** Con **“＋ Seleccionar”** confirmás una comparación válida. Queda **guardada y compartida con todo el equipo** (con tu nombre), y aparece en **Comparaciones**.
5. **Comparaciones.** Todas las comparaciones seleccionadas, con la diferencia de precio neto. Se pueden **exportar a CSV**.
6. **Insights.** Panorama de pricing: posición de precio por familia, oportunidades y comparador de escenarios **Partner vs Cliente**.
7. **⚙ Descuentos.** Cambiá los descuentos (Leuk Partner/Cliente y competencia) para simular escenarios de precio neto.

> ⚠️ Las comparaciones sin precio o marcadas con **⚠** pueden ser de otra gama — conviene revisarlas antes de seleccionar.

---

## 🔧 Administración

### Actualizar precios (desde la app)
Botón **“⬆ Precios”** (arriba). Elegís **la marca** de la lista y subís el **Excel** (columnas *SKU/código* + *Precio*). Muestra un resumen (cuántos matchean) y actualiza todos de una. Queda registrado quién lo subió.
- **Leuk:** matchea por SKU exacto.
- **Competencia:** matchea por código de producto (validá el resumen antes de aplicar).

### Usuarios (quién puede entrar)
Se gestionan en **Supabase → Authentication → Users**. Agregar usuario = dar acceso; borrarlo = quitar acceso. (Crear con *Auto Confirm*, sin depender de mails.)

### Actualizar el benchmark completo (datos)
Cuando cambian productos/matches/imágenes (no solo precios), se regenera desde el pipeline (requiere la máquina con el proyecto):
```bash
cd ~/leuk-benchmark/pipeline
python3 consolidate.py     # regenera data/benchmark_data.json
python3 subir_datos.py     # lo sube al bucket privado de Supabase (lo que la app descarga tras el login)
```

---

## 🏗️ Arquitectura (técnico)

- **Front:** app estática (HTML/CSS/JS vanilla), servida por **GitHub Pages**. Sin build.
- **Login:** **Supabase Auth** (email + contraseña). Toda la app está detrás del login.
- **Datos:** el benchmark **NO** está en el sitio público. Se descarga tras el login desde un **bucket privado de Supabase Storage** (`datos/benchmark_data.json`, RLS: solo usuarios autenticados). Por eso no hay `data.js` público.
- **Precios editados y autorizaciones:** tablas en Supabase (`precios`, `autorizaciones`), compartidas entre el equipo. Escritura de precios: solo usuarios logueados.
- **Pipeline (Python):** consolida DB + fichas técnicas + etiquetas + imágenes + matching (3 señales, OpenCLIP + Claude visión) → `benchmark_data.json`. Ver `pipeline/`.

### Publicar cambios de la app
```bash
~/leuk-benchmark/publicar.sh "mensaje del cambio"   # commit + push; Pages reconstruye en 1-2 min
```
(Subir la versión `?v=N` en `index.html` al cambiar app.js/styles.css para evitar caché.)

> **Nota de seguridad:** el login protege el acceso y los datos (que están detrás de auth). El repositorio es público porque GitHub Pages gratis lo requiere; no contiene datos sensibles (los datos viven en Supabase).
