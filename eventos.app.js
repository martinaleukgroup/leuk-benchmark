// eventos.app.js — Acreditación y sorteo de eventos (eventos.html).
// JS plano con React.createElement (h): se edita directo acá, no hace falta compilar.
// Estilos en eventos.css. Estado compartido en vivo vía window.storage (tabla eventos_estado).
/* eslint-disable */
const INITIAL_ATTENDEES = [{
  id: "157362549",
  nombre: "Guillermina",
  apellidos: "Sersewitz",
  empresa: "Del Carmen",
  cargo: "",
  mail: "",
  propietario: "Asistente Agencia Paulo Lucia"
}, {
  id: "157403901",
  nombre: "María Andrea",
  apellidos: "Squillaci",
  empresa: "Buenas ideas de a 2",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157386449",
  nombre: "Lautaro",
  apellidos: "Alcaraz",
  empresa: "AvAtelier",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157387426",
  nombre: "Silvana",
  apellidos: "Menenendez",
  empresa: "Arket",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157387586",
  nombre: "Analia",
  apellidos: "Menéndez",
  empresa: "Arket Studio",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "119619539",
  nombre: "Natalia",
  apellidos: "Detrano",
  empresa: "El faro recoleta srl",
  cargo: "Lighting design",
  mail: "",
  propietario: "Marketing Leuk"
}, {
  id: "122579597",
  nombre: "Alan",
  apellidos: "Pejlatowicz",
  empresa: "Estudio Pejla",
  cargo: "Arquitectura",
  mail: "",
  propietario: "Marketing Leuk"
}, {
  id: "122579656",
  nombre: "Sandra Gregorio",
  apellidos: "Gregorio",
  empresa: "Sirc Iluminación",
  cargo: "Diseño de interiores",
  mail: "",
  propietario: "Marketing Leuk"
}, {
  id: "127305426",
  nombre: "Victoria",
  apellidos: "Diamore",
  empresa: "Dicha Studio",
  cargo: "Arquitectura",
  mail: "",
  propietario: "Marketing Leuk"
}, {
  id: "127305446",
  nombre: "Luciana",
  apellidos: "Gomez Cascales",
  empresa: "Ituarte",
  cargo: "",
  mail: "",
  propietario: "Marketing Leuk"
}, {
  id: "151452181",
  nombre: "Paula",
  apellidos: "Rabuszki",
  empresa: "Kf arquitectura",
  cargo: "Arquitectura",
  mail: "",
  propietario: "Asistente Agencia Paulo Lucia"
}, {
  id: "151452194",
  nombre: "Andrea",
  apellidos: "Delvento",
  empresa: "Poderosa luz y arquitectura",
  cargo: "Lighting designer",
  mail: "",
  propietario: "Asistente Agencia Paulo Lucia"
}, {
  id: "154165131",
  nombre: "Macarena",
  apellidos: "Fernandez",
  empresa: "Savior Design",
  cargo: "",
  mail: "",
  propietario: "Asistente Agencia Paulo Lucia"
}, {
  id: "157368480",
  nombre: "Barbara",
  apellidos: "Funes",
  empresa: "Baf design",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157374514",
  nombre: "Analia",
  apellidos: "Romero",
  empresa: "Estudio A",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157375891",
  nombre: "Mariana",
  apellidos: "Kusenier",
  empresa: "Mariana kusenier",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157378421",
  nombre: "Celina",
  apellidos: "Weidmann",
  empresa: "Abramzon",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157381660",
  nombre: "Rocio",
  apellidos: "Martí",
  empresa: "Gecko estudio",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157383500",
  nombre: "Constanza",
  apellidos: "Delgado",
  empresa: "Arq.constanzadel",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157383801",
  nombre: "Pilar",
  apellidos: "Manfredi",
  empresa: "Estudio gecko",
  cargo: "",
  mail: "",
  propietario: "Marketing Leuk"
}, {
  id: "157384069",
  nombre: "Julieta Antonela",
  apellidos: "Veronelli",
  empresa: "AV Atelier",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157564940",
  nombre: "Natalia",
  apellidos: "Sicardi",
  empresa: "Homie Estudio",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157571339",
  nombre: "Paula V",
  apellidos: "Aly",
  empresa: "Pola Interior Designer",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157571808",
  nombre: "Andres E",
  apellidos: "Djimondian",
  empresa: "DJI Arquitectura",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "157575986",
  nombre: "Agustina",
  apellidos: "Millefanti",
  empresa: "Dicha Studio",
  cargo: "",
  mail: "",
  propietario: "Asistente Agencia Paulo Lucia"
}, {
  id: "158041213",
  nombre: "Carlos",
  apellidos: "Nahuel Flores",
  empresa: "RIVA",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "158565149",
  nombre: "María Gabriela",
  apellidos: "Giménez",
  empresa: "Electricidad Ituarte",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "158726764",
  nombre: "Eugenia",
  apellidos: "Landaboure",
  empresa: "Estudio Eugenia Landaboure",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "158847184",
  nombre: "Edith",
  apellidos: "Katzenstein",
  empresa: "RIVA",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "158859792",
  nombre: "Sharon",
  apellidos: "Schonholz",
  empresa: "Estudio HOLZ",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "159871029",
  nombre: "Marcelo",
  apellidos: "Manrrique",
  empresa: "Savior Design",
  cargo: "",
  mail: "",
  propietario: "Asistente Agencia Paulo Lucia"
}, {
  id: "160087747",
  nombre: "Camila",
  apellidos: "Biach",
  empresa: "Constructora Santiago",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}, {
  id: "160088500",
  nombre: "Francisco",
  apellidos: "de Sousa Dias",
  empresa: "Constructora Santiago",
  cargo: "",
  mail: "",
  propietario: "Fernando Mazzetti"
}];
const STORAGE_KEY = "evento_checkin_v4";
const WINNERS_KEY = "evento_winners_v4";
const SHEETS_KEY = "evento_list_url";
const SURVEY_KEY = "evento_survey_url";

const h = React.createElement;
const baseList = () => INITIAL_ATTENDEES.map(a => ({ ...a, mail: a.mail || "", presente: false, formulario: false, manual: false }));

async function loadShared(key, fallback) {
  try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) : fallback; }
  catch (e) { return fallback; }
}
async function saveShared(key, value) {
  try { await window.storage.set(key, JSON.stringify(value), true); } catch (e) {}
}

const norm = s => String(s ?? "").trim().toLowerCase();
const nameKey = x => { const n = norm(x.nombre), a = norm(x.apellidos); return (n && a) ? n + "|" + a : ""; };
const iniciales = (n = "", a = "") => ((n[0] || "") + (a[0] || "")).toUpperCase();
const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
const porApellido = (a, b) => (a.apellidos || a.nombre || "").localeCompare(b.apellidos || b.nombre || "", "es");

function parseTs(s) {
  s = String(s ?? "").trim(); if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]); // formato d/m/aaaa
  const d = new Date(s); return isNaN(d) ? null : d;
}

// Detecta las columnas por palabras del encabezado
function detectIdx(headers) {
  const idx = cands => { const r = cands.map(x => headers.findIndex(h => h.includes(x))).find(i => i >= 0); return r === undefined ? -1 : r; };
  return {
    n: idx(["nombre", "name", "first"]), a: idx(["apellido", "last"]),
    e: idx(["empresa", "estudio", "company"]), c: idx(["cargo", "puesto", "perfil", "rol"]),
    p: idx(["contacto", "propietario", "owner", "agente"]), m: idx(["mail", "email", "correo", "e-mail"]),
    t: idx(["marca temporal", "timestamp", "fecha", "hora"]),
    cel: idx(["celular", "teléfono", "telefono", "whatsapp", "móvil", "movil", "phone"]),
  };
}
function splitCsv(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { header: [], rows: [] };
  const sp = l => l.split(",").map(c => c.replace(/^"|"$/g, "").trim());
  return { header: sp(lines[0]), rows: lines.slice(1).map(sp) };
}
function filterSince(headerRow, dataRows, sinceStr) {
  if (!sinceStr) return dataRows;
  const headers = headerRow.map(x => String(x ?? "").trim().toLowerCase());
  const ti = detectIdx(headers).t;
  if (ti < 0) return dataRows;
  const since = new Date(sinceStr + "T00:00:00");
  return dataRows.filter(c => { const d = parseTs(c[ti]); return !d || d >= since; });
}
function rowsToAttendees(headerRow, dataRows, prefix) {
  const headers = headerRow.map(x => String(x ?? "").trim().toLowerCase());
  const d = detectIdx(headers);
  const get = (c, i) => (i >= 0 && c[i] != null) ? String(c[i]).trim() : "";
  return dataRows.map((c, i) => ({
    id: prefix + i, nombre: get(c, d.n), apellidos: get(c, d.a),
    empresa: get(c, d.e), cargo: get(c, d.c), propietario: get(c, d.p), mail: get(c, d.m), celular: get(c, d.cel),
    presente: false, formulario: false, manual: false,
  })).filter(r => r.nombre || r.empresa);
}
function toSurveyRespondents(headerRow, dataRows) {
  const headers = headerRow.map(x => String(x ?? "").trim().toLowerCase());
  const d = detectIdx(headers);
  const get = (c, i) => (i >= 0 && c[i] != null) ? String(c[i]).trim() : "";
  return dataRows.map(c => ({ nombre: get(c, d.n), apellidos: get(c, d.a), mail: get(c, d.m), ts: get(c, d.t) }))
    .filter(r => r.mail || r.nombre);
}

const Icono = ({ n }) => h("span", { className: "ev-ic", "aria-hidden": "true" }, n);
const Avatar = ({ p, grande }) => h("div", { className: "ev-av" + (grande ? " grande" : "") + (p.presente && p.formulario ? " ok" : "") }, iniciales(p.nombre, p.apellidos));

const VACIO = { nombre: "", apellidos: "", empresa: "", cargo: "", propietario: "", mail: "", celular: "", formulario: false };

// Baja el listado completo a Excel
function descargarExcel(attendees, winners) {
  const si = v => v ? "Sí" : "No";
  const filas = [...attendees].sort(porApellido).map(a => ({
    "Nombre": a.nombre || "", "Apellido": a.apellidos || "", "Mail": a.mail || "", "Celular": a.celular || "",
    "Empresa o estudio": a.empresa || "", "Profesión o cargo": a.cargo || "",
    "Inscripción": a.manual ? "Sin inscripción previa" : "Inscripto",
    "Llegó": si(a.presente), "Completó la encuesta": si(a.formulario),
    "Entró al sorteo": si(a.presente && a.formulario), "Ganó": si(winners.some(w => w.id === a.id)),
  }));
  const ws = XLSX.utils.json_to_sheet(filas);
  ws["!cols"] = [14, 16, 30, 16, 26, 22, 22, 8, 20, 15, 8].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Asistentes");
  const hoy = new Date(), dd = n => String(n).padStart(2, "0");
  XLSX.writeFile(wb, `Evento - asistentes ${hoy.getFullYear()}-${dd(hoy.getMonth() + 1)}-${dd(hoy.getDate())}.xlsx`);
}

function App() {
  const [tab, setTab] = React.useState("asistentes");
  const [attendees, setAtt] = React.useState(baseList());
  const [winners, setWinners] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [filtro, setFiltro] = React.useState("todos");
  const [showAdd, setShowAdd] = React.useState(false);
  const [newP, setNewP] = React.useState(VACIO);
  const [listMode, setListMode] = React.useState("sheets");
  const [listUrl, setListUrl] = React.useState("");
  const [listSince, setListSince] = React.useState("");
  const [listSt, setListSt] = React.useState("");
  const [surveyMode, setSurveyMode] = React.useState("sheets");
  const [surveyUrl, setSurveyUrl] = React.useState("");
  const [surveySince, setSurveySince] = React.useState("");
  const [surveySt, setSurveySt] = React.useState("");
  const [raffleState, setRS] = React.useState("idle");
  const [winner, setWinner] = React.useState(null);
  const [guardado, setGuardado] = React.useState("");
  const [confirmReset, setConfirmReset] = React.useState(null);
  const listFileRef = React.useRef(null);
  const surveyFileRef = React.useRef(null);
  const ultimoLocal = React.useRef(0);
  const jsonAtt = React.useRef("");
  const jsonWin = React.useRef("");

  // Carga inicial
  React.useEffect(() => {
    (async () => {
      const s = await loadShared(STORAGE_KEY, null);
      const w = await loadShared(WINNERS_KEY, []);
      const lu = await loadShared(SHEETS_KEY, "");
      const su = await loadShared(SURVEY_KEY, "");
      if (s) { setAtt(s); jsonAtt.current = JSON.stringify(s); }
      setWinners(w); jsonWin.current = JSON.stringify(w);
      if (lu) setListUrl(lu); if (su) setSurveyUrl(su);
      setLoaded(true);
    })();
  }, []);

  // Trae los cambios de las demás personas cada 1 s (sin pisar lo que se acaba de tocar acá)
  React.useEffect(() => {
    if (!loaded) return;
    const t = setInterval(async () => {
      if (Date.now() - ultimoLocal.current < 2500) return;
      const s = await loadShared(STORAGE_KEY, null);
      const w = await loadShared(WINNERS_KEY, []);
      if (Date.now() - ultimoLocal.current < 2500) return;
      const js = JSON.stringify(s), jw = JSON.stringify(w);
      if (s && js !== jsonAtt.current) { jsonAtt.current = js; setAtt(s); }
      if (jw !== jsonWin.current) { jsonWin.current = jw; setWinners(w); }
    }, 1000);
    return () => clearInterval(t);
  }, [loaded]);

  // Cambios hechos acá: se guardan al instante
  const avisarGuardado = () => { setGuardado("Guardado"); clearTimeout(avisarGuardado.t); avisarGuardado.t = setTimeout(() => setGuardado(""), 1800); };
  const guardarAtt = next => {
    ultimoLocal.current = Date.now(); jsonAtt.current = JSON.stringify(next);
    setAtt(next); saveShared(STORAGE_KEY, next).then(avisarGuardado);
  };
  const guardarWin = next => {
    ultimoLocal.current = Date.now(); jsonWin.current = JSON.stringify(next);
    setWinners(next); saveShared(WINNERS_KEY, next);
  };

  const toggle = id => guardarAtt(attendees.map(a => a.id === id ? { ...a, presente: !a.presente } : a));
  const toggleForm = id => guardarAtt(attendees.map(a => a.id === id ? { ...a, formulario: !a.formulario } : a));

  const addManual = () => {
    if (!newP.nombre.trim()) return;
    guardarAtt([...attendees, { ...newP, id: "m_" + Date.now(), presente: true, manual: true }]);
    setNewP(VACIO); setShowAdd(false);
  };

  // Al cargar una lista: si ya había una lista o algo marcado, pregunta si es otro evento.
  // Evento nuevo → reemplaza todo (sin agregados a mano, llegadas, encuestas ni ganadores de antes).
  // Misma lista actualizada → suma los nuevos y conserva lo marcado.
  const mergeParsed = async parsed => {
    const habiaAlgo = attendees.some(a => a.manual || a.presente || a.formulario || /^(sh|xl)_/.test(String(a.id))) || winners.length > 0;
    if (habiaAlgo) {
      const nuevo = await window.lkConfirmar(
        "¿Esta lista es de un evento nuevo?\n\nEvento nuevo: se borran los inscriptos, los agregados a mano, las llegadas, las encuestas y los ganadores del evento anterior.\nMisma lista actualizada: se suman los inscriptos nuevos y se conserva lo que ya estaba marcado.",
        { ok: "Es un evento nuevo", cancelar: "Es la misma lista actualizada" });
      if (nuevo) {
        guardarAtt(parsed); guardarWin([]); setRS("idle"); setWinner(null);
        return "nuevo";
      }
    }
    const manual = attendees.filter(a => a.manual);
    const merged = parsed.map(p => {
      const f = attendees.find(a => (norm(a.mail) && norm(a.mail) === norm(p.mail)) || (a.nombre === p.nombre && a.apellidos === p.apellidos));
      return f ? { ...p, presente: f.presente, formulario: f.formulario } : p;
    });
    guardarAtt([...merged, ...manual]);
  };

  // ─── Importar la lista de inscriptos ───
  const leerHoja = async file => {
    const data = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(data, { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: "" });
  };
  const loadListSheets = async () => {
    if (!listUrl.trim()) { setListSt("Error: pegá primero el link de la hoja."); return; }
    setListSt("Cargando…");
    try {
      const res = await fetch(listUrl);
      if (!res.ok) throw new Error("no se pudo abrir el link. Revisá que la hoja esté publicada como CSV.");
      const { header, rows } = splitCsv(await res.text());
      const parsed = rowsToAttendees(header, filterSince(header, rows, listSince), "sh_");
      if (!parsed.length) throw new Error("la hoja no tiene inscriptos (o no encontré las columnas de nombre y empresa).");
      const modo = await mergeParsed(parsed); saveShared(SHEETS_KEY, listUrl);
      setListSt(`✓ Se cargaron ${plural(parsed.length, "inscripto", "inscriptos")} desde Google Sheets${modo === "nuevo" ? " (se borró el evento anterior)" : ""}.`);
    } catch (e) { setListSt("Error: " + e.message); }
  };
  const loadListExcel = async file => {
    if (!file) return; setListSt("Leyendo el archivo…");
    try {
      const aoa = await leerHoja(file);
      if (!aoa || aoa.length < 2) throw new Error("el archivo no tiene filas con datos.");
      const parsed = rowsToAttendees(aoa[0], filterSince(aoa[0], aoa.slice(1), listSince), "xl_");
      if (!parsed.length) throw new Error("no encontré las columnas de nombre y empresa.");
      const modo = await mergeParsed(parsed);
      setListSt(`✓ Se cargaron ${plural(parsed.length, "inscripto", "inscriptos")} desde ${file.name}${modo === "nuevo" ? " (se borró el evento anterior)" : ""}.`);
    } catch (e) { setListSt("Error: " + e.message); }
    finally { if (listFileRef.current) listFileRef.current.value = ""; }
  };

  // ─── Importar la encuesta y cruzarla con la lista ───
  const applySurvey = (resp, sinceStr) => {
    const since = sinceStr ? new Date(sinceStr + "T00:00:00") : null;
    const valid = resp.filter(r => { if (!since || !r.ts) return true; const d = parseTs(r.ts); return !d || d >= since; });
    const mails = new Set(valid.map(r => norm(r.mail)).filter(Boolean));
    const names = new Set(valid.map(nameKey).filter(Boolean));
    let matched = 0;
    const next = attendees.map(a => {
      const hit = (norm(a.mail) && mails.has(norm(a.mail))) || (nameKey(a) && names.has(nameKey(a)));
      if (hit) { matched++; return a.formulario ? a : { ...a, formulario: true }; }
      return a;
    });
    guardarAtt(next);
    return matched;
  };
  const textoCruce = (n, m) => `✓ ${plural(n, "respuesta", "respuestas")} · ${m} ${m === 1 ? "coincide" : "coinciden"} con la lista de inscriptos.`;
  const loadSurveySheets = async () => {
    if (!surveyUrl.trim()) { setSurveySt("Error: pegá primero el link de la hoja."); return; }
    setSurveySt("Cargando la encuesta…");
    try {
      const res = await fetch(surveyUrl);
      if (!res.ok) throw new Error("no se pudo abrir el link. Revisá que la hoja esté publicada como CSV.");
      const { header, rows } = splitCsv(await res.text());
      const resp = toSurveyRespondents(header, rows);
      if (!resp.length) throw new Error("la hoja no tiene respuestas.");
      const m = applySurvey(resp, surveySince); saveShared(SURVEY_KEY, surveyUrl);
      setSurveySt(textoCruce(resp.length, m));
    } catch (e) { setSurveySt("Error: " + e.message); }
  };
  const loadSurveyExcel = async file => {
    if (!file) return; setSurveySt("Leyendo la encuesta…");
    try {
      const aoa = await leerHoja(file);
      if (!aoa || aoa.length < 2) throw new Error("el archivo no tiene respuestas.");
      const resp = toSurveyRespondents(aoa[0], aoa.slice(1));
      if (!resp.length) throw new Error("no encontré respuestas en el archivo.");
      setSurveySt(textoCruce(resp.length, applySurvey(resp, surveySince)));
    } catch (e) { setSurveySt("Error: " + e.message); }
    finally { if (surveyFileRef.current) surveyFileRef.current.value = ""; }
  };

  // ─── Empezar de nuevo ───
  const clearMarks = () => {
    guardarAtt(attendees.map(a => ({ ...a, presente: false, formulario: false })));
    guardarWin([]); setRS("idle"); setWinner(null); setConfirmReset(null); setTab("asistentes");
  };
  const resetToBase = () => {
    guardarAtt(baseList()); guardarWin([]); setRS("idle"); setWinner(null); setConfirmReset(null); setTab("asistentes");
  };

  const doRaffle = () => {
    const pool = attendees.filter(a => a.presente && a.formulario && !winners.find(w => w.id === a.id));
    if (!pool.length) return;
    setRS("spinning"); setWinner(null);
    const start = Date.now();
    const iv = setInterval(() => {
      if (Date.now() - start >= 3000) {
        clearInterval(iv);
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        setWinner(chosen); guardarWin([...winners, chosen]); setRS("winner");
      } else setWinner(pool[Math.floor(Math.random() * pool.length)]);
    }, 80);
  };

  const presentes = attendees.filter(a => a.presente);
  const conEncuesta = attendees.filter(a => a.formulario);
  const elegibles = attendees.filter(a => a.presente && a.formulario).sort(porApellido);
  const restantes = elegibles.filter(a => !winners.find(w => w.id === a.id));
  const q = norm(search);
  const filtered = attendees
    .filter(a => filtro === "todos" || (filtro === "llegaron" ? a.presente : !a.presente))
    .filter(a => !q || [a.nombre, a.apellidos, a.empresa, a.mail, a.celular, `${a.nombre} ${a.apellidos}`].some(v => norm(v).includes(q)))
    .sort(porApellido);
  const pct = attendees.length ? Math.round(presentes.length / attendees.length * 100) : 0;

  // ═══ Encabezado ═══
  const tabs = [
    { k: "asistentes", l: "Asistentes", n: attendees.length },
    { k: "habilitados", l: "Habilitados", n: elegibles.length },
    { k: "sorteo", l: "Sorteo" },
    { k: "config", l: "Configuración" },
  ];
  const encabezado = h("header", { className: "ev-top" },
    h("div", { className: "ev-top-in" },
      h("nav", { className: "ev-tabs" }, tabs.map(t =>
        h("button", { key: t.k, className: "ev-tab" + (tab === t.k ? " on" : ""), onClick: () => setTab(t.k) },
          t.l, t.n != null && h("span", { className: "ev-tab-n" }, t.n)))),
      h("span", { className: "ev-guardado" + (guardado ? " on" : "") }, h(Icono, { n: "check" }), "Guardado")));

  // ═══ Asistentes ═══
  const resumen = h("div", { className: "ev-kpis" },
    [
      { v: attendees.length, l: "Inscriptos" },
      { v: presentes.length, l: "Llegaron", extra: attendees.length ? pct + "%" : null },
      { v: conEncuesta.length, l: "Completaron la encuesta" },
      { v: elegibles.length, l: "Entran al sorteo", ok: true },
    ].map(k => h("div", { key: k.l, className: "ev-kpi" + (k.ok ? " ok" : "") },
      h("div", { className: "ev-kpi-v" }, k.v, k.extra && h("small", null, k.extra)),
      h("div", { className: "ev-kpi-l" }, k.l))));

  const fila = a => {
    const eleg = a.presente && a.formulario;
    return h("div", { key: a.id, className: "ev-fila" + (a.presente ? " llego" : "") },
      h(Avatar, { p: a }),
      h("div", { className: "ev-persona" },
        h("div", { className: "ev-nombre" }, `${a.nombre} ${a.apellidos}`.trim(),
          a.manual && h("span", { className: "ev-chip" }, "Sin inscripción previa"),
          eleg && h("span", { className: "ev-chip ok" }, "Entra al sorteo")),
        h("div", { className: "ev-sub" }, [a.empresa, a.mail, a.celular].filter(Boolean).join(" · ") || "Sin empresa ni contacto")),
      h("div", { className: "ev-acciones" },
        h("button", { className: "ev-toggle" + (a.presente ? " on" : ""), onClick: () => toggle(a.id),
          title: a.presente ? "Tocá para desmarcar la llegada" : "Tocá cuando llegue al evento" },
          h(Icono, { n: a.presente ? "check" : "how_to_reg" }), a.presente ? "Llegó" : "Marcar llegada"),
        h("button", { className: "ev-toggle verde" + (a.formulario ? " on" : ""), onClick: () => toggleForm(a.id),
          title: a.formulario ? "Encuesta completa (tocá para desmarcar)" : "Se marca sola al cruzar la encuesta; también podés tocarla a mano" },
          h(Icono, { n: a.formulario ? "check" : "assignment_turned_in" }), a.formulario ? "Encuesta completa" : "Encuesta pendiente")));
  };

  const vistaAsistentes = h("div", { className: "ev-anim" },
    resumen,
    h("div", { className: "ev-barra" }, h("div", { style: { width: pct + "%" } })),
    h("p", { className: "ev-ayuda" },
      "Para entrar al sorteo cada persona tiene que ", h("b", null, "haber llegado"), " y ", h("b", null, "completar la encuesta"),
      ". La llegada se marca a mano; la encuesta se marca sola cuando cargás las respuestas en Configuración."),
    h("div", { className: "ev-herr" },
      h("label", { className: "ev-buscar" }, h(Icono, { n: "search" }),
        h("input", { value: search, onChange: e => setSearch(e.target.value), placeholder: "Buscar por nombre, empresa o mail…" })),
      h("div", { className: "ev-seg" }, [["todos", "Todos"], ["llegaron", "Llegaron"], ["faltan", "Todavía no llegaron"]].map(([k, l]) =>
        h("button", { key: k, className: filtro === k ? "on" : "", onClick: () => setFiltro(k) }, l))),
      h("button", { className: "ev-btn sec", onClick: () => descargarExcel(attendees, winners), disabled: !attendees.length, title: "Baja el listado completo con quién llegó, encuesta y ganadores" }, h(Icono, { n: "download" }), "Descargar Excel"),
      h("button", { className: "ev-btn", onClick: () => setShowAdd(true) }, h(Icono, { n: "person_add" }), "Agregar asistente")),
    h("div", { className: "ev-card ev-lista" },
      filtered.length === 0
        ? h("div", { className: "ev-vacio" }, attendees.length ? "No hay nadie que coincida con la búsqueda." : "Todavía no hay inscriptos. Cargá la lista en Configuración.")
        : filtered.map(fila)));

  // ═══ Habilitados ═══
  const vistaHabilitados = h("div", { className: "ev-anim ev-angosto" },
    h("div", { className: "ev-card ev-intro" },
      h("h2", null, "Habilitados para el sorteo"),
      h("p", null, "Aparecen las personas que ", h("b", null, "llegaron"), " al evento y además ", h("b", { className: "verde" }, "completaron la encuesta"),
        " (se cruza por mail o por nombre y apellido). Hoy son ", h("b", { className: "verde" }, plural(elegibles.length, "persona", "personas")), ".")),
    elegibles.length === 0
      ? h("div", { className: "ev-card ev-vacio" }, "Todavía no hay nadie que cumpla las dos condiciones.")
      : h("div", { className: "ev-card ev-lista" }, elegibles.map(a =>
          h("div", { key: a.id, className: "ev-fila" },
            h(Avatar, { p: a }),
            h("div", { className: "ev-persona" },
              h("div", { className: "ev-nombre" }, `${a.nombre} ${a.apellidos}`.trim()),
              h("div", { className: "ev-sub" }, [a.empresa, a.mail].filter(Boolean).join(" · "))),
            winners.find(w => w.id === a.id)
              ? h("span", { className: "ev-chip" }, "Ya ganó")
              : h("span", { className: "ev-chip ok" }, "Habilitado")))),
    elegibles.length > 0 && h("div", { className: "ev-centro" },
      h("button", { className: "ev-btn grande", onClick: () => setTab("sorteo") }, "Ir al sorteo")));

  // ═══ Sorteo ═══
  let escenario;
  if (raffleState === "spinning" && winner) {
    escenario = h("div", { className: "ev-girando" },
      h("div", { className: "ev-eti" }, "Sorteando…"),
      h(Avatar, { p: winner, grande: true }),
      h("div", { className: "ev-gnombre" }, `${winner.nombre} ${winner.apellidos}`.trim()));
  } else if (raffleState === "winner" && winner) {
    escenario = h("div", { className: "ev-pop" },
      h("div", { className: "ev-festejo" }, h(Icono, { n: "celebration" })),
      h("div", { className: "ev-eti" }, "¡Tenemos ganador o ganadora!"),
      h(Avatar, { p: winner, grande: true }),
      h("div", { className: "ev-gnombre" }, `${winner.nombre} ${winner.apellidos}`.trim()),
      winner.empresa && h("div", { className: "ev-gemp" }, winner.empresa),
      winner.mail && h("div", { className: "ev-gmail" }, winner.mail),
      h("div", { className: "ev-fila-btn" },
        h("button", { className: "ev-btn", onClick: doRaffle, disabled: restantes.length === 0 }, "Sortear otro premio"),
        h("button", { className: "ev-btn sec", onClick: () => { setRS("idle"); setWinner(null); } }, "Volver")));
  } else {
    escenario = h("div", null,
      h("div", { className: "ev-festejo" }, h(Icono, { n: "confirmation_number" })),
      h("h2", null, "Sorteo"),
      h("p", { className: "ev-gsub" }, restantes.length
        ? `${plural(restantes.length, "persona participa", "personas participan")}` + (winners.length ? ` · ${plural(winners.length, "premio ya sorteado", "premios ya sorteados")}` : "")
        : "Ya ganaron todas las personas habilitadas."),
      h("button", { className: "ev-btn grande", onClick: doRaffle, disabled: restantes.length === 0 },
        restantes.length ? "Sortear" : "No quedan participantes"));
  }
  const vistaSorteo = h("div", { className: "ev-anim ev-angosto" },
    elegibles.length === 0
      ? h("div", { className: "ev-card ev-vacio grande" },
          h("div", { className: "ev-festejo" }, h(Icono, { n: "confirmation_number" })),
          "Para participar del sorteo cada persona tiene que haber ", h("b", null, "llegado"), " y ", h("b", { className: "verde" }, "completado la encuesta"), ".")
      : h(React.Fragment, null,
          h("div", { className: "ev-escenario" }, escenario),
          winners.length > 0 && h("div", { className: "ev-bloque" },
            h("div", { className: "ev-titulito" }, "Ganadores"),
            h("ol", { className: "ev-ganadores" }, winners.map((w, i) =>
              h("li", { key: w.id + i }, h("b", null, `${w.nombre} ${w.apellidos}`.trim()), w.empresa ? " · " + w.empresa : "")))),
          h("div", { className: "ev-bloque" },
            h("div", { className: "ev-titulito" }, "Participan"),
            h("div", { className: "ev-chips" }, elegibles.map(p => {
              const gano = winners.find(w => w.id === p.id);
              return h("span", { key: p.id, className: "ev-part" + (gano ? " gano" : "") }, `${p.nombre} ${p.apellidos}`.trim(), gano && " · ganó");
            })))));

  // ═══ Configuración ═══
  const estado = st => st && h("div", { className: "ev-estado" + (st.startsWith("✓") ? " ok" : st.startsWith("Error") ? " error" : "") }, st);
  const selector = (modo, setModo, setSt) => h("div", { className: "ev-seg ancho" },
    [["sheets", "Link de Google Sheets"], ["excel", "Archivo Excel o CSV"]].map(([k, l]) =>
      h("button", { key: k, className: modo === k ? "on" : "", onClick: () => { setModo(k); setSt(""); } }, l)));

  const vistaConfig = h("div", { className: "ev-anim ev-angosto" },
    h("section", { className: "ev-card ev-paso" },
      h("div", { className: "ev-paso-t" }, h("span", { className: "ev-num" }, "1"), h("h3", null, "Lista de inscriptos")),
      h("p", null, "Son las respuestas del formulario de inscripción. En Google Sheets publicá la hoja como CSV (Archivo → Compartir → Publicar en la web → Valores separados por comas) y pegá el link, o subí el archivo."),
      selector(listMode, setListMode, setListSt),
      listMode === "sheets"
        ? h("div", null,
            h("label", { className: "ev-lbl" }, "Link de la hoja publicada"),
            h("input", { className: "ev-inp", value: listUrl, onChange: e => setListUrl(e.target.value), placeholder: "https://docs.google.com/spreadsheets/d/e/…/pub?output=csv" }),
            h("button", { className: "ev-btn", onClick: loadListSheets }, "Cargar inscriptos"))
        : h("div", null,
            h("input", { ref: listFileRef, type: "file", accept: ".xlsx,.xls,.csv", id: "ev-lista-arch", style: { display: "none" }, onChange: e => loadListExcel(e.target.files && e.target.files[0]) }),
            h("label", { htmlFor: "ev-lista-arch", className: "ev-btn" }, "Elegir archivo…")),
      h("div", { className: "ev-sep" },
        h("label", { className: "ev-lbl" }, "Traer sólo inscriptos desde (opcional)"),
        h("input", { type: "date", className: "ev-inp corto", value: listSince, onChange: e => setListSince(e.target.value) }),
        h("div", { className: "ev-nota" }, "Si la hoja junta varios eventos, poné la fecha de apertura de este para traer sólo a los nuevos (usa la columna \"Marca temporal\").")),
      estado(listSt)),

    h("section", { className: "ev-card ev-paso" },
      h("div", { className: "ev-paso-t" }, h("span", { className: "ev-num verde" }, "2"), h("h3", null, "Respuestas de la encuesta")),
      h("p", null, "La encuesta que se completa con el QR durante el evento. Al cargarla, cada inscripto que respondió queda con la ",
        h("b", null, "encuesta completa"), " automáticamente (se cruza por mail, o por nombre y apellido). Por eso la encuesta tiene que pedir el mail."),
      selector(surveyMode, setSurveyMode, setSurveySt),
      surveyMode === "sheets"
        ? h("div", null,
            h("label", { className: "ev-lbl" }, "Link de la hoja de respuestas publicada"),
            h("input", { className: "ev-inp", value: surveyUrl, onChange: e => setSurveyUrl(e.target.value), placeholder: "https://docs.google.com/spreadsheets/d/e/…/pub?output=csv" }),
            h("button", { className: "ev-btn", onClick: loadSurveySheets }, "Cruzar con la lista"))
        : h("div", null,
            h("input", { ref: surveyFileRef, type: "file", accept: ".xlsx,.xls,.csv", id: "ev-enc-arch", style: { display: "none" }, onChange: e => loadSurveyExcel(e.target.files && e.target.files[0]) }),
            h("label", { htmlFor: "ev-enc-arch", className: "ev-btn" }, "Elegir archivo…")),
      h("div", { className: "ev-sep" },
        h("label", { className: "ev-lbl" }, "Contar respuestas desde (opcional)"),
        h("input", { type: "date", className: "ev-inp corto", value: surveySince, onChange: e => setSurveySince(e.target.value) }),
        h("div", { className: "ev-nota" }, "Si la hoja junta encuestas de varios eventos, poné la fecha de este para no contar respuestas viejas.")),
      estado(surveySt)),

    h("section", { className: "ev-card ev-paso peligro" },
      h("h3", null, "Empezar de nuevo"),
      h("div", { className: "ev-reset" },
        confirmReset === "clear"
          ? h("div", { className: "ev-fila-btn izq" },
              h("button", { className: "ev-btn rojo", onClick: clearMarks }, "Sí, borrar llegadas, encuestas y ganadores"),
              h("button", { className: "ev-btn sec", onClick: () => setConfirmReset(null) }, "Cancelar"))
          : h("button", { className: "ev-btn sec", onClick: () => setConfirmReset("clear") }, "Preparar para un evento nuevo"),
        h("div", { className: "ev-nota" }, "Borra quién llegó, las encuestas y los ganadores, pero conserva la lista de inscriptos. Usalo antes de cada evento.")),
      h("div", { className: "ev-reset" },
        confirmReset === "base"
          ? h("div", { className: "ev-fila-btn izq" },
              h("button", { className: "ev-btn rojo", onClick: resetToBase }, "Sí, volver a la lista original"),
              h("button", { className: "ev-btn sec", onClick: () => setConfirmReset(null) }, "Cancelar"))
          : h("button", { className: "ev-btn sec", onClick: () => setConfirmReset("base") }, "Volver a la lista original"),
        h("div", { className: "ev-nota" }, "Descarta la lista importada y todo lo marcado, y vuelve a los contactos que trae la plataforma."))));

  // ═══ Ventana para agregar asistente ═══
  const modal = showAdd && h("div", { className: "ev-fondo", onClick: e => { if (e.target === e.currentTarget) setShowAdd(false); } },
    h("div", { className: "ev-modal", role: "dialog", "aria-label": "Agregar asistente" },
      h("h3", null, "Agregar asistente"),
      h("p", { className: "ev-nota" }, "Para alguien que vino sin estar inscripto. Queda marcado como que llegó."),
      [["nombre", "Nombre *", "text"], ["apellidos", "Apellido", "text"], ["mail", "Mail", "email"], ["celular", "Celular", "tel"], ["empresa", "Empresa o estudio", "text"], ["cargo", "Profesión o cargo", "text"]].map(([k, l, tipo]) =>
        h("div", { key: k, className: "ev-campo" },
          h("label", { className: "ev-lbl" }, l),
          h("input", { className: "ev-inp", type: tipo, value: newP[k], placeholder: k === "celular" ? "11 1234 5678" : "", autoFocus: k === "nombre",
            onChange: e => setNewP(p => ({ ...p, [k]: e.target.value })),
            onKeyDown: e => { if (e.key === "Enter") addManual(); } }))),
      h("label", { className: "ev-check" },
        h("input", { type: "checkbox", checked: newP.formulario, onChange: () => setNewP(p => ({ ...p, formulario: !p.formulario })) }),
        h("span", null, h("b", null, "Ya completó la encuesta"), h("br"), h("small", null, "Hace falta para entrar al sorteo"))),
      h("div", { className: "ev-fila-btn" },
        h("button", { className: "ev-btn", onClick: addManual, disabled: !newP.nombre.trim() }, "Agregar"),
        h("button", { className: "ev-btn sec", onClick: () => setShowAdd(false) }, "Cancelar"))));

  return h("div", { className: "ev" },
    encabezado,
    h("main", { className: "ev-main" },
      tab === "asistentes" && vistaAsistentes,
      tab === "habilitados" && vistaHabilitados,
      tab === "sorteo" && vistaSorteo,
      tab === "config" && vistaConfig),
    modal);
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
