// eventos.app.js — componente Check-in & Sorteo PRE-COMPILADO (JSX → JS plano).
// FUENTE EDITABLE: eventos.src.jsx (no servido). Para regenerar: transpilar ese JSX con
// Babel runtime clásico → volcar acá. Tematizado con la paleta de la plataforma (claro/olivo/Barlow).
/* eslint-disable */
const {
  useState,
  useEffect,
  useRef
} = React;
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
const baseList = () => INITIAL_ATTENDEES.map(a => ({
  ...a,
  mail: a.mail || "",
  presente: false,
  formulario: false,
  manual: false
}));
async function loadShared(key, fallback) {
  try {
    const r = await window.storage.get(key, true);
    return r ? JSON.parse(r.value) : fallback;
  } catch {
    return fallback;
  }
}
async function saveShared(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value), true);
  } catch {}
}
const norm = s => String(s ?? "").trim().toLowerCase();
const nameKey = x => {
  const n = norm(x.nombre),
    a = norm(x.apellidos);
  return n && a ? n + "|" + a : "";
};
function getInitials(n = "", a = "") {
  return ((n[0] || "") + (a[0] || "")).toUpperCase();
}
function parseTs(s) {
  s = String(s ?? "").trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]); // formato d/m/aaaa (es-AR)
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// detección de columnas por palabras clave del encabezado
function detectIdx(headers) {
  const idx = cands => {
    const r = cands.map(x => headers.findIndex(h => h.includes(x))).find(i => i >= 0);
    return r === undefined ? -1 : r;
  };
  return {
    n: idx(["nombre", "name", "first"]),
    a: idx(["apellido", "last"]),
    e: idx(["empresa", "estudio", "company"]),
    c: idx(["cargo", "puesto", "perfil", "rol"]),
    p: idx(["contacto", "propietario", "owner", "agente"]),
    m: idx(["mail", "email", "correo", "e-mail"]),
    t: idx(["marca temporal", "timestamp", "fecha", "hora"])
  };
}
function splitCsv(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return {
    header: [],
    rows: []
  };
  const sp = l => l.split(",").map(c => c.replace(/^"|"$/g, "").trim());
  return {
    header: sp(lines[0]),
    rows: lines.slice(1).map(sp)
  };
}
function filterSince(headerRow, dataRows, sinceStr) {
  if (!sinceStr) return dataRows;
  const headers = headerRow.map(h => String(h ?? "").trim().toLowerCase());
  const ti = detectIdx(headers).t;
  if (ti < 0) return dataRows;
  const since = new Date(sinceStr + "T00:00:00");
  return dataRows.filter(c => {
    const d = parseTs(c[ti]);
    return !d || d >= since;
  });
}
function rowsToAttendees(headerRow, dataRows, prefix) {
  const headers = headerRow.map(h => String(h ?? "").trim().toLowerCase());
  const d = detectIdx(headers);
  const get = (c, i) => i >= 0 && c[i] != null ? String(c[i]).trim() : "";
  return dataRows.map((c, i) => ({
    id: prefix + i,
    nombre: get(c, d.n),
    apellidos: get(c, d.a),
    empresa: get(c, d.e),
    cargo: get(c, d.c),
    propietario: get(c, d.p),
    mail: get(c, d.m),
    presente: false,
    formulario: false,
    manual: false
  })).filter(r => r.nombre || r.empresa);
}
function toSurveyRespondents(headerRow, dataRows) {
  const headers = headerRow.map(h => String(h ?? "").trim().toLowerCase());
  const d = detectIdx(headers);
  const get = (c, i) => i >= 0 && c[i] != null ? String(c[i]).trim() : "";
  return dataRows.map(c => ({
    nombre: get(c, d.n),
    apellidos: get(c, d.a),
    mail: get(c, d.m),
    ts: get(c, d.t)
  })).filter(r => r.mail || r.nombre);
}
const PROP_COLORS = {
  "Fernando Mazzetti": {
    bg: "#e6edf5",
    text: "#3a6ea5"
  },
  "Marketing Leuk": {
    bg: "#e7f0e1",
    text: "#4f7a3f"
  },
  "Asistente Agencia Paulo Lucia": {
    bg: "#efe6f7",
    text: "#7a54b0"
  }
};
function Badge({
  name
}) {
  if (!name) return null;
  const c = PROP_COLORS[name] || {
    bg: "#e4e6dd",
    text: "#8a8c82"
  };
  const short = name === "Asistente Agencia Paulo Lucia" ? "Agencia P.L." : name;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      background: c.bg,
      color: c.text,
      fontSize: 10,
      fontFamily: "'Barlow',monospace",
      padding: "2px 8px",
      borderRadius: 4,
      whiteSpace: "nowrap",
      fontWeight: 500
    }
  }, short);
}
function App() {
  const [tab, setTab] = useState("checkin");
  const [attendees, setAtt] = useState(baseList());
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newP, setNewP] = useState({
    nombre: "",
    apellidos: "",
    empresa: "",
    cargo: "",
    propietario: "",
    mail: "",
    formulario: false
  });
  // import lista
  const [listMode, setListMode] = useState("sheets");
  const [listUrl, setListUrl] = useState("");
  const [listSince, setListSince] = useState("");
  const [listSt, setListSt] = useState("");
  // import encuesta
  const [surveyMode, setSurveyMode] = useState("sheets");
  const [surveyUrl, setSurveyUrl] = useState("");
  const [surveySince, setSurveySince] = useState("");
  const [surveySt, setSurveySt] = useState("");
  // sorteo
  const [raffleState, setRS] = useState("idle");
  const [winner, setWinner] = useState(null);
  const [winners, setWinners] = useState([]);
  const [syncMsg, setSyncMsg] = useState("");
  const [confirmReset, setConfirmReset] = useState(null);
  const [wide, setWide] = useState(window.innerWidth >= 768);
  const listFileRef = useRef(null);
  const surveyFileRef = useRef(null);
  useEffect(() => {
    const fn = () => setWide(window.innerWidth >= 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  useEffect(() => {
    (async () => {
      const s = await loadShared(STORAGE_KEY, null);
      const w = await loadShared(WINNERS_KEY, []);
      const lu = await loadShared(SHEETS_KEY, "");
      const su = await loadShared(SURVEY_KEY, "");
      if (s) setAtt(s);
      setWinners(w);
      if (lu) setListUrl(lu);
      if (su) setSurveyUrl(su);
      setLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setInterval(async () => {
      const s = await loadShared(STORAGE_KEY, null);
      if (s) setAtt(s);
      setWinners(await loadShared(WINNERS_KEY, []));
    }, 1000);
    return () => clearInterval(t);
  }, [loaded]);
  useEffect(() => {
    if (!loaded) return;
    saveShared(STORAGE_KEY, attendees).then(() => {
      setSyncMsg("✓ Sync");
      setTimeout(() => setSyncMsg(""), 1800);
    });
  }, [attendees, loaded]);
  useEffect(() => {
    if (loaded) saveShared(WINNERS_KEY, winners);
  }, [winners, loaded]);
  const toggle = id => setAtt(p => p.map(a => a.id === id ? {
    ...a,
    presente: !a.presente
  } : a));
  const toggleForm = id => setAtt(p => p.map(a => a.id === id ? {
    ...a,
    formulario: !a.formulario
  } : a));
  const addManual = () => {
    if (!newP.nombre.trim()) return;
    setAtt(p => [...p, {
      ...newP,
      id: "m_" + Date.now(),
      presente: true,
      manual: true
    }]);
    setNewP({
      nombre: "",
      apellidos: "",
      empresa: "",
      cargo: "",
      propietario: "",
      mail: "",
      formulario: false
    });
    setShowAdd(false);
  };
  const mergeParsed = parsed => setAtt(prev => {
    const manual = prev.filter(a => a.manual);
    const merged = parsed.map(p => {
      const f = prev.find(a => norm(a.mail) && norm(a.mail) === norm(p.mail) || a.nombre === p.nombre && a.apellidos === p.apellidos);
      return f ? {
        ...p,
        presente: f.presente,
        formulario: f.formulario
      } : p;
    });
    return [...merged, ...manual];
  });

  // ─── importar LISTA ───────────────────────────────────────────────────
  const loadListSheets = async () => {
    if (!listUrl.trim()) return;
    setListSt("Cargando…");
    try {
      const res = await fetch(listUrl);
      if (!res.ok) throw new Error("No se pudo acceder al link");
      const {
        header,
        rows
      } = splitCsv(await res.text());
      const parsed = rowsToAttendees(header, filterSince(header, rows, listSince), "sh_");
      if (!parsed.length) throw new Error("No se detectaron inscriptos");
      mergeParsed(parsed);
      saveShared(SHEETS_KEY, listUrl);
      setListSt(`✓ ${parsed.length} inscriptos cargados desde Sheets`);
      setTimeout(() => setListSt(""), 3500);
    } catch (e) {
      setListSt("Error: " + e.message);
    }
  };
  const loadListExcel = async file => {
    if (!file) return;
    setListSt("Leyendo archivo…");
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(data, {
        type: "array"
      });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        header: 1,
        blankrows: false,
        defval: ""
      });
      if (!aoa || aoa.length < 2) throw new Error("El archivo no tiene filas de datos");
      const parsed = rowsToAttendees(aoa[0], filterSince(aoa[0], aoa.slice(1), listSince), "xl_");
      if (!parsed.length) throw new Error("No se detectaron columnas de nombre/empresa");
      mergeParsed(parsed);
      setListSt(`✓ ${parsed.length} inscriptos cargados desde ${file.name}`);
      setTimeout(() => setListSt(""), 3500);
    } catch (e) {
      setListSt("Error: " + e.message);
    } finally {
      if (listFileRef.current) listFileRef.current.value = "";
    }
  };

  // ─── importar ENCUESTA + cruce automático ───────────────────────────────
  const applySurvey = (resp, sinceStr) => {
    const since = sinceStr ? new Date(sinceStr + "T00:00:00") : null;
    const valid = resp.filter(r => {
      if (!since || !r.ts) return true;
      const d = parseTs(r.ts);
      return !d || d >= since;
    });
    const mails = new Set(valid.map(r => norm(r.mail)).filter(Boolean));
    const names = new Set(valid.map(nameKey).filter(Boolean));
    let matched = 0;
    const next = attendees.map(a => {
      const hit = norm(a.mail) && mails.has(norm(a.mail)) || nameKey(a) && names.has(nameKey(a));
      if (hit) {
        matched++;
        return a.formulario ? a : {
          ...a,
          formulario: true
        };
      }
      return a;
    });
    setAtt(next);
    return matched;
  };
  const loadSurveySheets = async () => {
    if (!surveyUrl.trim()) return;
    setSurveySt("Cargando encuesta…");
    try {
      const res = await fetch(surveyUrl);
      if (!res.ok) throw new Error("No se pudo acceder al link");
      const {
        header,
        rows
      } = splitCsv(await res.text());
      const resp = toSurveyRespondents(header, rows);
      if (!resp.length) throw new Error("No se encontraron respuestas");
      const m = applySurvey(resp, surveySince);
      saveShared(SURVEY_KEY, surveyUrl);
      setSurveySt(`✓ ${resp.length} respuestas · ${m} cruzadas con la lista`);
      setTimeout(() => setSurveySt(""), 4500);
    } catch (e) {
      setSurveySt("Error: " + e.message);
    }
  };
  const loadSurveyExcel = async file => {
    if (!file) return;
    setSurveySt("Leyendo encuesta…");
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(data, {
        type: "array"
      });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        header: 1,
        blankrows: false,
        defval: ""
      });
      if (!aoa || aoa.length < 2) throw new Error("El archivo no tiene respuestas");
      const resp = toSurveyRespondents(aoa[0], aoa.slice(1));
      if (!resp.length) throw new Error("No se detectaron respuestas");
      const m = applySurvey(resp, surveySince);
      setSurveySt(`✓ ${resp.length} respuestas · ${m} cruzadas con la lista`);
      setTimeout(() => setSurveySt(""), 4500);
    } catch (e) {
      setSurveySt("Error: " + e.message);
    } finally {
      if (surveyFileRef.current) surveyFileRef.current.value = "";
    }
  };

  // ─── reset ──────────────────────────────────────────────────────────────
  const clearMarks = () => {
    const fresh = attendees.map(a => ({
      ...a,
      presente: false,
      formulario: false
    }));
    setAtt(fresh);
    setWinners([]);
    setRS("idle");
    setWinner(null);
    saveShared(STORAGE_KEY, fresh);
    saveShared(WINNERS_KEY, []);
    setConfirmReset(null);
    setTab("checkin");
  };
  const resetToBase = () => {
    const fresh = baseList();
    setAtt(fresh);
    setWinners([]);
    setRS("idle");
    setWinner(null);
    saveShared(STORAGE_KEY, fresh);
    saveShared(WINNERS_KEY, []);
    setConfirmReset(null);
    setTab("checkin");
  };
  const doRaffle = () => {
    const pool = attendees.filter(a => a.presente && a.formulario && !winners.find(w => w.id === a.id));
    if (!pool.length) return;
    setRS("spinning");
    setWinner(null);
    const start = Date.now();
    const iv = setInterval(() => {
      if (Date.now() - start >= 3000) {
        clearInterval(iv);
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        setWinner(chosen);
        setWinners(w => [...w, chosen]);
        setRS("winner");
      } else {
        setWinner(pool[Math.floor(Math.random() * pool.length)]);
      }
    }, 80);
  };
  const presentes = attendees.filter(a => a.presente);
  const elegibles = attendees.filter(a => a.presente && a.formulario);
  const restantes = elegibles.filter(a => !winners.find(w => w.id === a.id));
  const filtered = attendees.filter(a => {
    const q = search.toLowerCase();
    return !q || [a.nombre, a.apellidos, a.empresa, a.mail].some(v => (v || "").toLowerCase().includes(q));
  }).sort((a, b) => (a.apellidos || "").localeCompare(b.apellidos || ""));
  const pct = attendees.length ? Math.round(presentes.length / attendees.length * 100) : 0;

  // ─── styles ───────────────────────────────────────────────────────────
  const card = {
    background: "#ffffff",
    border: "1px solid #e4e6dd",
    borderRadius: 12,
    padding: wide ? "24px 28px" : "18px 16px"
  };
  const btn = (grad = true) => ({
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    cursor: "pointer",
    fontFamily: "'Barlow',sans-serif",
    fontSize: 13,
    fontWeight: 600,
    background: grad ? "linear-gradient(135deg,#676b55,#565a45)" : "#eef0e8",
    color: grad ? "#fff" : "#8a8c82"
  });
  const inp = {
    width: "100%",
    background: "#fbfbf9",
    border: "1px solid #e4e6dd",
    borderRadius: 8,
    padding: "9px 13px",
    color: "#2b2c26",
    fontSize: 13,
    fontFamily: "'Barlow',sans-serif",
    outline: "none"
  };
  const stateBtn = (active, activeBg, activeBorder) => ({
    width: 34,
    height: 34,
    borderRadius: 8,
    border: `1px solid ${active ? activeBorder : "#e4e6dd"}`,
    cursor: "pointer",
    flexShrink: 0,
    fontSize: 13,
    fontWeight: 700,
    background: active ? activeBg : "#eef0e8",
    color: active ? "#fff" : "#a2a498",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Barlow',monospace"
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "#fbfbf9",
      color: "#2b2c26",
      fontFamily: "'Barlow',sans-serif"
    }
  }, /*#__PURE__*/React.createElement("link", {
    href: "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap",
    rel: "stylesheet"
  }), /*#__PURE__*/React.createElement("style", null, `
*{box-sizing:border-box}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes pop{0%{transform:scale(.7);opacity:0}65%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
@keyframes flash{0%,100%{opacity:1}50%{opacity:.4}}
.row:hover{background:rgba(0,0,0,.035)!important}
.chk{transition:all .15s}.chk:hover{transform:scale(1.08);opacity:.85}
input:focus,textarea:focus{border-color:#676b55!important;outline:none}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#ffffff}::-webkit-scrollbar-thumb{background:#d6d8cd;border-radius:99px}
`), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#ffffff",
      borderBottom: "1px solid #e4e6dd",
      padding: "0 20px",
      position: "sticky",
      top: 0,
      zIndex: 100
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1280,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 58,
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: "linear-gradient(135deg,#676b55,#565a45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 13
    }
  }, "✦"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed',sans-serif",
      fontWeight: 700,
      fontSize: 14,
      color: "#2b2c26",
      lineHeight: 1
    }
  }, "Check-in & Sorteo"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#a2a498",
      fontFamily: "'Barlow',monospace",
      marginTop: 1
    }
  }, "Leuk · Eventos"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, syncMsg && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "#4f7a3f",
      fontFamily: "'Barlow',monospace",
      animation: "fadeUp .2s"
    }
  }, syncMsg), [{
    v: elegibles.length,
    l: "EN SORTEO",
    c: "#4f7a3f"
  }, {
    v: presentes.length,
    l: "PRESENTES",
    c: "#676b55"
  }, {
    v: attendees.length,
    l: "INSCRIPTOS",
    c: "#8a8c82"
  }].map(s => /*#__PURE__*/React.createElement("div", {
    key: s.l,
    style: {
      textAlign: "center",
      padding: "3px 12px",
      background: "#eef0e8",
      borderRadius: 8,
      border: "1px solid #e4e6dd"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      fontFamily: "'Barlow Condensed',sans-serif",
      color: s.c,
      lineHeight: 1.1
    }
  }, s.v), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#a2a498",
      fontFamily: "'Barlow',monospace"
    }
  }, s.l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 0,
      overflowX: "auto"
    }
  }, [{
    k: "checkin",
    l: "Inscriptos"
  }, {
    k: "eligibles",
    l: `Habilitados · ${elegibles.length}`
  }, {
    k: "raffle",
    l: `Sorteo · ${restantes.length}`
  }, {
    k: "config",
    l: "⚙ Configuración"
  }].map(t => /*#__PURE__*/React.createElement("button", {
    key: t.k,
    onClick: () => setTab(t.k),
    style: {
      background: "none",
      border: "none",
      borderBottom: tab === t.k ? "2px solid #676b55" : "2px solid transparent",
      cursor: "pointer",
      padding: "11px 16px",
      fontSize: 12,
      fontWeight: 500,
      fontFamily: "'Barlow',sans-serif",
      color: tab === t.k ? "#676b55" : "#8a8c82",
      whiteSpace: "nowrap",
      transition: "all .2s",
      flexShrink: 0
    }
  }, t.l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1280,
      margin: "0 auto",
      padding: wide ? "24px 20px" : "14px 12px"
    }
  }, tab === "checkin" && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: "fadeUp .3s"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#eef3ea",
      border: "1px solid #cfe0d2",
      borderRadius: 10,
      padding: "10px 14px",
      marginBottom: 12,
      fontSize: 12,
      color: "#4f7a3f",
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...stateBtn(true, "linear-gradient(135deg,#676b55,#565a45)", "#676b5520"),
      width: 24,
      height: 24,
      fontSize: 11
    }
  }, "✓"), /*#__PURE__*/React.createElement("span", null, "Presente (a mano)"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#a2a498"
    }
  }, "+"), /*#__PURE__*/React.createElement("span", {
    style: {
      ...stateBtn(true, "linear-gradient(135deg,#4f7a3f,#3d6130)", "#4f7a3f30"),
      width: 24,
      height: 24,
      fontSize: 11
    }
  }, "F"), /*#__PURE__*/React.createElement("span", null, "Encuesta (automático)"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#a2a498",
      marginLeft: "auto"
    }
  }, "=\xA0entra al sorteo")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      marginBottom: 14,
      display: "flex",
      alignItems: "center",
      gap: 16,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 180
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "#8a8c82",
      fontFamily: "'Barlow',monospace"
    }
  }, "Asistencia"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "#676b55",
      fontFamily: "'Barlow',monospace"
    }
  }, pct, "% · ", presentes.length, "/", attendees.length)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      background: "#e4e6dd",
      borderRadius: 99,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${pct}%`,
      background: "linear-gradient(90deg,#565a45,#676b55)",
      borderRadius: 99,
      transition: "width .5s"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#4f7a3f",
      fontFamily: "'Barlow',monospace",
      marginTop: 6
    }
  }, elegibles.length, " habilitado", elegibles.length !== 1 ? "s" : "", " para el sorteo (presente + encuesta)"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: 11,
      top: "50%",
      transform: "translateY(-50%)",
      color: "#a2a498",
      fontSize: 15,
      pointerEvents: "none"
    }
  }, "⌕"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Buscar nombre, apellido, empresa o mail…",
    style: {
      ...inp,
      paddingLeft: 32
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAdd(true),
    style: {
      ...btn(true),
      whiteSpace: "nowrap",
      flexShrink: 0,
      padding: "9px 16px"
    }
  }, "+ Walk-in")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      padding: 0,
      overflow: "hidden"
    }
  }, wide && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "34px 1.7fr 1.6fr 1.8fr 84px",
      gap: 12,
      padding: "9px 20px",
      borderBottom: "1px solid #e4e6dd",
      fontSize: 10,
      color: "#a2a498",
      fontFamily: "'Barlow',monospace",
      letterSpacing: ".05em",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", null, "NOMBRE"), /*#__PURE__*/React.createElement("div", null, "EMPRESA"), /*#__PURE__*/React.createElement("div", null, "MAIL"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, "P · F")), filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 40,
      textAlign: "center",
      color: "#a2a498",
      fontSize: 13
    }
  }, "Sin resultados"), filtered.map((a, i) => {
    const eleg = a.presente && a.formulario;
    return /*#__PURE__*/React.createElement("div", {
      key: a.id,
      className: "row",
      style: {
        display: wide ? "grid" : "flex",
        gridTemplateColumns: wide ? "34px 1.7fr 1.6fr 1.8fr 84px" : undefined,
        alignItems: "center",
        gap: wide ? 12 : 10,
        padding: wide ? "10px 20px" : "10px 12px",
        borderBottom: i < filtered.length - 1 ? "1px solid #edeee7" : "none",
        background: eleg ? "rgba(103,107,85,.06)" : a.presente ? "rgba(103,107,85,.02)" : "transparent",
        transition: "background .12s"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 34,
        height: 34,
        borderRadius: 8,
        flexShrink: 0,
        background: eleg ? "linear-gradient(135deg,#565a45,#676b55)" : "#eef0e8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        color: eleg ? "#fff" : "#a2a498",
        fontFamily: "'Barlow',monospace",
        border: `1px solid ${eleg ? "#676b5520" : "#e4e6dd"}`
      }
    }, getInitials(a.nombre, a.apellidos)), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 500,
        color: a.presente ? "#2b2c26" : "#6b6d62",
        display: "flex",
        alignItems: "center",
        gap: 5,
        flexWrap: "wrap"
      }
    }, a.nombre, " ", a.apellidos, a.manual && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        background: "#e7f0e1",
        color: "#4f7a3f",
        padding: "1px 5px",
        borderRadius: 3,
        fontFamily: "'Barlow',monospace"
      }
    }, "walk-in"), eleg && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        background: "#efe7d2",
        color: "#676b55",
        padding: "1px 5px",
        borderRadius: 3,
        fontFamily: "'Barlow',monospace"
      }
    }, "en sorteo")), !wide && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#8a8c82",
        marginTop: 1
      }
    }, a.empresa, a.mail ? ` · ${a.mail}` : "")), wide && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "#6b6d62",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, a.empresa || "—"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#8a8c82",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, a.mail || "—")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 6,
        flexShrink: 0,
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "chk",
      title: "Presente en el evento (manual)",
      onClick: () => toggle(a.id),
      style: stateBtn(a.presente, "linear-gradient(135deg,#676b55,#565a45)", "#676b5530")
    }, a.presente ? "✓" : "○"), /*#__PURE__*/React.createElement("button", {
      className: "chk",
      title: "Encuesta completada (auto, o toggle manual)",
      onClick: () => toggleForm(a.id),
      style: stateBtn(a.formulario, "linear-gradient(135deg,#4f7a3f,#3d6130)", "#4f7a3f40")
    }, a.formulario ? "✓" : "F")));
  }))), tab === "eligibles" && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: "fadeUp .3s",
      maxWidth: 820,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed',sans-serif",
      fontSize: 17,
      fontWeight: 700,
      color: "#2b2c26",
      marginBottom: 4
    }
  }, "Habilitados para el sorteo"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#8a8c82",
      lineHeight: 1.7
    }
  }, "Cruce automático: solo aparece quien ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#676b55"
    }
  }, "asistió"), " (marcado a mano) y además ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#4f7a3f"
    }
  }, "completó la encuesta"), " (matcheado por mail o nombre). Son ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#4f7a3f"
    }
  }, elegibles.length), " persona", elegibles.length !== 1 ? "s" : "", ".")), elegibles.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      textAlign: "center",
      padding: "54px 24px",
      color: "#8a8c82",
      fontSize: 14
    }
  }, "Todavía no hay nadie que cumpla las dos condiciones.") : /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      padding: 0,
      overflow: "hidden"
    }
  }, elegibles.sort((a, b) => (a.apellidos || "").localeCompare(b.apellidos || "")).map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: a.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: wide ? "11px 20px" : "10px 14px",
      borderBottom: i < elegibles.length - 1 ? "1px solid #edeee7" : "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 8,
      flexShrink: 0,
      background: "linear-gradient(135deg,#565a45,#676b55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      fontWeight: 700,
      color: "#fff",
      fontFamily: "'Barlow',monospace"
    }
  }, getInitials(a.nombre, a.apellidos)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: "#2b2c26"
    }
  }, a.nombre, " ", a.apellidos), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#8a8c82"
    }
  }, a.empresa, a.mail ? ` · ${a.mail}` : "")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "#4f7a3f",
      fontFamily: "'Barlow',monospace"
    }
  }, "✓ habilitado")))), elegibles.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setTab("raffle"),
    style: {
      ...btn(true),
      padding: "12px 36px"
    }
  }, "Ir al sorteo →"))), tab === "raffle" && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: "fadeUp .3s",
      maxWidth: 680,
      margin: "0 auto"
    }
  }, elegibles.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      textAlign: "center",
      padding: "64px 24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 40,
      marginBottom: 10
    }
  }, "🎟"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "#8a8c82",
      fontSize: 14,
      lineHeight: 1.6
    }
  }, "Para entrar al sorteo cada persona tiene que estar", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#676b55"
    }
  }, "presente"), " y haber ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#4f7a3f"
    }
  }, "completado la encuesta"), ".")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "linear-gradient(160deg,#ffffff,#eef0e8)",
      border: "1px solid #d6d8cd",
      borderRadius: 16,
      padding: wide ? "56px 48px" : "40px 20px",
      textAlign: "center",
      marginBottom: 20,
      position: "relative",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: 200,
      height: 1,
      background: "linear-gradient(90deg,transparent,#676b55,transparent)"
    }
  }), raffleState === "idle" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 44,
      marginBottom: 10
    }
  }, "✦"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed',sans-serif",
      fontSize: wide ? 28 : 22,
      fontWeight: 700,
      color: "#676b55",
      marginBottom: 6
    }
  }, "Sorteo"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#8a8c82",
      marginBottom: 32
    }
  }, restantes.length, " participante", restantes.length !== 1 ? "s" : "", " habilitado", restantes.length !== 1 ? "s" : "", " en juego", winners.length > 0 && ` · ${winners.length} ya sorteado${winners.length !== 1 ? "s" : ""}`), /*#__PURE__*/React.createElement("button", {
    onClick: doRaffle,
    disabled: restantes.length === 0,
    style: {
      background: restantes.length === 0 ? "#eef0e8" : "linear-gradient(135deg,#676b55,#565a45)",
      border: "none",
      borderRadius: 10,
      padding: "14px 48px",
      color: restantes.length === 0 ? "#8a8c82" : "#fff",
      cursor: restantes.length === 0 ? "not-allowed" : "pointer",
      fontSize: 15,
      fontWeight: 700,
      fontFamily: "'Barlow Condensed',sans-serif",
      letterSpacing: ".03em"
    }
  }, restantes.length === 0 ? "NO QUEDAN PARTICIPANTES" : "INICIAR SORTEO")), raffleState === "spinning" && winner && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: "flash .4s ease infinite"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#8a8c82",
      fontFamily: "'Barlow',monospace",
      marginBottom: 14
    }
  }, "SORTEANDO…"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 68,
      height: 68,
      borderRadius: 12,
      margin: "0 auto 14px",
      background: "linear-gradient(135deg,#565a45,#676b55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22,
      fontWeight: 700,
      color: "#fff",
      fontFamily: "'Barlow',monospace"
    }
  }, getInitials(winner.nombre, winner.apellidos)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed',sans-serif",
      fontSize: wide ? 28 : 22,
      fontWeight: 700,
      color: "#676b55"
    }
  }, winner.nombre, " ", winner.apellidos)), raffleState === "winner" && winner && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: "pop .5s cubic-bezier(.175,.885,.32,1.275) both"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 34,
      marginBottom: 8
    }
  }, "🎉"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#676b55",
      fontFamily: "'Barlow',monospace",
      letterSpacing: ".12em",
      marginBottom: 14
    }
  }, "¡GANADOR/A!"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 78,
      height: 78,
      borderRadius: 14,
      margin: "0 auto 18px",
      background: "linear-gradient(135deg,#676b55,#9aa07a)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 26,
      fontWeight: 700,
      color: "#fff",
      fontFamily: "'Barlow',monospace",
      boxShadow: "0 0 48px rgba(103,107,85,.5)"
    }
  }, getInitials(winner.nombre, winner.apellidos)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed',sans-serif",
      fontSize: wide ? 32 : 24,
      fontWeight: 700,
      color: "#2b2c26",
      marginBottom: 4
    }
  }, winner.nombre, " ", winner.apellidos), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "#676b55",
      marginBottom: 4
    }
  }, winner.empresa), winner.mail && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#8a8c82",
      marginBottom: 10
    }
  }, winner.mail), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: doRaffle,
    style: btn(true)
  }, "Otro sorteo"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setRS("idle");
      setWinner(null);
    },
    style: btn(false)
  }, "Reiniciar")))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#a2a498",
      fontFamily: "'Barlow',monospace",
      marginBottom: 8,
      letterSpacing: ".05em"
    }
  }, "PARTICIPANTES HABILITADOS"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, elegibles.map(p => {
    const won = winners.find(w => w.id === p.id);
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        padding: "4px 12px",
        borderRadius: 6,
        fontSize: 12,
        background: won ? "#ffffff" : "rgba(103,107,85,.08)",
        border: `1px solid ${won ? "#eef0e8" : "rgba(103,107,85,.2)"}`,
        color: won ? "#c0c2b7" : "#8a8c82",
        textDecoration: won ? "line-through" : "none"
      }
    }, p.nombre, " ", p.apellidos, won && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        marginLeft: 4,
        color: "#676b55"
      }
    }, "✓"));
  })))), tab === "config" && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: "fadeUp .3s",
      maxWidth: 660,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: 6,
      background: "linear-gradient(135deg,#676b55,#565a45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      fontWeight: 700,
      color: "#fff"
    }
  }, "1"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed',sans-serif",
      fontSize: 16,
      fontWeight: 700,
      color: "#2b2c26"
    }
  }, "Lista de inscriptos")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#8a8c82",
      lineHeight: 1.7,
      marginBottom: 16
    }
  }, "Las respuestas del formulario de inscripción. Publicá esa hoja como CSV (Archivo → Compartir → Publicar en la web → CSV) y pegá el link, o subí un Excel."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      background: "#fbfbf9",
      border: "1px solid #e4e6dd",
      borderRadius: 9,
      padding: 4,
      marginBottom: 16
    }
  }, [["sheets", "Google Sheets"], ["excel", "Excel / CSV"]].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => {
      setListMode(k);
      setListSt("");
    },
    style: {
      flex: 1,
      border: "none",
      borderRadius: 6,
      padding: "8px 10px",
      cursor: "pointer",
      fontFamily: "'Barlow',sans-serif",
      fontSize: 13,
      fontWeight: 600,
      background: listMode === k ? "linear-gradient(135deg,#676b55,#565a45)" : "transparent",
      color: listMode === k ? "#fff" : "#8a8c82"
    }
  }, l))), listMode === "sheets" ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 10,
      color: "#8a8c82",
      fontFamily: "'Barlow',monospace",
      display: "block",
      marginBottom: 6
    }
  }, "URL publicada (CSV)"), /*#__PURE__*/React.createElement("input", {
    value: listUrl,
    onChange: e => setListUrl(e.target.value),
    placeholder: "https://docs.google.com/spreadsheets/d/e/…/pub?output=csv",
    style: {
      ...inp,
      fontFamily: "'Barlow',monospace",
      fontSize: 11,
      marginBottom: 10
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: loadListSheets,
    style: btn(true)
  }, "Cargar inscriptos desde Sheets")) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("input", {
    ref: listFileRef,
    type: "file",
    accept: ".xlsx,.xls,.csv",
    onChange: e => loadListExcel(e.target.files && e.target.files[0]),
    style: {
      display: "none"
    },
    id: "list-file"
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "list-file",
    style: {
      ...btn(true),
      display: "inline-block"
    }
  }, "Elegir archivo (.xlsx / .csv)…")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      paddingTop: 14,
      borderTop: "1px solid #eef0e8"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 10,
      color: "#8a8c82",
      fontFamily: "'Barlow',monospace",
      display: "block",
      marginBottom: 6
    }
  }, "Mostrar inscriptos desde (opcional · usa la columna \"Marca temporal\")"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: listSince,
    onChange: e => setListSince(e.target.value),
    style: {
      ...inp,
      maxWidth: 220
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#a2a498",
      marginTop: 6
    }
  }, "Si la hoja acumula varios eventos, poné la fecha del evento actual para traer solo a los nuevos.")), listSt && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 12,
      fontFamily: "'Barlow',monospace",
      color: listSt.startsWith("✓") ? "#4f7a3f" : listSt.startsWith("Error") ? "#c0392b" : "#676b55"
    }
  }, listSt)), /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      marginBottom: 16,
      border: "1px solid #cfe0d2"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: 6,
      background: "linear-gradient(135deg,#4f7a3f,#3d6130)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      fontWeight: 700,
      color: "#fff"
    }
  }, "2"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed',sans-serif",
      fontSize: 16,
      fontWeight: 700,
      color: "#2b2c26"
    }
  }, "Respuestas de la encuesta")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#8a8c82",
      lineHeight: 1.7,
      marginBottom: 16
    }
  }, "La encuesta post-evento (la del QR). Al cargarla, se marca el formulario ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#4f7a3f"
    }
  }, "automáticamente"), " cruzando por ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#3a3b34"
    }
  }, "mail"), " (o nombre + apellido) contra la lista. Importante: la encuesta tiene que pedir el mail."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      background: "#fbfbf9",
      border: "1px solid #e4e6dd",
      borderRadius: 9,
      padding: 4,
      marginBottom: 16
    }
  }, [["sheets", "Google Sheets"], ["excel", "Excel / CSV"]].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => {
      setSurveyMode(k);
      setSurveySt("");
    },
    style: {
      flex: 1,
      border: "none",
      borderRadius: 6,
      padding: "8px 10px",
      cursor: "pointer",
      fontFamily: "'Barlow',sans-serif",
      fontSize: 13,
      fontWeight: 600,
      background: surveyMode === k ? "linear-gradient(135deg,#4f7a3f,#3d6130)" : "transparent",
      color: surveyMode === k ? "#fff" : "#8a8c82"
    }
  }, l))), surveyMode === "sheets" ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 10,
      color: "#8a8c82",
      fontFamily: "'Barlow',monospace",
      display: "block",
      marginBottom: 6
    }
  }, "URL publicada (CSV) de la hoja de la encuesta"), /*#__PURE__*/React.createElement("input", {
    value: surveyUrl,
    onChange: e => setSurveyUrl(e.target.value),
    placeholder: "https://docs.google.com/spreadsheets/d/e/…/pub?output=csv",
    style: {
      ...inp,
      fontFamily: "'Barlow',monospace",
      fontSize: 11,
      marginBottom: 10
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: loadSurveySheets,
    style: {
      ...btn(false),
      background: "linear-gradient(135deg,#4f7a3f,#3d6130)",
      color: "#fff"
    }
  }, "Cruzar encuesta desde Sheets")) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("input", {
    ref: surveyFileRef,
    type: "file",
    accept: ".xlsx,.xls,.csv",
    onChange: e => loadSurveyExcel(e.target.files && e.target.files[0]),
    style: {
      display: "none"
    },
    id: "survey-file"
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "survey-file",
    style: {
      ...btn(false),
      background: "linear-gradient(135deg,#4f7a3f,#3d6130)",
      color: "#fff",
      display: "inline-block"
    }
  }, "Elegir archivo de encuesta…")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      paddingTop: 14,
      borderTop: "1px solid #cfe0d2"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 10,
      color: "#8a8c82",
      fontFamily: "'Barlow',monospace",
      display: "block",
      marginBottom: 6
    }
  }, "Contar respuestas desde (opcional)"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: surveySince,
    onChange: e => setSurveySince(e.target.value),
    style: {
      ...inp,
      maxWidth: 220
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#a2a498",
      marginTop: 6
    }
  }, "Como la hoja acumula eventos, poné la fecha del evento para no arrastrar encuestas viejas.")), surveySt && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 12,
      fontFamily: "'Barlow',monospace",
      color: surveySt.startsWith("✓") ? "#4f7a3f" : surveySt.startsWith("Error") ? "#c0392b" : "#676b55"
    }
  }, surveySt)), /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      border: "1px solid #e8cdc9"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#c0392b",
      fontFamily: "'Barlow',monospace",
      marginBottom: 14,
      letterSpacing: ".05em"
    }
  }, "ZONA DE RESETEO"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, confirmReset === "clear" ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: clearMarks,
    style: {
      ...btn(false),
      border: "1px solid #d9a9a4",
      color: "#c0392b",
      background: "#f7eae8"
    }
  }, "Confirmar: limpiar tildados"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirmReset(null),
    style: btn(false)
  }, "Cancelar")) : /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirmReset("clear"),
    style: btn(true)
  }, "Limpiar tildados (mantener lista actual)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#8a8c82",
      marginTop: 8
    }
  }, "Borra presentes, encuestas y ganadores, pero conserva la lista cargada. Es el reseteo de cada evento.")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "#eeddda",
      marginBottom: 18
    }
  }), /*#__PURE__*/React.createElement("div", null, confirmReset === "base" ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: resetToBase,
    style: {
      ...btn(false),
      border: "1px solid #d9a9a4",
      color: "#c0392b",
      background: "#f7eae8"
    }
  }, "Confirmar: volver a lista base"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirmReset(null),
    style: btn(false)
  }, "Cancelar")) : /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirmReset("base"),
    style: {
      ...btn(false),
      border: "1px solid #e8cdc9"
    }
  }, "Volver a la lista base"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#a2a498",
      marginTop: 8
    }
  }, "Descarta lo importado y restaura los contactos originales del sistema."))))), showAdd && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.78)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 200,
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#ffffff",
      border: "1px solid #d6d8cd",
      borderRadius: 14,
      padding: 28,
      width: "100%",
      maxWidth: 420,
      animation: "fadeUp .2s"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed',sans-serif",
      fontSize: 16,
      fontWeight: 700,
      marginBottom: 20,
      color: "#2b2c26"
    }
  }, "Agregar walk-in"), [["nombre", "Nombre *"], ["apellidos", "Apellido"], ["mail", "Mail"], ["empresa", "Empresa"], ["cargo", "Perfil / cargo"]].map(([k, l]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      marginBottom: 11
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 10,
      color: "#8a8c82",
      fontFamily: "'Barlow',monospace",
      display: "block",
      marginBottom: 4
    }
  }, l), /*#__PURE__*/React.createElement("input", {
    value: newP[k],
    onChange: e => setNewP(p => ({
      ...p,
      [k]: e.target.value
    })),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    onClick: () => setNewP(p => ({
      ...p,
      formulario: !p.formulario
    })),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginTop: 6,
      padding: "10px 12px",
      background: "#fbfbf9",
      border: `1px solid ${newP.formulario ? "#4f7a3f40" : "#e4e6dd"}`,
      borderRadius: 8,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: stateBtn(newP.formulario, "linear-gradient(135deg,#4f7a3f,#3d6130)", "#4f7a3f40")
  }, newP.formulario ? "✓" : "F"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#3a3b34",
      fontWeight: 500
    }
  }, "Ya completó la encuesta"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#8a8c82"
    }
  }, "Necesario para entrar al sorteo"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: addManual,
    style: {
      ...btn(true),
      flex: 1,
      textAlign: "center"
    }
  }, "Agregar como presente"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAdd(false),
    style: {
      ...btn(false),
      flex: 1,
      textAlign: "center"
    }
  }, "Cancelar")))));
}
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(/*#__PURE__*/React.createElement(App, null));
