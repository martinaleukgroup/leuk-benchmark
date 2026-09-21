# Setup de Modal — worker de integración de competencia

> Modal (modal.com) es donde va a vivir el **worker** que procesa las integraciones
> (bajar imágenes, embeddings ML, etiquetar, sacar specs del PDF, matchear, subir a Supabase).
> **Vos solo preparás la cuenta + el CLI + los secretos.** El código del worker lo escribo yo;
> vos lo desplegás con un comando. En tu Mac NO se instala nada pesado (torch/ML): eso lo
> arma Modal en la nube.

---

## A. Crear la cuenta (5 min)

1. Andá a **https://modal.com** → **Sign up** (con Google/GitHub o email).
2. Es **gratis** para empezar: el plan free trae **~US$30/mes de crédito**, de sobra para esto
   (el worker solo consume cuando hay una integración para procesar).

## B. Instalar y autenticar el CLI (en la Terminal de tu Mac)

```bash
pip3 install modal
modal setup
```

- `modal setup` abre el navegador y vincula el CLI con tu cuenta. Listo, no hay que configurar más.
- (Si `pip3` no existe, probá `pip install modal` o `python3 -m pip install modal`.)

## C. Cargar los secretos (las llaves, guardadas seguras en Modal — NO en el código)

El worker necesita dos llaves: la de **Anthropic** (para que Claude lea los PDF y etiquete) y la
**service_role de Supabase** (para leer la cola y escribir resultados). Se cargan **una sola vez**.

### C.1 — Rotar la key de Anthropic (importante, seguridad)
1. Entrá a **https://console.anthropic.com** → **API Keys**.
2. **Create Key** → copiala (empieza con `sk-ant-...`).
3. **Borrá la key vieja** que estaba en `~/.leuk_pricing/pricing.db` (quedó expuesta).

### C.2 — Tener a mano la service_role de Supabase
Está en tu Mac. Para verla:
```bash
cat ~/.leuk_pricing/supabase_service.txt
```
(Copiala; empieza con algo tipo `eyJ...` o `sb_secret_...`.)

### C.3 — Crear el secreto en Modal (un solo comando, reemplazá los valores)
```bash
modal secret create leuk-integracion \
  ANTHROPIC_API_KEY=sk-ant-TU-KEY-NUEVA \
  SUPABASE_URL=https://cswqoretlhppxkelysny.supabase.co \
  SUPABASE_SERVICE_KEY=TU-SERVICE-ROLE-DE-SUPABASE
```

> Alternativa sin terminal: en el dashboard de Modal → **Secrets** → **Create new secret** →
> nombre `leuk-integracion` y agregás las tres variables con esos nombres exactos.

## D. Verificar

```bash
modal secret list
```
Tenés que ver **`leuk-integracion`** en la lista. ✅

---

## Qué sigue (lo hago yo)

Cuando termines A–D, me avisás y te paso el archivo **`worker.py`** (una "Modal app").
Vos lo desplegás con:

```bash
modal deploy worker.py
```

Eso deja el worker corriendo en la nube: cada vez que cargás una integración en la app
(o cada 1–2 min, según cómo lo configuremos), la agarra, la procesa entera y sube el resultado.
Modal cobra **solo cuando el worker corre**, así que estando quieto no gasta.

## Notas

- **No** necesitás instalar torch, OpenCLIP ni faiss en tu Mac: el worker define su propia
  imagen y Modal la construye en la nube.
- El primer deploy tarda unos minutos (Modal baja el modelo ~GB una vez y lo cachea).
- Si algún comando cambió de sintaxis, `modal --help` (o `modal secret --help`) lo aclara.
