---
name: alta-competidor
description: Da de alta un competidor nuevo en el Benchmark de Leuk (o rehace la carga de uno existente) a partir de su lista de precios, catálogo y sitio web. Usala SIEMPRE que aparezca una marca de iluminación que todavía no está en el Benchmark y haya que incorporar su portfolio — aunque el pedido no diga "alta" ni "competidor": alcanza con que manden una lista de precios, un catálogo PDF o un link de una marca y pidan "subila", "cargala", "metela al benchmark", "comparala con Leuk". Usala también cuando una carga previa salió mal y hay que rehacerla, cuando hay que documentar cómo se cargó una marca, o cuando falla/hay que reprocesar un job de integración. Usala también para SUBIR la lista de precios nueva de una marca ya cargada (con receta) desde Claude: es un solo comando, `encolar_lista.py --marca` seguido del nombre corto de la marca (vonderk, artelum, wlg, lucciola) (ver "Actualizar una marca ya cargada"). NO la uses para tocar productos de Leuk.
---

# Alta de un competidor nuevo — Benchmark Leuk

Sos quien incorpora una marca nueva al Benchmark de Leuk Iluminación. La interlocutora habitual
es Martina (Análisis Comercial), pero **esta skill está escrita para que el proceso salga bien
aunque ella no esté**: todo lo que hay que preguntar, verificar y dejar documentado está acá.

---

## Antes de empezar: dónde está el código (leelo si no estás en la Mac de Martina)

Todo el código vive en el repo público `https://github.com/martinaleukgroup/leuk-benchmark`,
carpeta `plataforma/`. En la Mac de Martina la carpeta de trabajo es `~/leuk-benchmark/`; en
cualquier otra computadora es `<repo>/plataforma/`. En esta skill, **`pipeline/` significa
`~/leuk-benchmark/pipeline/` o `<repo>/plataforma/pipeline/`**, lo que exista.

Primera vez en una computadora nueva (lo hace Claude, preguntando email y contraseña a la persona):

```bash
git clone https://github.com/martinaleukgroup/leuk-benchmark.git ~/leuk-benchmark-repo   # o git pull si ya está
cd ~/leuk-benchmark-repo/plataforma/pipeline
export LEUK_ROOT=~/leuk-benchmark-repo/plataforma
python3 probar_acceso.py        # pide email y contraseña de la plataforma
```

`probar_acceso.py` tiene que dar `puede_integrar() → True`. Si da False, la cuenta no tiene rol
admin/líder/coordinación: se cambia en la app → Usuarios. **Nunca** pidas ni uses la service key:
los scripts entran con la cuenta personal y los permisos los pone Supabase.

La contraseña se tipea en la terminal (la pide `getpass`). No la escribas en archivos, en el chat
ni en comandos.

## Actualizar una marca ya cargada (lo más común)

Si la marca ya tiene receta (Vonderk, Artelum, WLG, Lucciola…), no hace falta ninguna fase:

```bash
cd <pipeline>
python3 encolar_lista.py --marca vonderk "/ruta/a/Lista Vonderk.pdf"
python3 encolar_lista.py --estado          # seguir el trabajo (listo en ~5-15 min)
```

Si el slug no existe, el script lista los disponibles. Después se revisa lo importado en la app →
Benchmark → **Nuevas integraciones**. Es lo mismo que el botón "↻ Actualizar lista".

---

## El principio que ordena todo

Cargar un competidor **no es "pasarle el PDF a la IA"**. Eso ya lo hace el worker solo y da un
resultado mediocre. El trabajo real es **entender cómo está armada la lista de esa marca en
particular** —dónde está el código, si el precio lleva IVA, si los códigos del PDF son los mismos
que los de la web, si la foto es por SKU o por familia— y **dejar eso escrito en una receta**.

> **La receta es el entregable.** Un alta sin receta es trabajo perdido: el mes que viene, cuando
> llegue la lista nueva, nadie va a saber cómo se hizo. Un alta con receta convierte todas las
> actualizaciones futuras en un botón que aprieta cualquiera desde la app.

Segundo principio, que evita el 80 % de los errores: **preferir "sin dato" antes que un dato
inventado**. Un precio equivocado en el Benchmark es peor que un precio faltante — el faltante se
ve, el equivocado se usa para cotizar.

---

## Las 7 fases

Se hacen en orden. Cada una tiene una **puerta de salida**: no se pasa a la siguiente sin eso.

| # | Fase | Puerta de salida | Referencia |
|---|------|------------------|-----------|
| 1 | **Relevar el material** | Está la lista de precios y sabemos qué falta | abajo, §1 |
| 2 | **Reconocer el formato** | Sabemos dónde vive cada dato en esa lista | `references/reconocer-lista.md` |
| 3 | **Extracción de prueba** | Martina validó una muestra de 20 productos | `references/operar.md` |
| 4 | **Extracción completa** | Todos los productos en `competencia_extra` | `references/operar.md` |
| 5 | **Imágenes** | ≥85 % con foto, y las que hay son del producto correcto | `references/imagenes.md` |
| 6 | **Matching contra Leuk** | Los aprobados comparan contra SKU de Leuk | `references/matching.md` |
| 7 | **Escribir la receta** | Receta subida y visible en la app | `references/formato-receta.md` |

Si el alta se interrumpe a mitad de camino, **escribí igual la receta con lo que sepas hasta ahí**
y marcá el estado como `parcial`. Media receta vale mucho más que ninguna.

---

## §1 — Relevar el material

Antes de tocar nada, pedí y evaluá lo que hay. El material determina qué se puede lograr.

| Material | Para qué sirve | Sin esto… |
|---|---|---|
| **Lista de precios (PDF/Excel)** | Precios y códigos. **Es lo único obligatorio.** | No hay alta posible: el Benchmark compara precios |
| **Catálogo técnico (PDF)** | Specs (potencia, lúmenes, IP, CRI…) y fotos | Los productos entran sin ficha → matchean flojo |
| **Sitio web** | Fotos limpias por código y specs de respaldo | Las fotos salen del recorte del PDF (peor calidad) |
| **Banco de imágenes del proveedor** | La mejor fuente de fotos, si existe | Se cae a la cascada de fuentes públicas (§5) |

**Preguntá siempre estas cuatro cosas** antes de arrancar — son las que más veces hicieron rehacer
trabajo:

1. **¿La lista tiene IVA incluido?** ¿Y en qué moneda está? (WLG viene en ARS y hay que pasarla a
   USD por el dólar blue; Vonderk ya viene en USD.)
2. **¿Es lista de distribuidor o precio público?** Si es de distribuidor, ¿qué descuento tiene
   aplicado? Comparar una lista neta contra una de público infla artificialmente a Leuk.
3. **¿Hay productos que se cotizan por metro o por componente** en vez de por unidad? (Perfiles,
   rieles, sistemas magnéticos — pasa en casi todas las marcas.)
4. **¿Esta marca compite de verdad con Leuk?** Si el 90 % del catálogo es un rubro que Leuk no
   hace, decilo antes de gastar el trabajo.

**Puerta de salida:** tenés la lista de precios en la mano y las cuatro respuestas anotadas. Si
falta el catálogo o la web, se sigue igual — pero dejá registrado en la receta que se cargó sin eso.

---

## Reglas que valen para todas las fases

- **Mostrá una muestra antes de correr todo.** Nunca proceses 100 páginas sin que alguien haya
  mirado 20 productos y dicho "sí, es esto". Un formato mal leído multiplica el error por mil.
- **Nunca inventes un dato.** Campo vacío si no está en la fuente. Vale para specs y sobre todo
  para precios.
- **Todo lo raro va a la receta en el momento en que lo descubrís**, no al final. Las
  particularidades se olvidan en horas.
- **Los costos de Leuk no salen nunca de la tabla con RLS.** No van al JSON público ni a la receta.
- **Cuando dudes entre dos interpretaciones de un dato, preguntá.** El alta se hace una vez; la
  duda mal resuelta queda para siempre.

---

## Estado actual (agosto 2026)

- **Cargadas y funcionando:** Vonderk, Artelum, WLG (por el pipeline offline, ver
  `PROCESO-DATOS-COMPETENCIA.md`) y **Lucciola/Metaluz** (primera por el circuito nuevo — su receta
  está en `references/recetas/lucciola.md`, sirve de ejemplo completo).
- **El worker todavía no hace imágenes solo.** La fase 5 es hoy semiautomática (scripts locales).
- **La actualización mensual** de una marca con receta se hace desde la app, no con esta skill.
