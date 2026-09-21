# Handoff · Benchmark competitivo Leuk Iluminación

Paquete de documentación técnica para **auditoría de arquitectura y propuesta de mejoras**.
Generado el **2026-07-16** contra el estado real del código y de los datos.

---

## Qué es este proyecto en una línea

App de inteligencia competitiva de pricing: dado un producto de **Leuk Iluminación** (empresa
argentina de iluminación), infiere y muestra sus equivalentes en tres competidores
(**Vonderk, Artelum, World Leds Go**) con precio comparado, fichas lado a lado y un nivel de
match calculado desde tres señales independientes (técnica, forma, imagen).

En producción, ~10 usuarios del equipo comercial. Frontend estático en GitHub Pages + Supabase;
pipeline de datos en Python que corre a mano en la máquina de la usuaria.

---

## Los archivos, en orden de lectura sugerido

| # | Archivo | Qué contiene |
|---|---|---|
| **01** | [`01-matching-engine.md`](01-matching-engine.md) | **El corazón del sistema.** Código completo del motor (`matching.py` + las funciones de señal de `consolidate.py`), explicación de las 4 etapas (gating → scoring → guardrail → clasificación), y todos los parámetros hardcodeados con su valor actual. |
| **02** | [`02-data-schema.md`](02-data-schema.md) | Las 5 fuentes de datos y cómo se unen, los 23 campos de ficha (y los 6 que se descartan), completitud real medida campo por campo, cómo se vinculan Leuk ↔ competencia sin clave compartida, y un ejemplo real completo. |
| **03** | [`03-scraping-process.md`](03-scraping-process.md) | El flujo real de carga de un competidor, incluyendo **los pasos manuales**. Código completo del track de World Leds Go (el más representativo) y del único scraping HTTP del proyecto. |
| **04** | [`04-arquitectura-general.md`](04-arquitectura-general.md) | Stack, estructura de carpetas, organización de `app.js`, flujo de datos runtime, Supabase/roles/seguridad, el diseño original y en qué derivó, y la deuda técnica visible. |

**Si sólo vas a leer una cosa:** el 01. El motor es donde está el valor y también el problema.

---

## Cinco cosas que conviene saber antes de auditar

1. **El motor decide con 3 señales, pero en la práctica la técnica casi nunca vota.** El gating
   (IP + fijación) **rechaza cuando falta el dato**, y esos campos están sólo en el ~57% de la
   competencia. Resultado: `tecnico: "No comparable"` convive con veredicto `Equivalente` en la
   enorme mayoría de los pares — el veredicto se sostiene con forma + imagen. *(detalle en 01)*

2. **El cuello de botella real no es el matching, es el precio.** De 315 pares con veredicto
   `Equivalente`, sólo **104 tienen precio de ambos lados**. *(embudo en 01)*

3. **La nomenclatura de Leuk codifica color** (`NG`=negro, `BL`=blanco, `MD`=madera), y las
   variantes de color son **el mismo producto**. Eso se usa como test de consistencia objetivo:
   si dos colores dan matches distintos, al menos uno está mal. Hoy: **97% de consistencia**
   (era 44% antes de los fixes de esta semana). *(detalle en 01)*

4. **"Scraping" es un nombre optimista.** La extracción de fichas la hace un humano con Claude
   desde PDFs, y se revisa a mano. Sumar un competidor toca código en 3 archivos. *(detalle en 03)*

5. **Los modos "Comercial" y "Analista" no existen** — están en el diseño original pero la app
   derivó a 4 páginas. Ojo que las claves internas quedaron con los nombres viejos
   (`resultados` = la página "Comparaciones", `decisiones` = "Insights"). *(detalle en 04)*

---

## Estado de los datos hoy (medido)

```
561  productos Leuk           474 (85%) con al menos 1 match
521  (93%) con precio         547 (98%) con imagen        515 (92%) con etiquetas IA
875  entidades de competencia (Vonderk 347 · Artelum 249 · WLG 279)
```

Fixes aplicados en los últimos días (contexto para no auditar un bug ya resuelto):
- **Normalización del score**: el motor *premiaba la falta de datos* (un candidato sin ficha se
  salteaba el 45% del peso técnico y quedaba arriba). Corregido.
- **Color fuera del matching**: pesaba en las 3 señales y rompía la consistencia entre variantes.
- **Desempate por ficha**: había 11 candidatos empatados en el mismo score y ganaba el primero
  del diccionario (al azar).

Pendientes conocidos: `DYNA 240` matchea una tira LED; los DYNA matchean `WALLY FIT` en WLG
cuando deberían ir a `linear`.

---

## ⚠️ Antes de compartir este paquete

- **Se verificó que no contiene credenciales**: ni la `service_role` key de Supabase, ni la API
  key de Anthropic. La única clave presente es la *publishable* de Supabase, que es pública por
  diseño.
- **Sí contiene información comercial sensible**: la tabla de **descuentos por competidor**
  (Vonderk 68.55%, Artelum 38.25%, WLG 51.4%) y precios de lista. Es interno de Leuk. Tenelo en
  cuenta según con quién se comparta.
- Esta carpeta vive en `~/leuk-benchmark/handoff-fable5/`, que **no es parte del repo git** —
  no se publica en GitHub Pages.
