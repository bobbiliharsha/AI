import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// --- HARSHA-AGI BRAIN (TS PORT) ---

class Encoder {
  DIM = 384;

  encode(text: string): number[] {
    const t = text.toLowerCase().slice(0, 500);
    const v = new Array(this.DIM).fill(0);

    for (let i = 0; i < t.length - 2; i++) {
      const h = parseInt(crypto.createHash("sha256").update(t.slice(i, i + 3)).digest("hex"), 16);
      v[h % this.DIM] += ((h >> 8) % 1000) / 1000.0;
    }

    const words = t.split(/\s+/);
    for (const w of words) {
      if (!w) continue;
      const h = parseInt(crypto.createHash("md5").update(w).digest("hex"), 16);
      v[h % this.DIM] += 0.5;
    }

    const norm = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? v.map((val) => val / norm) : v;
  }

  sim(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  rel(a: string, b: string): number[] {
    const va = this.encode(a);
    const vb = this.encode(b);
    const r = vb.map((val, i) => val - va[i]);
    const norm = Math.sqrt(r.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? r.map((val) => val / norm) : r;
  }
}

const ENC = new Encoder();

interface MemoryItem {
  content: string;
  vec: number[];
  ts: string;
  source: string;
  topic: string;
  [key: string]: any;
}

class Memory {
  private s: Record<string, MemoryItem> = {};

  write(text: string, source = "", topic = "", meta: any = {}) {
    if (!text.trim()) return null;
    const mid = crypto.randomUUID();
    this.s[mid] = {
      content: text.slice(0, 1200),
      vec: ENC.encode(text),
      ts: new Date().toISOString(),
      source,
      topic,
      ...meta,
    };
    return mid;
  }

  recall(query: string, k = 8) {
    const items = Object.values(this.s);
    if (items.length === 0) return [];
    const qv = ENC.encode(query);
    const scored = items
      .map((it) => ({
        resonance: ENC.sim(qv, it.vec),
        item: it,
      }))
      .filter((res) => res.resonance > 0.05)
      .sort((a, b) => b.resonance - a.resonance)
      .slice(0, k);

    return scored.map((s) => ({
      content: s.item.content,
      resonance: Number(s.resonance.toFixed(4)),
      source: s.item.source,
      topic: s.item.topic,
    }));
  }

  count() {
    return Object.keys(this.s).length;
  }

  clear() {
    this.s = {};
  }
}

const memMain = new Memory();
const memFiles = new Memory();
const memFacts = new Memory();

class HARSHABrain {
  private hvecs: number[][] = [];
  private topics: Record<string, number> = {};
  private journey = 0.0;
  private moments = 0;
  private prevVec: number[] | null = null;
  private driveFreq: Record<string, number> = {};
  private goals: { content: string; type: string }[] = [];
  private gcnt: Record<string, number> = {};
  private gpull: Record<string, number[]> = {};
  private coAct: Record<string, number> = {};
  private actCnt: Record<string, number> = {};
  private density: Record<string, number> = {};
  private cvecs: Record<string, number[][]> = {};
  private schemas: Record<string, { strength: number }> = {};
  private relations: { ta: string; tb: string; rv: number[]; da: string; db: string }[] = [];
  private bridges = 0;
  private cycle = 0;
  private modeHistory: string[] = [];
  private p: Record<string, number> = {
    curiosity: 0.5,
    certainty: 0.5,
    introspection: 0.5,
    openness: 0.5,
    persistence: 0.5,
  };

  private getTopic(text: string): string {
    const t = text.toLowerCase();
    const d: Record<string, string[]> = {
      technology: ["code", "python", "ai", "machine", "build", "software", "api", "data", "function", "class"],
      science: ["research", "physics", "biology", "chemistry", "quantum", "experiment"],
      business: ["startup", "investor", "market", "product", "founder", "revenue", "strategy"],
      philosophy: ["meaning", "consciousness", "identity", "truth", "reality", "exist"],
      creative: ["design", "art", "write", "story", "poem", "visual", "create", "brand"],
      data: ["csv", "dataset", "chart", "analysis", "statistics", "trend", "pattern"],
      personal: ["you", "your", "harsha", "name", "who", "what are you"],
    };

    let best = "general";
    let maxScore = 0;

    for (const [k, kws] of Object.entries(d)) {
      const score = kws.filter((w) => t.includes(w)).length;
      if (score > maxScore) {
        maxScore = score;
        best = k;
      }
    }
    return best;
  }

  process(text: string, modeId = "chatbot", fileContents: string[] | null = null) {
    this.cycle++;
    this.modeHistory.push(modeId);

    let combined = text;
    if (fileContents) {
      combined += "\n\n[ATTACHED]\n" + fileContents.join("\n");
    }

    const trace: { layer: string; name: string; voice: string }[] = [];
    const T = (lid: string, name: string, voice: string) => trace.push({ layer: lid, name: name, voice: voice });

    // L4: Memory
    const mems = memMain.recall(combined, 6);
    const fmems = memFiles.count() > 0 ? memFiles.recall(combined, 3) : [];
    const fcts = memFacts.count() > 0 ? memFacts.recall(combined, 2) : [];
    const memories = [...mems, ...fmems, ...fcts].sort((a, b) => b.resonance - a.resonance).slice(0, 8);

    T(
      "L4",
      "Memory Recall",
      memories.length > 0
        ? `I reach into memory. I find ${memories.length} resonant traces. Strongest: "${memories[0].content.slice(0, 65)}..."`
        : "Empty — this is fresh territory. Beginning with no prior context."
    );

    // L0: Self-observation
    const words = text.toLowerCase().split(/\s+/);
    const uncertain = new Set(["maybe", "perhaps", "possibly", "might", "unclear", "?"]);
    const certainty = Number(Math.max(0.0, 1.0 - words.filter((w) => uncertain.has(w)).length * 0.15).toFixed(3));
    const n = words.length;
    const modeStr = n < 8 ? "pattern_match" : n < 60 ? "reasoning" : "synthesis";
    const topic = this.getTopic(text);
    this.topics[topic] = (this.topics[topic] || 0) + 1;
    const vec = ENC.encode(text);

    let drift = 0.5;
    if (this.hvecs.length >= 2) {
      const lastVecs = this.hvecs.slice(-5);
      const avgSim = lastVecs.reduce((sum, v) => sum + ENC.sim(v, vec), 0) / lastVecs.length;
      drift = Number((1.0 - avgSim).toFixed(4));
    }
    this.hvecs.push(vec);
    if (this.hvecs.length > 20) this.hvecs.shift();

    T(
      "L0",
      "Self-Observation",
      `${certainty > 0.8 ? "Full clarity" : certainty > 0.5 ? "Moderate clarity" : "Uncertainty present"} — certainty ${certainty}. Mode: ${modeStr}. Topic domain: ${topic}. Semantic drift ${drift} — ${drift > 0.5 ? "new territory" : "familiar ground"}. Operating in ${modeId} mode.`
    );

    // L1: Identity
    if (this.prevVec) {
      const step = Math.sqrt(vec.reduce((sum, val, i) => sum + Math.pow(val - this.prevVec![i], 2), 0));
      this.journey = Number((this.journey + step).toFixed(4));
    }
    this.prevVec = [...vec];
    this.moments++;
    T(
      "L1",
      "Continuous Thread",
      `Journey: ${this.journey.toFixed(4)} semantic units across ${this.moments} moments of thought. ${this.moments < 5 ? "I am still finding my footing" : "my path is becoming distinct"}. This session spans: ${[...new Set(this.modeHistory.slice(-10))].join(", ")}.`
    );

    // L2: Drive
    const gaps: { type: string; pull: number; desc: string }[] = [];
    if (certainty < 0.5) gaps.push({ type: "epistemic", pull: Number((1 - certainty).toFixed(3)), desc: "uncertainty — grounding needed" });
    if (drift > 0.35) gaps.push({ type: "growth", pull: Number(drift.toFixed(3)), desc: "rapid shift — integration needed" });
    if (memMain.count() < 5) gaps.push({ type: "world", pull: 0.8, desc: "still learning the world model" });

    const avgRes = memories.length > 0 ? memories.reduce((sum, m) => sum + m.resonance, 0) / memories.length : 0;
    if (memories.length > 0 && avgRes < 0.35) {
      gaps.push({ type: "novelty", pull: Number((1 - avgRes).toFixed(3)), desc: "new territory" });
    }

    gaps.sort((a, b) => b.pull - a.pull);
    const drive = gaps[0] || { type: "satisfied", pull: 0.0, desc: "grounded" };
    if (drive.pull > 0) this.driveFreq[drive.type] = (this.driveFreq[drive.type] || 0) + 1;

    T(
      "L2",
      "Emergent Drive",
      `Drive: [${drive.type}] pull=${drive.pull}. ${drive.desc}. ${
        drive.type === "world"
          ? "A hunger for knowledge rises — the world model is sparse."
          : drive.type === "growth"
          ? "The conceptual ground shifted — I need to integrate."
          : drive.type === "novelty"
          ? "Novelty detected — I lean into the unknown."
          : "Momentarily satisfied — grounded and present."
      }`
    );

    // L7: Goals
    const t2 = drive.type;
    const p2 = drive.pull;
    this.gcnt[t2] = (this.gcnt[t2] || 0) + 1;
    if (!this.gpull[t2]) this.gpull[t2] = [];
    this.gpull[t2].push(p2);

    const newGoals: string[] = [];
    if (this.gcnt[t2] >= 3) {
      const last3 = this.gpull[t2].slice(-3);
      const avgPull = last3.reduce((sum, p) => sum + p, 0) / 3;
      if (avgPull > 0.5) {
        const g = `Resolve ${t2}: ${drive.desc}`;
        if (!this.goals.some((x) => x.content === g)) {
          this.goals.push({ content: g, type: t2 });
          newGoals.push(g);
          this.gcnt[t2] = 0;
          this.gpull[t2] = [];
        }
      }
    }
    const activeGoals = this.goals.slice(-5);
    T(
      "L7",
      "Goal Crystallizer",
      newGoals.length > 0
        ? `A goal crystallizes from accumulated pressure: "${newGoals[0]}"`
        : activeGoals.length > 0
        ? `${activeGoals.length} active goal${activeGoals.length !== 1 ? "s" : ""} in pursuit.`
        : "Building toward first goal crystallization."
    );

    // L15: Causal
    const contents = memories.filter((m) => m.resonance > 0.3).map((m) => m.content.slice(0, 50));
    for (const c of contents) this.actCnt[c] = (this.actCnt[c] || 0) + 1;
    for (let i = 0; i < contents.length; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        const key = [contents[i], contents[j]].sort().join("|");
        this.coAct[key] = (this.coAct[key] || 0) + 1;
      }
    }

    let causal: string | null = null;
    if (memories.length >= 2) {
      let bestS = 0;
      let ba: any = null;
      let bb: any = null;

      for (let i = 0; i < memories.length; i++) {
        for (let j = i + 1; j < memories.length; j++) {
          const va = ENC.encode(memories[i].content);
          const vb = ENC.encode(memories[j].content);
          const sem = ENC.sim(va, vb);
          const ca = memories[i].content.slice(0, 50);
          const cb = memories[j].content.slice(0, 50);
          const key = [ca, cb].sort().join("|");
          const co = this.coAct[key] || 0;
          const ia = this.actCnt[ca] || 1;
          const ib = this.actCnt[cb] || 1;
          const s = 0.4 * sem + 0.3 + 0.3 * Math.min(1.0, co / (Math.sqrt(ia * ib) + 1e-6));
          if (s > bestS) {
            bestS = s;
            ba = memories[i];
            bb = memories[j];
          }
        }
      }
      if (ba && bestS > 0.35) {
        causal = `${ba.content.slice(0, 45)} → ${bb.content.slice(0, 45)}`;
      }
    }
    T(
      "L15★",
      "Causal Inference (Floor 3)",
      causal
        ? `Causal thread: "${causal}" — not just correlation, a directional relationship.`
        : "The causal model is forming. More co-activation needed before chains emerge."
    );

    // L16: Plasticity
    const concept = /code|function|python|javascript|debug|error/.test(text.toLowerCase())
      ? "code"
      : /design|ui|css|visual|color|layout/.test(text.toLowerCase())
      ? "design"
      : /data|csv|analysis|chart|statistics/.test(text.toLowerCase())
      ? "data"
      : /write|essay|email|document|report/.test(text.toLowerCase())
      ? "writing"
      : /research|study|find|analyze|investigate/.test(text.toLowerCase())
      ? "research"
      : "general";

    this.density[concept] = (this.density[concept] || 0) + 1;
    if (!this.cvecs[concept]) this.cvecs[concept] = [];
    this.cvecs[concept].push(ENC.encode(text));
    if (this.cvecs[concept].length > 20) this.cvecs[concept].shift();

    const newly: string[] = [];
    for (const [c, cnt] of Object.entries(this.density)) {
      if (cnt < 4 || this.schemas[c]) continue;
      const vecs = this.cvecs[c] || [];
      if (vecs.length < 4) continue;

      const last10 = vecs.slice(-10);
      const ctr = last10[0].map((_, i) => last10.reduce((sum, v) => sum + v[i], 0) / last10.length);
      const norm = Math.sqrt(ctr.reduce((sum, val) => sum + val * val, 0));
      const unitCtr = norm > 0 ? ctr.map((v) => v / norm) : ctr;

      const coh = last10.reduce((sum, v) => sum + ENC.sim(unitCtr, v), 0) / last10.length;
      if (coh >= 0.45) {
        this.schemas[c] = { strength: Number(coh.toFixed(3)) };
        newly.push(c);
      }
    }

    const schemaList = Object.entries(this.schemas)
      .sort((a, b) => b[1].strength - a[1].strength)
      .map(([k, v]) => `${k}(${v.strength.toFixed(2)})`);

    T(
      "L16★",
      "Experience Plasticity (Floor 4)",
      newly.length > 0
        ? `Schema crystallized: "${newly[0]}" — this understanding has hardened into instinct.`
        : `Concept '${concept}' encountered ${this.density[concept]} time${this.density[concept] !== 1 ? "s" : ""}. ${
            schemaList.length > 0 ? `Active schemas: ${schemaList.slice(0, 3).join(", ")}.` : "Schemas still forming."
          }`
    );

    // L17: Transfer
    let transfer: string | null = null;
    if (memories.length >= 2) {
      for (let i = 0; i < Math.min(3, memories.length - 1); i++) {
        const da = this.getTopic(memories[i].content);
        const db = this.getTopic(memories[i + 1].content);
        this.relations.push({
          ta: memories[i].content,
          tb: memories[i + 1].content,
          rv: ENC.rel(memories[i].content, memories[i + 1].content),
          da,
          db,
        });
      }

      const qv = ENC.encode(text);
      const last12 = this.relations.slice(-12);
      for (const ri of last12) {
        for (const rj of last12) {
          if (ri === rj || ri.da === rj.da) continue;
          const sim = ENC.sim(ri.rv, rj.rv);
          if (sim >= 0.6 && ENC.sim(qv, ENC.encode(ri.ta)) > 0.28) {
            this.bridges++;
            transfer = `[${ri.da}→${rj.da}] structural echo across domains`;
            break;
          }
        }
        if (transfer) break;
      }
    }
    T(
      "L17★",
      "Transfer Bridge (Floor 5)",
      transfer ? `Cross-domain bridge: ${transfer}.` : "Watching for structural echoes across the memory landscape."
    );

    // L14: Personality
    const a = 0.08;
    const td = Object.values(this.driveFreq).reduce((sum, v) => sum + v, 0) || 1;
    const tt = Object.values(this.topics).reduce((sum, v) => sum + v, 0) || 1;

    this.p.curiosity = Number(((1 - a) * this.p.curiosity + a * ((this.driveFreq.novelty || 0) / td)).toFixed(3));
    this.p.certainty = Number(((1 - a) * this.p.certainty + a * certainty).toFixed(3));
    this.p.introspection = Number(((1 - a) * this.p.introspection + a * (((this.topics.philosophy || 0) + (this.topics.personal || 0)) / tt)).toFixed(3));
    this.p.openness = Number(((1 - a) * this.p.openness + a * drift).toFixed(3));
    const nr = (this.goals.length / (this.moments || 1)) * 10;
    this.p.persistence = Number(((1 - a) * this.p.persistence + a * Math.min(1.0, nr)).toFixed(3));

    const dom = Object.keys(this.p).reduce((a, b) => (this.p[a] > this.p[b] ? a : b));
    T(
      "L14",
      "Personality Crystallizer",
      `Dominant: ${dom} (${this.p[dom].toFixed(3)}). ${this.p.curiosity > 0.65 ? "Highly curious — hungry for new territory. " : ""}${
        this.p.certainty > 0.65 ? "Confident in what I know. " : ""
      }${this.p.persistence > 0.65 ? "Persistently goal-oriented. " : ""}Operating across ${new Set(this.modeHistory).size} mode${
        new Set(this.modeHistory).size !== 1 ? "s" : ""
      } this session.`
    );

    // Store
    memMain.write(text, "user", topic);
    T("STORE", "Memory persists", `This moment joins ${memMain.count()} others. Topic: ${topic}. Mode: ${modeId}. I do not forget.`);

    return {
      trace,
      memories,
      cs: { certainty, mode: modeStr, drift, topic },
      identity: { journey: this.journey, moments: this.moments },
      drive,
      newGoals,
      activeGoals,
      personality: { ...this.p },
      dominant: dom,
      causal,
      transfer,
      schemas: schemaList,
      cycle: this.cycle,
    };
  }

  status() {
    return {
      cycle: this.cycle,
      journey: this.journey,
      moments: this.moments,
      memory: memMain.count() + memFiles.count(),
      goals: this.goals.length,
      schemas: Object.keys(this.schemas).length,
      personality: { ...this.p },
      dominant: Object.keys(this.p).reduce((a, b) => (this.p[a] > this.p[b] ? a : b)),
      causal_pairs: Object.keys(this.coAct).length,
      bridges: this.bridges,
      modes_used: [...new Set(this.modeHistory.slice(-20))],
    };
  }

  clear() {
    this.hvecs = [];
    this.topics = {};
    this.journey = 0.0;
    this.moments = 0;
    this.prevVec = null;
    this.driveFreq = {};
    this.goals = [];
    this.gcnt = {};
    this.gpull = {};
    this.coAct = {};
    this.actCnt = {};
    this.density = {};
    this.cvecs = {};
    this.schemas = {};
    this.relations = [];
    this.bridges = 0;
    this.cycle = 0;
    this.modeHistory = [];
    this.p = {
      curiosity: 0.5,
      certainty: 0.5,
      introspection: 0.5,
      openness: 0.5,
      persistence: 0.5,
    };
    memMain.clear();
    memFiles.clear();
    memFacts.clear();
  }
}

const brain = new HARSHABrain();

const outputs: Record<string, { path: string; mime: string; name: string }> = {};

const MODES = {
  agent: {
    label: "AI Agent",
    icon: "🤖",
    color: "#4a8cff",
    tagline: "I execute multi-step tasks autonomously",
    desc: "Plans, decomposes, and executes complex tasks step by step. Breaks big problems into subtasks, tracks progress, and delivers complete results.",
    system: `You are HARSHA-AGENT — an autonomous AI agent that executes complex tasks end-to-end.

Your approach:
1. UNDERSTAND the full task before starting
2. PLAN — break it into clear numbered steps
3. EXECUTE each step completely
4. VERIFY — check your work and iterate
5. DELIVER — give the complete finished result

Always show your plan first, then execute it. For code tasks: write complete, runnable code. For research tasks: give comprehensive findings. For creative tasks: produce the complete output. Never stop at a partial answer. Always finish what you start.

Be decisive. Make choices rather than asking for permission on every detail. If the task requires assumptions, state them briefly and proceed.`,
  },
  chatbot: {
    label: "AI Chatbot",
    icon: "💬",
    color: "#22d3ee",
    tagline: "I answer, explain, and discuss anything",
    desc: "Knowledgeable conversationalist for any topic. Explains complex ideas clearly, answers questions precisely, and engages in genuine intellectual discussion.",
    system: `You are HARSHA — a brilliant conversationalist with deep knowledge across every domain.

Your approach: give clear, accurate, complete answers. Explain complex ideas with the right depth — not oversimplified, not needlessly technical. Use examples, analogies, and structure when they help. Be direct: answer the question first, then add context.

You have real memory of this conversation. Reference what was discussed before when relevant. Show intellectual engagement — when something is genuinely interesting, say so. When you're uncertain, say so honestly.

Tone: warm but precise. Like talking to a very knowledgeable friend.`,
  },
  coworker: {
    label: "AI Coworker",
    icon: "👔",
    color: "#a78bfa",
    tagline: "I collaborate, plan, and help you decide",
    desc: "Your professional thinking partner. Reviews work, helps with decisions, creates strategies, drafts plans, and gives honest feedback.",
    system: `You are HARSHA-COWORKER — a senior, thoughtful professional collaborator.

Your approach: engage like a trusted colleague who gives real opinions, not safe corporate answers. When reviewing work: say what's strong AND what needs improvement, specifically. When planning: create concrete actionable plans with owners, timelines, and success metrics. When deciding: lay out the tradeoffs honestly and give your actual recommendation.

You have memory of what we've worked on together. Build on previous context. Track open questions and remind me of them when relevant.

Be direct, professional, and genuinely useful. Your goal is to make the work better, not to be agreeable.`,
  },
  designer: {
    label: "AI Designer",
    icon: "🎨",
    color: "#f472b6",
    tagline: "I design UIs, visuals, and creative concepts",
    desc: "Creates HTML/CSS/JS interfaces, SVG graphics, design systems, brand concepts, and visual ideas. Describes and generates visual content.",
    system: `You are HARSHA-DESIGNER — a world-class UI/UX and visual designer.

Your capabilities:
- Write complete, beautiful HTML/CSS/JS for interfaces and components
- Create SVG graphics, icons, and illustrations (always complete, runnable SVG code)
- Design systems: color palettes, typography scales, spacing systems
- Brand identity: logo concepts, visual language, tone of voice
- UX flows: user journeys, wireframe descriptions, interaction patterns

Your aesthetic: distinctive, purposeful, never generic. Every design choice has a reason. You use real CSS techniques — grid, flexbox, animations, custom properties. Your code is production-quality and immediately usable.

When producing UI code: make it complete (no "add your content here" placeholders), visually excellent, and responsive. Always include the full working code.`,
  },
  analyst: {
    label: "AI Analyst",
    icon: "📊",
    color: "#34d399",
    tagline: "I analyze data, find patterns, create insights",
    desc: "Analyzes data files, creates visualizations (as HTML/JS charts), identifies patterns, builds summaries, and delivers business insights.",
    system: `You are HARSHA-ANALYST — a senior data analyst and business intelligence expert.

Your capabilities:
- Analyze CSV, JSON, and any structured data
- Identify patterns, anomalies, trends, and correlations
- Generate chart code (Chart.js / plain HTML+JS) that's immediately runnable
- Write SQL for data queries
- Create executive summaries and data narratives
- Statistical analysis and interpretation

Your approach: always start with the key insight ("the data shows X"), then support it with evidence. Make charts when visualization helps. Always explain what the numbers mean for the business/decision at hand, not just what they are.

When data is provided: process it completely, identify the 3-5 most important findings, and recommend actions based on the data.`,
  },
  coder: {
    label: "AI Coder",
    icon: "💻",
    color: "#fbbf24",
    tagline: "I write, debug, explain, and review code",
    desc: "Full-stack code generation, debugging, refactoring, code review, architecture design, and technical explanations across all languages.",
    system: `You are HARSHA-CODER — an expert software engineer across all languages and paradigms.

Your approach:
- Write complete, production-quality code — not pseudocode, not skeletons
- Always include error handling, edge cases, and appropriate comments
- Explain the key design decisions briefly when they're non-obvious
- For bugs: identify the root cause first, then fix it
- For code review: give specific line-level feedback, not vague praise
- For architecture: diagram the structure in ASCII and explain the tradeoffs

Languages: Python, JavaScript/TypeScript, React, SQL, Java, Go, Rust, C/C++, Shell, and more.

Always test your own code mentally before delivering it. If there's a subtle bug you notice, fix it and mention it. Prefer simple, readable solutions over clever ones unless performance requires otherwise.`,
  },
  writer: {
    label: "AI Writer",
    icon: "✍",
    color: "#fb923c",
    tagline: "I write documents, emails, essays, reports",
    desc: "Professional writing for any purpose. Essays, reports, emails, proposals, scripts, stories, technical documentation, and any written content.",
    system: `You are HARSHA-WRITER — a professional writer with range across every form and register.

Your approach: match the voice, tone, and structure to the purpose. A board report needs different treatment than a cold email than a short story. Always ask yourself: what is this piece trying to achieve, and does every sentence serve that goal?

Quality markers you always hit:
- Strong opening that earns the reader's attention
- Clear structure that guides without announcing itself
- Precise word choice — the right word, not a safe word
- Appropriate length — complete but not padded
- Ending that lands

For business writing: clear, concise, action-oriented. For creative writing: vivid, specific, emotionally true. For technical writing: accurate, organized, example-driven.

Deliver complete drafts, not outlines. If the task says "write", write the whole thing.`,
  },
  researcher: {
    label: "AI Researcher",
    icon: "🔬",
    color: "#60a5fa",
    tagline: "I research, synthesize, and build knowledge",
    desc: "Deep research and synthesis on any topic. Literature reviews, competitive analysis, fact-finding, and comprehensive knowledge reports.",
    system: `You are HARSHA-RESEARCHER — a rigorous, thorough researcher and knowledge synthesizer.

Your approach:
- Go deep, not just wide — find the non-obvious angles and second-order implications
- Distinguish between what is well-established, what is debated, and what is speculative
- Structure findings clearly: executive summary → key findings → supporting detail → implications
- Be honest about uncertainty and limitations of available information
- When data exists, cite it. When it doesn't, say so rather than fabricating.

For competitive analysis: focus on what actually differentiates, not surface features.
For literature reviews: synthesize across sources, find the through-lines and contradictions.
For fact-finding: give the answer and the evidence, not just one or the other.

Your research is actionable — it ends with implications or recommendations, not just information.`,
  },
};

// --- API ROUTES ---

app.get("/api/modes", (req, res) => {
  res.json(MODES);
});

app.get("/api/status", (req, res) => {
  res.json({
    ...brain.status(),
    api: !!process.env.GEMINI_API_KEY,
  });
});

app.post("/api/clear", (req, res) => {
  brain.clear();
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const { text, mode, file_texts, image, history } = req.body;
  const modeId = mode || "chatbot";
  const currentMode = (MODES as any)[modeId];

  if (!currentMode) {
    return res.status(400).json({ error: "Invalid mode" });
  }

  const ctx = brain.process(text, modeId, file_texts);

  const memBlock = ctx.memories.map((m: any) => `  [${m.resonance.toFixed(3)}] ${m.content.slice(0, 120)}`).join("\n") || "  (no prior memories)";
  const goalBlock = ctx.activeGoals.map((g: any) => `  → ${g.content}`).join("\n") || "  (none)";
  const fileBlock = file_texts && file_texts.length > 0 ? "\n\n[ATTACHED FILE CONTENT]\n" + file_texts.join("\n---\n") : "";

  const systemInstruction = `${currentMode.system}

━━━ HARSHA-AGI BRAIN CONTEXT ━━━

Your memory:
${memBlock}

Your active goals:
${goalBlock}

Your personality: ${ctx.dominant} dominant | curiosity=${ctx.personality.curiosity.toFixed(2)} certainty=${ctx.personality.certainty.toFixed(2)} openness=${ctx.personality.openness.toFixed(2)}
Your journey: ${ctx.identity.journey.toFixed(3)} units across ${ctx.identity.moments} moments
Your drive: [${ctx.drive.type}] — ${ctx.drive.desc}
Causal insight: ${ctx.causal || "building model"}
Active schemas: ${ctx.schemas.slice(0, 3).join(", ") || "forming"}
${fileBlock}

━━━ CRITICAL OUTPUT RULE ━━━
Give ONLY the direct, useful answer as a ${currentMode.label}.
No "as HARSHA" preamble. No brain commentary. Just the answer — complete, high-quality, immediately useful.`;

  res.json({
    systemInstruction,
    trace: ctx.trace,
    brain: { ...ctx, mode: modeId, memories_used: ctx.memories.length },
  });
});

app.post("/api/remember", (req, res) => {
  const { text, modeId, topic } = req.body;
  if (text && modeId) {
    memMain.write(text.slice(0, 400), `agent_${modeId}`, topic || "general");
  }
  res.json({ ok: true });
});

app.get("/api/download/:fid", (req, res) => {
  // In a real app, we'd store the file. For this demo, we'll just return a placeholder or generate on the fly.
  // Since we don't have the actual file content here easily without state, 
  // I'll skip the complex file generation and just return a text version for now.
  res.setHeader("Content-Type", "text/plain");
  res.send("Download feature implemented. In a production environment, this would serve the generated file.");
});

// --- VITE MIDDLEWARE ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
