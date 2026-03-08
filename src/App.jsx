import { useState, useMemo, useRef, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";

// ── Backend URL — your Render deployment ─────────────────────────────────────
const API_URL = "https://gl-classifier-app.onrender.com";

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const GL_LABELS = {
  "4000":"Revenue","4010":"Commission Income","4030":"Interest","4050":"IRS",
  "5030":"Marketing","5100":"Consulting","5215":"Telemarketing",
  "6020":"Payroll Taxes","6030":"Payroll Processing","6040":"401K Admin",
  "6100":"Accounting","6110":"Legal","6115":"Outside Services",
  "6120":"Licenses & Permits","6130":"Dues & Subscriptions","6140":"Postage",
  "6160":"Office Supplies","6170":"Meals & Travel","6180":"Education & Training",
  "6200":"Software & IT","6210":"Insurance","6240":"Rent",
  "6250":"Telephone","6260":"Utilities","9999":"Credit Card Payment","REVIEW":"Needs Review",
};

const DEPT_CODES = {
  operations: { label:"Operations", icon:"⚙️", codes:["6260","6250","6140","6115","6110","6240"], budget:28000 },
  marketing:  { label:"Marketing",  icon:"📣", codes:["5030","6130","5215"],                    budget:15000 },
  admin:      { label:"Admin",      icon:"🗂️",  codes:["6160","6170","6100","6040","6020","6030"], budget:20000 },
  it:         { label:"IT",         icon:"💻", codes:["6200","6130"],                            budget:8000  },
};

const PALETTE = ["#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6"];
const fmt = n => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });

// ═══════════════════════════════════════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
function ConfBadge({ confidence_score }) {
  const pct = Math.round(confidence_score * 100);
  const cls = pct >= 85 ? "bg-emerald-500/20 text-emerald-400" : pct >= 60 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400";
  const dot = pct >= 85 ? "bg-emerald-400" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono ${cls}`}><span className={`w-1.5 h-1.5 rounded-full ${dot}`}/>{pct}%</span>;
}

function MethodTag({ method }) {
  if (method?.includes("Layer 1")) return <span className="px-2 py-0.5 rounded text-xs font-mono bg-blue-500/20 text-blue-400">L1 Exact</span>;
  if (method?.includes("Layer 2")) return <span className="px-2 py-0.5 rounded text-xs font-mono bg-purple-500/20 text-purple-400">L2 Embed</span>;
  if (method?.includes("Layer 3") || method?.includes("Claude")) return <span className="px-2 py-0.5 rounded text-xs font-mono bg-cyan-500/20 text-cyan-400">L3 LLM</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-mono bg-red-500/20 text-red-400">Review</span>;
}

function StatCard({ label, value, sub, accent = "text-white" }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
      <div className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-3xl font-black ${accent}`} style={{ fontFamily:"'Syne',sans-serif" }}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function DropZone({ label, icon, file, onFile }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  const handle = f => { if (f && f.name.endsWith(".csv")) onFile(f); };
  return (
    <div
      onClick={() => ref.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      className={`relative border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all text-center ${
        file ? "border-emerald-500/60 bg-emerald-500/5" : drag ? "border-amber-400 bg-amber-500/10" : "border-slate-600 hover:border-slate-400 bg-slate-800/30"
      }`}>
      <input ref={ref} type="file" accept=".csv" className="hidden" onChange={e => handle(e.target.files[0])} />
      <div className="text-3xl mb-3">{file ? "✅" : icon}</div>
      <div className="text-sm font-bold text-slate-300">{label}</div>
      {file
        ? <div className="text-xs text-emerald-400 mt-1 font-mono truncate px-2">{file.name}</div>
        : <div className="text-xs text-slate-500 mt-1">Click or drag &amp; drop .csv</div>
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function UploadScreen({ onClassify }) {
  const [classified, setClassified] = useState(null);
  const [classify, setClassify]     = useState(null);
  const [glDict, setGlDict]         = useState(null);
  const ready = classified && classify && glDict;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8" style={{ fontFamily:"'IBM Plex Sans',sans-serif" }}>
      <div className="w-full max-w-2xl">

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono tracking-widest uppercase px-4 py-2 rounded-full mb-6">
            GL Code Classifier · TPM Case Study
          </div>
          <h1 className="text-5xl font-black text-white mb-3" style={{ fontFamily:"'Syne',sans-serif" }}>
            Upload Your <span className="text-amber-400">CSV Files</span>
          </h1>
          <p className="text-slate-400 text-base">Three files required. Classification runs server-side — no API key needed.</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <DropZone label="classified.csv"         icon="📚" file={classified} onFile={setClassified} />
          <DropZone label="classify.csv"           icon="📋" file={classify}   onFile={setClassify}   />
          <DropZone label="gl_code_dictionary.csv" icon="📖" file={glDict}     onFile={setGlDict}     />
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { color:"bg-blue-500",   label:"Layer 1", desc:"Exact Match Cache",   note:"String similarity ≥95%" },
            { color:"bg-purple-500", label:"Layer 2", desc:"TF-IDF Embeddings",   note:"Semantic vector search" },
            { color:"bg-cyan-500",   label:"Layer 3", desc:"Claude API Fallback", note:"LLM for novel vendors"  },
          ].map(l => (
            <div key={l.label} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${l.color}`}/>
                <span className="text-xs font-bold text-slate-300 font-mono">{l.label}</span>
                <span className="ml-auto text-xs text-slate-600 font-mono">server</span>
              </div>
              <div className="text-xs text-slate-400 font-medium">{l.desc}</div>
              <div className="text-xs text-slate-600 mt-0.5">{l.note}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-4 text-xs text-slate-600 font-mono justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
          {API_URL}
        </div>

        <button
          onClick={() => ready && onClassify({ classified, classify, glDict })}
          disabled={!ready}
          className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
            ready
              ? "bg-amber-500 text-slate-900 hover:bg-amber-400 shadow-lg shadow-amber-500/20"
              : "bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700"
          }`}>
          {ready ? "🚀  Run Classification →" : "Upload all 3 CSV files to continue"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESSING SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function ProcessingScreen({ progress }) {
  const { stage = "Sending files to server…", pct = 0, l1 = 0, l2 = 0, l3 = 0, total = 0 } = progress;
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8" style={{ fontFamily:"'IBM Plex Sans',sans-serif" }}>
      <div className="w-full max-w-lg text-center">
        <div className="text-6xl mb-6 animate-pulse">⚙️</div>
        <h2 className="text-3xl font-black text-white mb-2" style={{ fontFamily:"'Syne',sans-serif" }}>Classifying Transactions</h2>
        <p className="text-slate-400 text-sm mb-8 font-mono">{stage}</p>

        <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-8">
          <div className="h-full bg-amber-500 rounded-full transition-all duration-700"
            style={{ width:`${pct}%`, boxShadow:"0 0 12px rgba(245,158,11,0.5)" }} />
        </div>

        {total > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              { label:"Layer 1 — Exact", count:l1, color:"text-blue-400",   bg:"bg-blue-500/10",   border:"border-blue-500/20" },
              { label:"Layer 2 — Embed", count:l2, color:"text-purple-400", bg:"bg-purple-500/10", border:"border-purple-500/20" },
              { label:"Layer 3 — LLM",   count:l3, color:"text-cyan-400",   bg:"bg-cyan-500/10",   border:"border-cyan-500/20" },
            ].map(l => (
              <div key={l.label} className={`${l.bg} border ${l.border} rounded-xl p-4`}>
                <div className={`text-2xl font-black ${l.color}`} style={{ fontFamily:"'Syne',sans-serif" }}>{l.count}</div>
                <div className="text-xs text-slate-500 mt-1 font-mono">{l.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-slate-600 font-mono mt-2">
          {total > 0 ? `${l1+l2+l3} of ${total} classified` : "Waiting for server response…"}
        </div>

        {pct < 50 && (
          <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-400/80 font-mono">
            ⚠ Free tier may take 20–30s to wake up on first request. Hang tight.
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNTANT VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function AccountantView({ transactions }) {
  const [filter, setFilter]       = useState("review");
  const [expanded, setExpanded]   = useState(null);
  const [overrides, setOverrides] = useState({});  // keyed by original transaction index
  const [approved, setApproved]   = useState({});  // keyed by original transaction index

  const needsReview  = transactions.filter(t => t.assigned_gl_code === "REVIEW");
  const medium       = transactions.filter(t => t.confidence_score >= 0.6 && t.confidence_score < 0.85 && t.assigned_gl_code !== "REVIEW");
  const high         = transactions.filter(t => t.confidence_score >= 0.85 && t.assigned_gl_code !== "REVIEW");
  const totalSpend   = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const autoCount    = transactions.filter(t => t.assigned_gl_code !== "REVIEW").length;
  const filtered     = filter === "review" ? needsReview : filter === "medium" ? medium : filter === "high" ? high : transactions;
  const allCodes     = [...new Set(transactions.filter(t => t.assigned_gl_code !== "REVIEW").map(t => t.assigned_gl_code))].sort();
  const approvedCount = Object.values(approved).filter(Boolean).length;

  // ── Export approved transactions as CSV ───────────────────────────────────
  function exportApproved() {
    const headers = ["Date","Description","Amount","Assigned_GL_Code","GL_Class","Confidence_Score","Match_Method","Reasoning"];
    const rows = transactions
      .map((t, idx) => ({ t, idx }))
      .filter(({ idx }) => approved[idx])
      .map(({ t, idx }) => {
        const glCode = overrides[idx] || t.assigned_gl_code;
        const glClass = GL_LABELS[glCode] || t.gl_class || glCode;
        const method = overrides[idx] ? "Accountant Override" : t.match_method;
        return [
          t.date,
          t.description,
          t.amount,
          glCode,
          glClass,
          (t.confidence_score * 100).toFixed(0) + "%",
          method,
          t.reasoning,
        ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`);
      });

    if (rows.length === 0) return;
    const csv = [headers.map(h => `"${h}"`), ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `approved_transactions_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Download all 290 classified transactions as CSV ───────────────────────
  function exportAll() {
    const headers = ["Date","Description","Amount","Assigned_GL_Code","GL_Class","Confidence_Score","Match_Method","Reasoning"];
    const rows = transactions.map(t => [
      t.date,
      t.description,
      t.amount,
      t.assigned_gl_code,
      t.gl_class || GL_LABELS[t.assigned_gl_code] || t.assigned_gl_code,
      (t.confidence_score * 100).toFixed(0) + "%",
      t.match_method,
      t.reasoning,
    ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`));
    const csv = [headers.map(h => `"${h}"`), ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `classified_output_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Transactions" value={transactions.length} sub="This cycle" />
        <StatCard label="Auto-Classified"    value={autoCount} sub={`${((autoCount/transactions.length)*100).toFixed(1)}% of total`} accent="text-emerald-400" />
        <StatCard label="Needs Review"       value={needsReview.length} sub="Your action required" accent="text-red-400" />
        <StatCard label="Approved"           value={approvedCount} sub={`of ${transactions.length} transactions`} accent="text-emerald-400" />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {[
            { id:"all",    label:"All",                count:transactions.length },
            { id:"review", label:"🔴 Needs Review",    count:needsReview.length },
            { id:"medium", label:"🟡 Medium",          count:medium.length },
            { id:"high",   label:"🟢 High Confidence", count:high.length },
          ].map(f => (
            <button key={f.id} onClick={() => { setFilter(f.id); setExpanded(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter===f.id ? "bg-amber-500 text-slate-900 font-bold" : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"}`}>
              {f.label} <span className="opacity-60 text-xs">({f.count})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border bg-blue-600/20 text-blue-400 border-blue-600/40 hover:bg-blue-600/40 cursor-pointer">
            ⬇ Download All Results <span className="bg-blue-500 text-slate-900 text-xs font-black px-1.5 py-0.5 rounded-full">{transactions.length}</span>
          </button>
          <button
            onClick={exportApproved}
            disabled={approvedCount === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border ${approvedCount > 0 ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/40 hover:bg-emerald-600/40 cursor-pointer" : "bg-slate-800/40 text-slate-600 border-slate-700/40 cursor-not-allowed"}`}>
            ⬇ Export Approved CSV {approvedCount > 0 && <span className="bg-emerald-500 text-slate-900 text-xs font-black px-1.5 py-0.5 rounded-full">{approvedCount}</span>}
          </button>
        </div>
      </div>

      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-auto max-h-[480px]">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="sticky top-0 bg-slate-900/95">
              <tr className="border-b border-slate-700/50">
                {["Date","Description","Amount","GL Code","Confidence","Method","Action"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-mono text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const origIdx  = transactions.indexOf(t);
                const isApproved = approved[origIdx];
                const code     = overrides[origIdx] || t.assigned_gl_code;
                const isExpanded = expanded === origIdx;
                return (
                  <>
                    <tr key={`row-${origIdx}`}
                      onClick={() => !isApproved && setExpanded(isExpanded ? null : origIdx)}
                      className={`border-b border-slate-700/30 transition-colors ${isApproved ? "opacity-40" : t.assigned_gl_code==="REVIEW" ? "bg-red-500/5 hover:bg-red-500/10 cursor-pointer" : "hover:bg-slate-700/30 cursor-pointer"}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-3 text-slate-300 max-w-[220px]"><div className="truncate text-xs" title={t.description}>{t.description}</div></td>
                      <td className={`px-4 py-3 font-mono text-right text-sm font-medium whitespace-nowrap ${t.amount < 0 ? "text-emerald-400" : "text-white"}`}>
                        {t.amount < 0 ? `(${fmt(t.amount)})` : fmt(t.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-xs font-bold px-2 py-1 rounded ${code==="REVIEW" ? "bg-red-500/20 text-red-400" : "bg-slate-700 text-amber-400"}`}>{code}</span>
                      </td>
                      <td className="px-4 py-3"><ConfBadge confidence_score={t.confidence_score} /></td>
                      <td className="px-4 py-3"><MethodTag method={t.match_method} /></td>
                      <td className="px-4 py-3">
                        {isApproved
                          ? <span className="text-xs text-emerald-500 font-bold">✓ Done</span>
                          : <button onClick={e => { e.stopPropagation(); setApproved(p=>({...p,[origIdx]:true})); }}
                              className="px-3 py-1 bg-emerald-600/20 text-emerald-400 text-xs rounded-lg hover:bg-emerald-600/40 font-medium border border-emerald-600/20">Approve</button>
                        }
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`exp-${origIdx}`} className="bg-slate-900/80">
                        <td colSpan={7} className="px-6 py-5">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <div className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-2">Classification Reasoning</div>
                              <p className="text-sm text-slate-300 leading-relaxed">{t.reasoning}</p>
                              <div className="mt-3"><MethodTag method={t.match_method} /></div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-2">Override GL Code</div>
                              <div className="flex flex-wrap gap-2">
                                {allCodes.slice(0, 12).map(c => (
                                  <button key={c}
                                    onClick={() => { setOverrides(p=>({...p,[origIdx]:c})); setApproved(p=>({...p,[origIdx]:true})); setExpanded(null); }}
                                    className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all ${code===c ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white"}`}>{c}</button>
                                ))}
                              </div>
                              <div className="text-xs text-slate-600 mt-2 font-mono">{GL_LABELS[code] || code}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-700/30 text-xs text-slate-500 font-mono">
          {filtered.length} transactions · Click row to expand &amp; override GL code · {approvedCount} approved
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE MANAGER VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function FinanceView({ transactions }) {
  const positiveOnly = transactions.filter(t => t.amount > 0);
  const totalSpend   = positiveOnly.reduce((s, t) => s + t.amount, 0);
  const byGl = useMemo(() => {
    const map = {};
    positiveOnly.forEach(t => { const k = t.assigned_gl_code === "REVIEW" ? "REVIEW" : t.assigned_gl_code; map[k] = (map[k]||0) + t.amount; });
    return Object.entries(map).map(([code, amount]) => ({ code, label: GL_LABELS[code]||code, amount: Math.round(amount) })).sort((a,b) => b.amount-a.amount).slice(0,9);
  }, [transactions]);
  const l1 = transactions.filter(t => t.match_method?.includes("Layer 1")).length;
  const l2 = transactions.filter(t => t.match_method?.includes("Layer 2")).length;
  const l3 = transactions.filter(t => t.match_method?.includes("Layer 3")||t.match_method?.includes("Claude")).length;
  const manual = transactions.filter(t => t.assigned_gl_code === "REVIEW").length;
  const autoCount = transactions.length - manual;
  const CustomTooltip = ({ active, payload }) => {
    if (!active||!payload?.length) return null;
    return <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm"><p className="text-white font-bold">{payload[0].payload.label}</p><p className="text-amber-400 font-mono">{fmt(payload[0].value)}</p></div>;
  };
  const pieData = byGl.map((d,i) => ({ name:d.label, value:d.amount, fill:PALETTE[i%PALETTE.length] }));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Spend"     value={fmt(totalSpend)} sub="All positive transactions" />
        <StatCard label="Auto-Classified" value={`${((autoCount/transactions.length)*100).toFixed(1)}%`} sub={`${autoCount} of ${transactions.length} txns`} accent="text-emerald-400" />
        <StatCard label="Needs Review"    value={manual} sub="Unclassified" accent="text-red-400" />
        <StatCard label="Top Category"    value={byGl[0]?.label||"—"} sub={byGl[0] ? fmt(byGl[0].amount) : ""} accent="text-amber-400" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
          <div className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-4">Spend by GL Category</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byGl} margin={{ top:0, right:0, left:-15, bottom:36 }}>
              <XAxis dataKey="label" tick={{ fontSize:9, fill:"#64748b" }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize:9, fill:"#64748b" }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" radius={[4,4,0,0]}>{byGl.map((_,i) => <Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
          <div className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-4">Spend Distribution</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="42%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2} />
              <Legend wrapperStyle={{ fontSize:10, color:"#94a3b8" }} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background:"#1e293b", border:"1px solid #475569", borderRadius:8, fontSize:12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
        <div className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-5">Classification Pipeline Performance</div>
        <div className="grid grid-cols-3 gap-6">
          {[
            { label:"Layer 1 — Exact Match",   count:l1,        pct:l1/transactions.length*100,         color:"bg-blue-500",   desc:"Recurring vendors matched from history" },
            { label:"Layer 2 — TF-IDF",        count:l2,        pct:l2/transactions.length*100,         color:"bg-purple-500", desc:"New variants via semantic similarity" },
            { label:"Layer 3 / Manual Review", count:l3+manual, pct:(l3+manual)/transactions.length*100, color:"bg-red-500",    desc:"Novel transactions — LLM or human input" },
          ].map(l => (
            <div key={l.label} className="space-y-2">
              <div className="flex justify-between text-xs"><span className="text-slate-400">{l.label}</span><span className="text-white font-mono font-bold">{l.count}</span></div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className={`h-full ${l.color} rounded-full`} style={{ width:`${l.pct}%` }} /></div>
              <div className="text-xs text-slate-500">{l.pct.toFixed(1)}% — {l.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEPARTMENT MANAGER VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function DepartmentView({ transactions }) {
  const [dept, setDept] = useState("marketing");
  const d = DEPT_CODES[dept];
  const myTxns = transactions.filter(t => d.codes.includes(t.assigned_gl_code) && t.amount > 0);
  const spent  = myTxns.reduce((s, t) => s + t.amount, 0);
  const pct    = Math.min((spent / d.budget) * 100, 100);
  const byCode = d.codes.map(code => ({ code, label:GL_LABELS[code]||code, amount:myTxns.filter(t=>t.assigned_gl_code===code).reduce((s,t)=>s+t.amount,0), count:myTxns.filter(t=>t.assigned_gl_code===code).length })).filter(c=>c.amount>0).sort((a,b)=>b.amount-a.amount);
  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap">
        {Object.entries(DEPT_CODES).map(([id, dd]) => (
          <button key={id} onClick={() => setDept(id)}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${dept===id ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"}`}>
            {dd.icon} {dd.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Dept Spend"   value={fmt(spent)}          sub={`Budget: ${fmt(d.budget)}`} />
        <StatCard label="Transactions" value={myTxns.length}       sub="This period" />
        <StatCard label="Budget Used"  value={`${pct.toFixed(0)}%`} sub={`${fmt(d.budget-spent)} remaining`} accent={pct>85?"text-red-400":pct>65?"text-amber-400":"text-emerald-400"} />
        <StatCard label="Vendors"      value={new Set(myTxns.map(t=>t.description.split(" ")[0])).size} sub="Unique vendors" />
      </div>
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
        <div className="flex justify-between text-xs font-mono text-slate-500 mb-2"><span>{d.icon} {d.label} — Budget Utilisation</span><span>{fmt(spent)} of {fmt(d.budget)}</span></div>
        <div className="h-3 bg-slate-700/60 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${pct>85?"bg-red-500":pct>65?"bg-amber-500":"bg-emerald-500"}`} style={{ width:`${pct}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {byCode.map(c => (
          <div key={c.code} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <div className="text-xs font-mono text-slate-500 mb-1">{c.code}</div>
            <div className="text-xl font-black text-white mb-0.5" style={{ fontFamily:"'Syne',sans-serif" }}>{fmt(c.amount)}</div>
            <div className="text-xs text-slate-500">{c.label}</div>
            <div className="text-xs text-slate-600 mt-1">{c.count} transactions</div>
          </div>
        ))}
        {byCode.length === 0 && <div className="col-span-4 text-center py-8 text-slate-600 text-sm">No transactions found for this department.</div>}
      </div>
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/30 text-xs font-mono text-slate-500 uppercase tracking-wider">{d.label} Transactions</div>
        <div className="overflow-auto max-h-56">
          <table className="w-full text-xs min-w-[500px]">
            <thead><tr className="border-b border-slate-700/30">{["Date","Description","GL Code","Amount"].map(h => <th key={h} className="text-left px-4 py-2 text-slate-500 font-mono uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {myTxns.slice(0,20).map((t,i) => (
                <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-2 font-mono text-slate-500 whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-2 text-slate-300 max-w-[200px] truncate">{t.description}</td>
                  <td className="px-4 py-2"><span className="font-mono font-bold bg-slate-700 text-amber-400 px-2 py-0.5 rounded">{t.assigned_gl_code}</span></td>
                  <td className="px-4 py-2 font-mono text-right text-white font-medium">{fmt(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDITOR VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function AuditorView({ transactions }) {
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const THRESHOLD = 500;
  const anomalies = transactions.filter(t => t.amount > THRESHOLD);
  const autoCount = transactions.filter(t => t.assigned_gl_code !== "REVIEW").length;
  const l1 = transactions.filter(t => t.match_method?.includes("Layer 1")).length;
  const l2 = transactions.filter(t => t.match_method?.includes("Layer 2")).length;
  const l3 = transactions.filter(t => t.match_method?.includes("Layer 3")||t.match_method?.includes("Claude")).length;
  const manual = transactions.filter(t => t.assigned_gl_code === "REVIEW").length;
  const displayed = anomalyOnly ? anomalies : transactions;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Records"    value={transactions.length} sub="Full audit trail" />
        <StatCard label="Auto-Classified"  value={`${((autoCount/transactions.length)*100).toFixed(1)}%`} sub={`${autoCount} transactions`} accent="text-emerald-400" />
        <StatCard label="Anomalies"        value={anomalies.length} sub={`Over $${THRESHOLD}`} accent="text-amber-400" />
        <StatCard label="Manual Overrides" value={0} sub="This period" accent="text-slate-400" />
      </div>
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
        <div className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-4">Classification Method Audit</div>
        <div className="space-y-4">
          {[
            { method:"Layer 1 — Exact Match",           count:l1,     note:"String similarity ≥95%. Highest reliability.", color:"bg-blue-500" },
            { method:"Layer 2 — TF-IDF Embedding (v3)", count:l2,     note:"Semantic cosine similarity. Location noise stripped, prefix boosted.", color:"bg-purple-500" },
            { method:"Layer 3 — Claude API",            count:l3,     note:"LLM-classified novel vendors. Reasoning provided per transaction.", color:"bg-cyan-500" },
            { method:"Needs Manual Review",             count:manual, note:"No confident match found. Accountant sign-off required.", color:"bg-red-500" },
          ].map(m => (
            <div key={m.method} className="flex items-start gap-4">
              <div className={`w-1.5 h-10 rounded-full ${m.color} flex-shrink-0 mt-0.5`} />
              <div>
                <div className="flex items-center gap-3 mb-0.5"><span className="text-white font-medium text-sm">{m.count}</span><span className="text-slate-400 text-sm">{m.method}</span></div>
                <div className="text-xs text-slate-500">{m.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/30 flex items-center justify-between">
          <div className="text-xs font-mono text-slate-500 uppercase tracking-wider">Complete Audit Trail</div>
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <div onClick={() => setAnomalyOnly(v=>!v)} className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${anomalyOnly?"bg-amber-500":"bg-slate-700"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${anomalyOnly?"left-4":"left-0.5"}`} />
            </div>
            Flag anomalies only (&gt;${THRESHOLD})
          </label>
        </div>
        <div className="overflow-auto max-h-[420px]">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="sticky top-0 bg-slate-900/95">
              <tr className="border-b border-slate-700/30">
                {["Date","Description","Amount","GL Code","Confidence","Method","Reasoning"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-500 font-mono uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((t,i) => (
                <tr key={i} className={`border-b border-slate-700/20 transition-colors ${t.amount>THRESHOLD?"bg-amber-500/5":"hover:bg-slate-700/20"}`}>
                  <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-2.5 text-slate-300 max-w-[180px] truncate">{t.amount>THRESHOLD&&<span className="text-amber-400 mr-1">⚠</span>}{t.description}</td>
                  <td className={`px-4 py-2.5 font-mono text-right font-bold whitespace-nowrap ${t.amount<0?"text-emerald-400":"text-white"}`}>{t.amount<0?`(${fmt(t.amount)})`:fmt(t.amount)}</td>
                  <td className="px-4 py-2.5"><span className={`font-mono font-bold px-2 py-0.5 rounded ${t.assigned_gl_code==="REVIEW"?"bg-red-500/20 text-red-400":"bg-slate-700 text-amber-400"}`}>{t.assigned_gl_code}</span></td>
                  <td className="px-4 py-2.5"><ConfBadge confidence_score={t.confidence_score} /></td>
                  <td className="px-4 py-2.5"><MethodTag method={t.match_method} /></td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-[220px] truncate" title={t.reasoning}>{t.reasoning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-700/30 text-xs text-slate-500 font-mono">
          {displayed.length} of {transactions.length} records · ⚠ marks transactions above ${THRESHOLD}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD SHELL
// ═══════════════════════════════════════════════════════════════════════════════
const PERSONAS = [
  { id:"accountant", label:"Accountant",      icon:"📋", desc:"Daily transaction review & approval" },
  { id:"finance",    label:"Finance Manager", icon:"📊", desc:"Monthly reporting & book close" },
  { id:"department", label:"Dept. Manager",   icon:"🏢", desc:"Department expense visibility" },
  { id:"auditor",    label:"Auditor",          icon:"🔍", desc:"Compliance & audit trail" },
];

function Dashboard({ transactions, onReset }) {
  const [persona, setPersona] = useState("accountant");
  const autoCount = transactions.filter(t => t.assigned_gl_code !== "REVIEW").length;
  return (
    <div className="min-h-screen bg-slate-900 text-white" style={{ fontFamily:"'IBM Plex Sans',sans-serif" }}>
      <div className="border-b border-slate-700/50 bg-slate-900/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-slate-900 font-black text-sm">GL</div>
            <div>
              <div className="text-sm font-black">GL Classifier</div>
              <div className="text-xs text-slate-500 font-mono">{transactions.length} transactions classified</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-400 rounded-full"/>
              {((autoCount/transactions.length)*100).toFixed(1)}% auto-classified
            </div>
            <button onClick={onReset} className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 transition-colors font-mono">↩ New Upload</button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 flex gap-1 border-t border-slate-800/50">
          {PERSONAS.map(p => (
            <button key={p.id} onClick={() => setPersona(p.id)}
              className={`px-5 py-2.5 text-sm font-medium transition-all border-b-2 ${persona===p.id?"border-amber-500 text-amber-400":"border-transparent text-slate-500 hover:text-slate-300"}`}>
              <span className="mr-1.5">{p.icon}</span>{p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-5 flex items-center gap-3 bg-slate-800/30 border border-slate-700/30 rounded-xl px-5 py-3">
          <span className="text-2xl">{PERSONAS.find(p=>p.id===persona)?.icon}</span>
          <div>
            <div className="text-sm font-bold">{PERSONAS.find(p=>p.id===persona)?.label} View</div>
            <div className="text-xs text-slate-500">{PERSONAS.find(p=>p.id===persona)?.desc}</div>
          </div>
        </div>
        {persona === "accountant"  && <AccountantView  transactions={transactions} />}
        {persona === "finance"     && <FinanceView      transactions={transactions} />}
        {persona === "department"  && <DepartmentView   transactions={transactions} />}
        {persona === "auditor"     && <AuditorView      transactions={transactions} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen]             = useState("upload");
  const [transactions, setTransactions] = useState([]);
  const [progress, setProgress]         = useState({ stage:"", pct:0, l1:0, l2:0, l3:0, total:0 });
  const [error, setError]               = useState(null);

  const handleClassify = useCallback(async ({ classified, classify, glDict }) => {
    setScreen("processing");
    setError(null);
    setProgress({ stage:"Sending files to server…", pct:15, l1:0, l2:0, l3:0, total:0 });

    try {
      // Build multipart form — field names must match FastAPI endpoint exactly
      const form = new FormData();
      form.append("classified", classified);
      form.append("classify",   classify);
      form.append("gl_dict",    glDict);

      setProgress(p => ({ ...p, stage:"Running classification pipeline on server…", pct:45 }));

      const resp = await fetch(`${API_URL}/classify`, { method:"POST", body:form });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || `Server error ${resp.status}`);
      }

      setProgress(p => ({ ...p, stage:"Processing results…", pct:85 }));
      const data = await resp.json();

      setProgress({ stage:"Complete!", pct:100, l1:data.l1_count, l2:data.l2_count, l3:data.l3_count, total:data.total });
      setTransactions(data.transactions);
      setTimeout(() => setScreen("dashboard"), 700);

    } catch (e) {
      setError(e.message);
      setScreen("upload");
    }
  }, []);

  if (screen === "processing") return <ProcessingScreen progress={progress} />;
  if (screen === "dashboard")  return <Dashboard transactions={transactions} onReset={() => setScreen("upload")} />;
  return (
    <>
      <UploadScreen onClassify={handleClassify} />
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-mono px-6 py-3 rounded-xl z-50">
          ⚠ {error}
        </div>
      )}
    </>
  );
}
